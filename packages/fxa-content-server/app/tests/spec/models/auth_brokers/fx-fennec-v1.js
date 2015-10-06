/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'chai',
  'lib/channels/null',
  'models/auth_brokers/fx-fennec-v1',
  'models/reliers/relier',
  'models/user',
  'sinon',
  '../../../mocks/window'
],
function (chai, NullChannel, FxFennecV1AuthenticationBroker, Relier,
  User, sinon, WindowMock) {
  'use strict';

  var assert = chai.assert;

  describe('models/auth_brokers/fx-fennec-v1', function () {
    var account;
    var broker;
    var channel;
    var relier;
    var user;
    var windowMock;

    beforeEach(function () {
      channel = new NullChannel();
      relier = new Relier();
      windowMock = new WindowMock();

      user = new User();
      account = user.initAccount({
        email: 'testuser@testuser.com',
        keyFetchToken: 'key-fetch-token',
        unwrapBKey: 'unwrap-b-key'
      });

      broker = new FxFennecV1AuthenticationBroker({
        channel: channel,
        relier: relier,
        window: windowMock
      });

      sinon.spy(broker, 'send');
    });

    it('disables the `chooseWhatToSyncCheckbox` capability', function () {
      return broker.fetch()
        .then(function () {
          assert.isFalse(broker.hasCapability('chooseWhatToSyncCheckbox'));
        });
    });

    describe('afterForceAuth', function () {
      it('notifies the channel of `login`, redirects to `/force_auth_complete`', function () {
        return broker.afterForceAuth(account)
          .then(function (behavior) {
            assert.isTrue(broker.send.calledWith('fxaccounts:login'));
            assert.equal(behavior.endpoint, 'force_auth_complete');
          });
      });
    });

    describe('afterSignIn', function () {
      it('notifies the channel of `login`, redirects to `/signin_complete`', function () {
        return broker.afterSignIn(account)
          .then(function (behavior) {
            assert.isTrue(broker.send.calledWith('fxaccounts:login'));
            assert.equal(behavior.endpoint, 'signin_complete');
          });
      });
    });

    describe('afterSignUp', function () {
      it('causes a redirect to `/choose_what_to_sync` if `chooseWhatToSyncWebV1` capability is supported', function () {
        sinon.stub(broker, 'hasCapability', function (capabilityName) {
          return capabilityName === 'chooseWhatToSyncWebV1';
        });

        return broker.afterSignUp(account)
          .then(function (behavior) {
            assert.equal(behavior.endpoint, 'choose_what_to_sync');
          });
      });

      it('does nothing if `chooseWhatToSyncWebV1` capability is unsupported', function () {
        sinon.stub(broker, 'hasCapability', function (capabilityName) {
          return false;
        });

        return broker.afterSignUp(account)
          .then(function (behavior) {
            assert.isUndefined(behavior);
          });
      });
    });

    describe('afterSignUpConfirmationPoll', function () {
      it('redirects to `/signup_complete`', function () {
        return broker.afterSignUpConfirmationPoll(account)
          .then(function (behavior) {
            assert.equal(behavior.endpoint, 'signup_complete');
          });
      });
    });

    describe('beforeSignUpConfirmationPoll', function () {
      it('notifies the channel of `login`, does not halt the flow', function () {
        return broker.beforeSignUpConfirmationPoll(account)
          .then(function (behavior) {
            assert.isTrue(broker.send.calledWith('fxaccounts:login'));
            assert.isUndefined(behavior.halt);
          });
      });
    });

    describe('openSyncPreferences', function () {
      it('sends the `fxaccounts:sync_preferences` message', function () {
        return broker.openSyncPreferences()
          .then(function () {
            assert.isTrue(broker.send.calledWith('fxaccounts:sync_preferences'));
          });
      });
    });
  });
});


