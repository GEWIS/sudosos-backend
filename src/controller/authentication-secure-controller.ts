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
 * @module authentication
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import AuthenticationService from '../service/authentication-service';
import TokenHandler from '../authentication/token-handler';
import User from '../entity/user/user';
import PointOfSaleController from './point-of-sale-controller';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import ServerSettingsStore from '../server-settings/server-settings-store';
import { ISettings } from '../entity/server-setting';
import { QRAuthenticatorStatus } from '../entity/authenticator/qr-authenticator';
import WebSocketService from '../service/websocket-service';
import QRService from '../service/qr-service';

/**
 * Handles authenticated-only authentication endpoints for token management and specialized flows.
 * All endpoints require valid JWT tokens and build upon existing authentication.
 *
 * ## Internal Implementation Notes
 * - Token refresh maintains the same access level (lesser/full) as the original token
 * - POS authentication uses custom expiry settings from server settings
 * - QR confirmation integrates with WebSocket service for real-time notifications
 * - All methods use the role manager for permission validation
 *
 * @module internal/controllers
 * @promote
 */
export default class AuthenticationSecureController extends BaseController {
  private logger: Logger = log4js.getLogger('AuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new banner controller instance.
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
    };
  }

  /**
   * GET /authentication/refreshToken
   * @summary Get a new JWT token, lesser if the existing token is also lesser
   * @operationId refreshToken
   * @tags authenticate - Operations of the authentication controller
   * @security JWT
   * @return {AuthenticationResponse} 200 - The created json web token.
   */
  private async refreshToken(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Refresh token for user', req.token.user.id);

    try {
      const user = await User.findOne({ where: { id: req.token.user.id } });
      const token = await new AuthenticationService().getSaltedToken(user, {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      }, req.token.lesser);
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
      const token = await new AuthenticationService().getSaltedToken(pointOfSale.user, {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      }, false, undefined, expiry);
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
      const token = await new AuthenticationService().getSaltedToken(user, {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      }, req.token.lesser);

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
}
