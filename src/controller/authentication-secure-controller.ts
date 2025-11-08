/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

/**
 * @module internal/controllers
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TokenHandler from '../authentication/token-handler';
import User from '../entity/user/user';
import PointOfSaleController from './point-of-sale-controller';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import ServerSettingsStore from '../server-settings/server-settings-store';
import { ISettings } from '../entity/server-setting';
import { QRAuthenticatorStatus } from '../entity/authenticator/qr-authenticator';
import WebSocketService from '../service/websocket-service';
import QRService from '../service/qr-service';
import AuthenticationSecurePinRequest from './request/authentication-secure-pin-request';
import AuthenticationSecureNfcRequest from './request/authentication-secure-nfc-request';
import { UserType } from '../entity/user/user';
import AuthenticationController from './authentication-controller';
import AuthenticationService from '../service/authentication-service';
import NfcAuthenticator from '../entity/authenticator/nfc-authenticator';
import { AuthenticationContext } from '../service/authentication-service';

/**
 * Handles authenticated-only authentication endpoints for token management and specialized flows.
 * All endpoints require valid JWT tokens and build upon existing authentication.
 *
 * ## Internal Implementation Notes
 * - Token refresh maintains the same access level by preserving the posId property (if present)
 * - POS authentication uses custom expiry settings from server settings
 * - QR confirmation integrates with WebSocket service for real-time notifications
 * - All methods use the role manager for permission validation
 *
 * @promote
 */
export default class AuthenticationSecureController extends BaseController {
  private logger: Logger = log4js.getLogger('AuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new authentication secure controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(options: BaseControllerOptions, tokenHandler: TokenHandler) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/refreshToken': {
        GET: {
          policy: async () => Promise.resolve(true),
          handler: this.refreshToken.bind(this),
          restrictions: { lesser: true, acceptedTOS: false },
        },
      },
      '/pointofsale/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'authenticate', await PointOfSaleController.getRelation(req), 'User', ['pointOfSale']),
          handler: this.authenticatePointOfSale.bind(this),
        },
      },
      '/qr/:sessionId/confirm': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.confirmQRCode.bind(this),
          restrictions: { lesser: false },
        },
      },
      '/pin-secure': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.securePINLogin.bind(this),
          restrictions: { lesser: false },
        },
      },
      '/nfc-secure': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.secureNfcLogin.bind(this),
          restrictions: { lesser: false },
        },
      },
    };
  }

  /**
   * GET /authentication/refreshToken
   * @summary Get a new JWT token, maintaining the same access level (posId) as the original token
   * @operationId refreshToken
   * @tags authenticate - Operations of the authentication controller
   * @security JWT
   * @return {AuthenticationResponse} 200 - The created json web token.
   */
  private async refreshToken(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Refresh token for user', req.token.user.id);

    try {
      const user = await User.findOne({ where: { id: req.token.user.id } });
      const token = await new AuthenticationService().getSaltedToken({
        user,
        context: {
          roleManager: this.roleManager,
          tokenHandler: this.tokenHandler,
        },
        posId: req.token.posId,
      });
      res.json(token);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /authentication/pointofsale/{id}
   * @summary Get a JWT token for the given POS
   * @operationId authenticatePointOfSale
   * @tags authenticate - Operations of the authentication controller
   * @security JWT
   * @param {integer} id.path.required - The id of the user
   * @return {AuthenticationResponse} 200 - The created json web token.
   * @return {string} 404 - Point of sale not found
   * @return {string} 500 - Internal server error
   */
  private async authenticatePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Authenticate point of sale', req.params.id, 'by user', req.token.user.id);

    try {
      const pointOfSaleId = Number(req.params.id);
      const pointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId }, relations: { user: true } });
      if (!pointOfSale) {
        res.status(404).json('Point of sale not found.');
        return;
      }

      const expiry = ServerSettingsStore.getInstance().getSetting('jwtExpiryPointOfSale') as ISettings['jwtExpiryPointOfSale'];
      const token = await new AuthenticationService().getSaltedToken({
        user: pointOfSale.user,
        context: {
          roleManager: this.roleManager,
          tokenHandler: this.tokenHandler,
        },
        expiry,
      });
      res.json(token);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /authentication/qr/{sessionId}/confirm
   * @summary Confirm QR code authentication from mobile app
   * @operationId confirmQRCode
   * @tags authenticate - Operations of authentication controller
   * @param {string} sessionId.path.required - The session ID
   * @security JWT
   * @return 200 - Successfully confirmed
   * @return {string} 400 - Validation error
   * @return {string} 404 - Session not found
   * @return {string} 410 - Session expired
   * @return {string} 500 - Internal server error
   */
  private async confirmQRCode(req: RequestWithToken, res: Response): Promise<void> {
    const { sessionId } = req.params;
    this.logger.trace('Confirming QR code for session', sessionId, 'by user', req.token.user);

    try {
      const qrAuthenticator = await (new QRService()).get(sessionId);
      if (!qrAuthenticator) {
        res.status(404).json('Session not found.');
        return;
      }

      if (qrAuthenticator.status === QRAuthenticatorStatus.EXPIRED) {
        res.status(410).json('Session has expired.');
        return;
      }

      if (qrAuthenticator.status !== QRAuthenticatorStatus.PENDING) {
        res.status(400).json('Session is no longer pending.');
        return;
      }

      const user = await User.findOne({ where: { id: req.token.user.id } });
      const token = await new AuthenticationService().getSaltedToken({
        user,
        context: {
          roleManager: this.roleManager,
          tokenHandler: this.tokenHandler,
        },
        posId: req.token.posId,
      });

      // Let the service handle all business logic validation
      await (new QRService()).confirm(qrAuthenticator, user);

      // Notify WebSocket clients about the confirmation
      WebSocketService.emitQRConfirmed(qrAuthenticator, token);
      res.status(200).json({ message: 'QR code confirmed successfully.' });
    } catch (error) {
      this.logger.error('Could not confirm QR code:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /authentication/pin-secure
   * @summary Secure PIN authentication that requires POS user authentication
   * @operationId securePINAuthentication
   * @tags authenticate - Operations of authentication controller
   * @param {AuthenticationSecurePinRequest} request.body.required - The PIN login request with posId
   * @return {AuthenticationResponse} 200 - The created json web token
   * @return {string} 403 - Authentication error (invalid POS user or credentials)
   * @return {string} 500 - Internal server error
   */
  private async securePINLogin(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as AuthenticationSecurePinRequest;
    this.logger.trace('Secure PIN authentication for user', body.userId, 'by POS user', req.token.user.id);

    try {
      // Verify the caller is a POS user
      const tokenUser = await User.findOne({ where: { id: req.token.user.id } });
      if (!tokenUser || tokenUser.type !== UserType.POINT_OF_SALE) {
        res.status(403).json('Only POS users can use secure PIN authentication.');
        return;
      }

      // Verify the POS user's ID matches the posId in the request
      const pointOfSale = await PointOfSale.findOne({ where: { user: { id: tokenUser.id } } });
      if (!pointOfSale || pointOfSale.id !== body.posId) {
        res.status(403).json('POS user ID does not match the requested posId.');
        return;
      }

      // Reuse the PIN login constructor logic
      await (AuthenticationController.PINLoginConstructor(this.roleManager,
        this.tokenHandler, body.pin, body.userId, body.posId))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using secure PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /authentication/nfc-secure
   * @summary Secure NFC authentication that requires POS user authentication
   * @operationId secureNfcAuthentication
   * @tags authenticate - Operations of authentication controller
   * @param {AuthenticationSecureNfcRequest} request.body.required - The NFC login request with posId
   * @return {AuthenticationResponse} 200 - The created json web token
   * @return {string} 403 - Authentication error (invalid POS user or credentials)
   * @return {string} 500 - Internal server error
   */
  private async secureNfcLogin(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as AuthenticationSecureNfcRequest;
    this.logger.trace('Secure NFC authentication for nfcCode', body.nfcCode, 'by POS user', req.token.user.id);

    try {
      // Verify the caller is a POS user
      const tokenUser = await User.findOne({ where: { id: req.token.user.id } });
      if (!tokenUser || tokenUser.type !== UserType.POINT_OF_SALE) {
        res.status(403).json('Only POS users can use secure NFC authentication.');
        return;
      }

      // Verify the POS user's ID matches the posId in the request
      const pointOfSale = await PointOfSale.findOne({ where: { user: { id: tokenUser.id } } });
      if (!pointOfSale || pointOfSale.id !== body.posId) {
        res.status(403).json('POS user ID does not match the requested posId.');
        return;
      }

      // Look up the NFC authenticator
      const authenticator = await NfcAuthenticator.findOne({ where: { nfcCode: body.nfcCode } });
      if (authenticator == null || authenticator.user == null) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
        return;
      }

      const context: AuthenticationContext = {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      };

      this.logger.trace('Successful secure NFC authentication for user', authenticator.user);

      const token = await new AuthenticationService().getSaltedToken({
        user: authenticator.user,
        context,
        posId: body.posId,
      });
      res.json(token);
    } catch (error) {
      this.logger.error('Could not authenticate using secure NFC:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
