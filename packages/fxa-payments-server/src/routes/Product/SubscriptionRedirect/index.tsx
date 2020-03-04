import React, { useContext, useEffect } from 'react';
import { Localized } from 'fluent-react';
import { Plan } from '../../../store/types';
import { AppContext } from '../../../lib/AppContext';

import { metadataFromPlan } from '../../../store/utils';
import { SelectorReturns } from '../../../store/selectors';

import './index.scss';
import PlanDetails from '../../../components/PlanDetails';
import PaymentConfirmation from '../../../components/PaymentConfirmation';
import Header from '../../../components/Header';

const isMobile = window.matchMedia(
  '(max-width: 520px), (orientation: landscape) and (max-width: 640px)'
).matches;

const defaultProductRedirectURL = 'https://mozilla.org';

export type SubscriptionRedirectProps = {
  customer: SelectorReturns['customer'];
  plan: Plan;
  profile: SelectorReturns['profile'];
};

export const SubscriptionRedirect = ({
  customer,
  plan,
  profile,
}: SubscriptionRedirectProps) => {
  const { product_id } = plan;
  const { downloadURL } = metadataFromPlan(plan);
  const {
    config: { productRedirectURLs },
  } = useContext(AppContext);

  const redirectUrl =
    downloadURL || productRedirectURLs[product_id] || defaultProductRedirectURL;

  return (
    <>
      <Header {...{ profile: profile.result }} />
      <div className="main-content">
        <PaymentConfirmation
          {...{
            profile: profile.result,
            selectedPlan: plan,
            customer: customer.result,
            redirectUrl,
          }}
        />
        <PlanDetails
          {...{
            selectedPlan: plan,
            showExpandButton: isMobile,
          }}
        />
      </div>
    </>
  );
};

export default SubscriptionRedirect;
