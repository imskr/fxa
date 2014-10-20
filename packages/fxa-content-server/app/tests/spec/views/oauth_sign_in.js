/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'chai',
  'jquery',
  'sinon',
  'views/oauth_sign_in',
  'lib/session',
  'lib/fxa-client',
  'lib/promise',
  'models/reliers/relier',
  '../../mocks/window',
  '../../mocks/router',
  '../../lib/helpers'
],
function (chai, $, sinon, View, Session, FxaClient, p, Relier, WindowMock,
      RouterMock, TestHelpers) {
  /*global describe, beforeEach, afterEach, it*/
  var assert = chai.assert;

  describe('views/oauth_sign_in', function () {
    var view;
    var email;
    var router;
    var windowMock;
    var fxaClient;
    var relier;

    var CLIENT_ID = 'dcdb5ae7add825d2';
    var STATE = '123';
    var SCOPE = 'profile:email';
    var CLIENT_NAME = '123Done';

    beforeEach(function () {
      Session.clear();
      email = TestHelpers.createEmail();
      router = new RouterMock();
      windowMock = new WindowMock();
      windowMock.location.search = '?client_id=' + CLIENT_ID + '&state=' + STATE + '&scope=' + SCOPE;

      relier = new Relier();
      relier.set('serviceName', CLIENT_NAME);
      fxaClient = new FxaClient();

      view = new View({
        router: router,
        window: windowMock,
        fxaClient: fxaClient,
        relier: relier
      });

      return view.render()
        .then(function () {
          $('#container').html(view.el);
        });
    });

    afterEach(function () {
      Session.clear();
      view.remove();
      view.destroy();
    });

    describe('render', function () {
      it('displays oAuth client name', function () {
        return view.render()
          .then(function () {
            assert.include($('#fxa-signin-header').text(), CLIENT_NAME);
            // also make sure link is correct
            assert.equal($('.sign-up').attr('href'), '/oauth/signup');
          });
      });

      it('is enabled if prefills are valid', function () {
        Session.set('prefillEmail', 'testuser@testuser.com');
        Session.set('prefillPassword', 'prefilled password');
        return view.render()
          .then(function () {
            assert.isFalse(view.$('button').hasClass('disabled'));
          });
      });
    });

    describe('submit', function () {
      it('signs in a verified user on success', function () {
        var password = 'password';

        sinon.stub(view, 'finishOAuthFlow', function () {
          return p(true);
        });

        sinon.stub(view.fxaClient, 'signIn', function () {
          return p({ verified: true });
        });

        $('.email').val(email);
        $('[type=password]').val(password);
        return view.submit()
          .then(function () {
            assert.isTrue(view.finishOAuthFlow.called);
          });
      });

      it('sends an unverified user to the confirm screen after persisting oauth values', function () {
        var password = 'password';

        sinon.stub(view, 'persistOAuthParams', function () {
          return p(true);
        });

        sinon.stub(view.fxaClient, 'signIn', function () {
          return p({ verified: false });
        });

        sinon.stub(view.fxaClient, 'signUpResend', function () {
          return p();
        });

        $('.email').val(email);
        $('[type=password]').val(password);
        return view.submit()
          .then(function () {
            assert.isTrue(view.persistOAuthParams.called);
            assert.equal(router.page, 'confirm');
          });
      });
    });

    describe('resetPasswordIfKnownValidEmail', function () {
      it('goes to the reset_password page if user types a valid, known email', function () {
        // the screen is rendered, we can take over from here.
        $('.email').val(email);
        return view.resetPasswordIfKnownValidEmail()
          .then(function () {
            assert.ok(Session.oauth, 'oauth params are set');
            assert.equal(router.page, 'reset_password');
          });
      });

      it('goes to the reset_password screen if a blank email', function () {
        // the screen is rendered, we can take over from here.
        $('[type=email]').val('');
        return view.resetPasswordIfKnownValidEmail()
            .then(function () {
              assert.ok(Session.oauth, 'oauth params are set');
              assert.ok(router.page, 'reset_password');
            });
      });
    });
  });

});


