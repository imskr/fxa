import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import waitForExpect from 'wait-for-expect';

import { Omit } from '../../lib/types';
import { Plan } from '../../store/types';

jest.mock('../../lib/sentry');

import {
  mockStripeElementOnChangeFns,
  mockStripeElementOnBlurFns,
  elementChangeResponse,
  MOCK_PLANS,
  setupFluentLocalizationTest,
  getLocalizedMessage,
} from '../../lib/test-utils';

import PaymentForm, { PaymentFormProps, localeToStripeLocale } from './index';
import { getLocalizedCurrency } from '../../lib/formats';

const findMockPlan = (planId: string): Plan => {
  const plan = MOCK_PLANS.find((x) => x.plan_id === planId);
  if (plan) {
    return plan;
  }
  throw new Error('unable to find suitable Plan object for test execution.');
};

const MOCK_PLAN = {
  plan_id: 'plan_123',
  product_id: '123doneProProduct',
  product_name: 'Example Product',
  currency: 'USD',
  amount: 1050,
  interval: 'month' as const,
  interval_count: 1,
};

afterEach(cleanup);

// Redefine onPayment and onPaymentError as optional so we can supply mock
// functions by default in Subject.
type SubjectProps = Omit<
  PaymentFormProps,
  'onSubmit' | 'onMounted' | 'onEngaged' | 'onChange' | 'submitNonce'
> & {
  onSubmit?: PaymentFormProps['onSubmit'];
  onMounted?: PaymentFormProps['onMounted'];
  onEngaged?: PaymentFormProps['onEngaged'];
  onChange?: PaymentFormProps['onChange'];
  submitNonce?: string;
};
const Subject = ({
  onSubmit = jest.fn(),
  onMounted = jest.fn(),
  onEngaged = jest.fn(),
  onChange = jest.fn(),
  submitNonce = 'test-nonce',
  ...props
}: SubjectProps) => {
  return (
    <PaymentForm
      {...{
        onSubmit,
        onMounted,
        onEngaged,
        onChange,
        submitNonce,
        getString: null,
        ...props,
      }}
    />
  );
};

describe('localeToStripeLocale', () => {
  it('handles known Stripe locales as expected', () => {
    expect(localeToStripeLocale('ar')).toEqual('ar');
  });
  it('handles locales with subtags as expected', () => {
    expect(localeToStripeLocale('en-GB')).toEqual('en');
  });
  it('handles empty locales as "auto"', () => {
    expect(localeToStripeLocale()).toEqual('auto');
  });
  it('handles unknown Stripe locales as "auto"', () => {
    expect(localeToStripeLocale('xx-pirate')).toEqual('auto');
  });
});

it('renders all expected default fields and elements', () => {
  const { container, queryAllByTestId, getByTestId } = render(<Subject />);

  expect(container.querySelector('button.cancel')).not.toBeInTheDocument();
  expect(container.querySelector('span.spinner')).not.toBeInTheDocument();
  expect(getByTestId('submit')).toHaveAttribute('disabled');

  for (let testid of ['name', 'cardElement']) {
    expect(queryAllByTestId(testid).length).toEqual(1);
  }
});

it('renders error tooltips for invalid stripe elements', () => {
  const { getByTestId } = render(<Subject />);

  const mockErrors = {
    cardElement: 'CARD BAD',
  };

  act(() => {
    for (const [testid, errorMessage] of Object.entries(mockErrors)) {
      mockStripeElementOnChangeFns[testid](
        elementChangeResponse({ errorMessage, value: 'foo' })
      );
      mockStripeElementOnBlurFns[testid](
        elementChangeResponse({ errorMessage, value: 'foo' })
      );
    }
  });

  for (const [testid, expectedMessage] of Object.entries(mockErrors)) {
    const el = getByTestId(testid);
    const tooltipEl = (el.parentNode?.parentNode as ParentNode).querySelector(
      '.tooltip'
    );
    expect(tooltipEl).not.toBeNull();
    expect((tooltipEl as Node).textContent).toEqual(expectedMessage);
  }
});

const renderWithValidFields = (props?: SubjectProps) => {
  const renderResult = render(<Subject {...props} />);
  const { getByTestId } = renderResult;

  expect(getByTestId('submit')).toHaveAttribute('disabled');
  fireEvent.change(getByTestId('name'), { target: { value: 'Foo Barson' } });
  fireEvent.blur(getByTestId('name'));

  const stripeFields = ['cardElement'];

  act(() => {
    for (const testid of stripeFields) {
      mockStripeElementOnChangeFns[testid](
        elementChangeResponse({ complete: true, value: 'test' })
      );
    }
  });

  return renderResult;
};

it('enables submit button when all fields are valid', () => {
  let { getByTestId } = renderWithValidFields();
  expect(getByTestId('submit')).not.toHaveAttribute('disabled');
});

it('calls onMounted and onEngaged', () => {
  const onMounted = jest.fn();
  const onEngaged = jest.fn();

  renderWithValidFields({ onMounted, onEngaged });

  expect(onMounted).toBeCalledTimes(1);
  expect(onEngaged).toBeCalledTimes(1);
});

it('when confirm = true, enables submit button when all fields are valid and checkbox checked', () => {
  let { getByTestId } = renderWithValidFields({
    confirm: true,
    plan: MOCK_PLAN,
  });
  expect(getByTestId('submit')).toHaveAttribute('disabled');
  fireEvent.click(getByTestId('confirm'));
  expect(getByTestId('submit')).not.toHaveAttribute('disabled');
});

it('omits the confirmation checkbox when confirm = false', () => {
  const { queryByTestId } = render(<Subject {...{ confirm: false }} />);
  expect(queryByTestId('confirm')).not.toBeInTheDocument();
});

it('includes the confirmation checkbox when confirm = true and plan supplied', () => {
  const { queryByTestId } = render(
    <Subject {...{ confirm: true, plan: MOCK_PLAN }} />
  );
  expect(queryByTestId('confirm')).toBeInTheDocument();
});

describe('Legal', () => {
  describe('links', () => {
    const commonLegalLinkTest = (plan?: Plan) => () => {
      const { queryByText } = render(<Subject {...{ plan }} />);
      [
        queryByText('Terms of Service'),
        queryByText('Privacy Notice'),
      ].forEach((q) =>
        plan ? expect(q).toBeInTheDocument() : expect(q).not.toBeInTheDocument()
      );
    };
    it(
      'omits terms of service and privacy notice links when plan is missing',
      commonLegalLinkTest()
    );
    it(
      'includes terms of service and privacy notice links when plan is supplied',
      commonLegalLinkTest(MOCK_PLAN)
    );
  });

  describe('rendering the legal checkbox Localized component', () => {
    function runTests(plan: Plan, expectedMsgId: string, expectedMsg: string) {
      const testRenderer = TestRenderer.create(
        <Subject {...{ confirm: true, plan: plan }} />
      );
      const testInstance = testRenderer.root;
      const legalCheckbox = testInstance.findByProps({ id: expectedMsgId });
      const expectedAmount = getLocalizedCurrency(plan.amount, plan.currency);

      expect(legalCheckbox.props.vars.amount).toStrictEqual(expectedAmount);
      expect(legalCheckbox.props.vars.intervalCount).toBe(plan.interval_count);
      expect(legalCheckbox.props.children.props.children).toBe(expectedMsg);
    }

    it('renders Localized for daily plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_daily';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-day';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 daily</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for 6 days plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_6days';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-day';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 days</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for weekly plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_weekly';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-week';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 weekly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for 6 weeks plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_6weeks';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-week';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 weeks</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for monthly plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_monthly';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-month';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 monthly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for 6 months plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_6months';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-month';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 months</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for yearly plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_yearly';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-year';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 yearly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });

    it('renders Localized for years plan with correct props and displays correct default string', async () => {
      const plan_id = 'plan_6years';
      const plan = findMockPlan(plan_id);
      const expectedMsgId = 'payment-confirm-with-legal-links-year';
      const expectedMsg =
        'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 years</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

      runTests(plan, expectedMsgId, expectedMsg);
    });
  });

  describe('Fluent Localized Text', () => {
    const bundle = setupFluentLocalizationTest('en-US');
    const amount = getLocalizedCurrency(500, 'USD');
    const args = {
      amount,
    };

    describe('when the localized id is payment-confirm-with-legal-links-day', () => {
      const msgId = 'payment-confirm-with-legal-links-day';

      it('returns the correct string for an interval count of 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 daily</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 1,
        });
        expect(actual).toEqual(expected);
      });

      it('returns the correct string for an interval count greater than 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 days</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 6,
        });
        expect(actual).toEqual(expected);
      });
    });

    describe('when the localized id is payment-confirm-with-legal-links-week', () => {
      const msgId = 'payment-confirm-with-legal-links-week';

      it('returns the correct string for an interval count of 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 weekly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 1,
        });
        expect(actual).toEqual(expected);
      });

      it('returns the correct string for an interval count greater than 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 weeks</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 6,
        });
        expect(actual).toEqual(expected);
      });
    });

    describe('when the localized id is payment-confirm-with-legal-links-month', () => {
      const msgId = 'payment-confirm-with-legal-links-month';

      it('returns the correct string for an interval count of 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 monthly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 1,
        });
        expect(actual).toEqual(expected);
      });

      it('returns the correct string for an interval count greater than 1', async () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 months</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 6,
        });
        expect(actual).toEqual(expected);
      });
    });

    describe('when the localized id is payment-confirm-with-legal-links-year', () => {
      const msgId = 'payment-confirm-with-legal-links-year';

      it('returns the correct string for an interval count of 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 yearly</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 1,
        });
        expect(actual).toEqual(expected);
      });

      it('returns the correct string for an interval count greater than 1', () => {
        const expected =
          'I authorize Mozilla, maker of Firefox products, to charge my payment method <strong>$5.00 every 6 years</strong>, according to <termsOfServiceLink>Terms of Service</termsOfServiceLink> and <privacyNoticeLink>Privacy Notice</privacyNoticeLink>, until I cancel my subscription.';

        const actual = getLocalizedMessage(bundle, msgId, {
          ...args,
          intervalCount: 6,
        });
        expect(actual).toEqual(expected);
      });
    });
  });
});

it('calls onSubmit when all fields valid and submitted', async () => {
  const onSubmit = jest.fn();
  let { getByTestId } = renderWithValidFields({
    onSubmit,
    onChange: () => {},
  });
  const submitButton = getByTestId('submit');
  expect(submitButton).not.toHaveAttribute('disabled');
  fireEvent.click(submitButton);
  expect(onSubmit).toHaveBeenCalled();
});

it('renders a progress spinner when submitted, disables further submission (issue #4386 / FXA-1275)', async () => {
  const onSubmit = jest.fn();

  const { queryByTestId, getByTestId } = renderWithValidFields({
    onSubmit,
    submitNonce: 'unique-nonce-1',
  });

  const submitButton = getByTestId('submit');
  fireEvent.click(submitButton);

  await waitForExpect(() => expect(onSubmit).toHaveBeenCalled());

  expect(queryByTestId('spinner-submit')).toBeInTheDocument();
  expect(getByTestId('submit')).toHaveAttribute('disabled');

  fireEvent.submit(getByTestId('paymentForm'));
  fireEvent.click(submitButton);

  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('renders a progress spinner when inProgress = true', () => {
  const { queryByTestId } = render(<Subject {...{ inProgress: true }} />);
  expect(queryByTestId('spinner-submit')).toBeInTheDocument();
});

it('renders a progress spinner when inProgress = true and onCancel supplied', () => {
  const onCancel = jest.fn();
  const { queryByTestId } = render(
    <Subject {...{ inProgress: true, onCancel }} />
  );
  expect(queryByTestId('spinner-update')).toBeInTheDocument();
});

it('includes the cancel button when onCancel supplied', () => {
  const { queryByTestId } = render(<Subject {...{ onCancel: jest.fn() }} />);
  expect(queryByTestId('cancel')).toBeInTheDocument();
});

it('displays an error for empty name', () => {
  const { getByText, getByTestId } = render(<Subject />);
  fireEvent.change(getByTestId('name'), { target: { value: '123' } });
  fireEvent.change(getByTestId('name'), { target: { value: '' } });
  fireEvent.blur(getByTestId('name'));
  expect(getByText('Please enter your name')).toBeInTheDocument();
});

it('enables submit button when all fields are valid', () => {
  let { getByTestId } = renderWithValidFields();
  expect(getByTestId('submit')).not.toHaveAttribute('disabled');
});

it('does not call onSubmit if somehow submitted without confirm checked', async () => {
  const onSubmit = jest.fn();
  // renderWithValidFields does not check the confirm box
  let { getByTestId } = renderWithValidFields({
    confirm: true,
    plan: MOCK_PLAN,
    onSubmit,
    onChange: () => {},
  });
  // The user shouldn't be able to click a disabled submit button...
  const submitButton = getByTestId('submit');
  expect(submitButton).toHaveAttribute('disabled');
  // ...but let's force the form to submit and assert nothing happens.
  fireEvent.submit(getByTestId('paymentForm'));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('does not call onSubmit if somehow submitted while in progress', async () => {
  const onSubmit = jest.fn();
  let { getByTestId } = renderWithValidFields({
    inProgress: true,
    onSubmit,
    onChange: () => {},
  });
  // The user shouldn't be able to click a disabled submit button...
  const submitButton = getByTestId('submit');
  expect(submitButton).toHaveAttribute('disabled');
  // ...but let's force the form to submit and assert nothing happens.
  fireEvent.submit(getByTestId('paymentForm'));
  expect(onSubmit).not.toHaveBeenCalled();
});
