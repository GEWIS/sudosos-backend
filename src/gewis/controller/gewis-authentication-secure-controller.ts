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
 * @module GEWIS
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from '../../controller/base-controller';
import Policy from '../../controller/policy';
import { RequestWithToken } from '../../middleware/token-middleware';
import TokenHandler from '../../authentication/token-handler';
import User from '../../entity/user/user';
import PointOfSale from '../../entity/point-of-sale/point-of-sale';
import { UserType } from '../../entity/user/user';
import AuthenticationController from '../../controller/authentication-controller';
import GEWISAuthenticationSecurePinRequest from './request/gewis-authentication-secure-pin-request';
import GewisUser from '../entity/gewis-user';

/**
 * Handles authenticated-only GEWIS authentication endpoints for secure PIN authentication.
 * All endpoints require valid JWT tokens and build upon existing authentication.
 *
 * @promote
 */
export default class GewisAuthenticationSecureController extends BaseController {
  private logger: Logger = log4js.getLogger('GewisAuthenticationSecureController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new GEWIS authentication secure controller instance.
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
      '/GEWIS/pin-secure': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.secureGewisPINLogin.bind(this),
          restrictions: { lesser: false },
        },
      },
    };
  }

  /**
   * POST /authentication/GEWIS/pin-secure
   * @summary Secure GEWIS PIN authentication that requires POS user authentication
   * @operationId secureGewisPINAuthentication
   * @tags authenticate - Operations of authentication controller
   * @security JWT
   * @param {GEWISAuthenticationSecurePinRequest} request.body.required - The PIN login request with posId
   * @return {AuthenticationResponse} 200 - The created json web token
   * @return {string} 403 - Authentication error (invalid POS user or credentials)
   * @return {string} 500 - Internal server error
   */
  private async secureGewisPINLogin(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as GEWISAuthenticationSecurePinRequest;
    this.logger.trace('Secure GEWIS PIN authentication for gewisId', body.gewisId, 'by POS user', req.token.user.id);

    try {
      // Verify the caller is a POS user
      const tokenUser = await User.findOne({ where: { id: req.token.user.id } });
      if (!tokenUser || tokenUser.type !== UserType.POINT_OF_SALE) {
        res.status(403).json('Only POS users can use secure GEWIS PIN authentication.');
        return;
      }

      // Verify the POS user's ID matches the posId in the request
      const pointOfSale = await PointOfSale.findOne({ where: { user: { id: tokenUser.id } } });
      if (!pointOfSale || pointOfSale.id !== body.posId) {
        res.status(403).json('POS user ID does not match the requested posId.');
        return;
      }

      // Look up the GEWIS user by gewisId
      const gewisUser = await GewisUser.findOne({
        where: { gewisId: body.gewisId },
        relations: ['user'],
      });

      if (!gewisUser) {
        res.status(403).json({
          message: `User ${body.gewisId} not registered`,
        });
        return;
      }

      // Reuse the PIN login constructor logic
      await (AuthenticationController.PINLoginConstructor(this.roleManager,
        this.tokenHandler, body.pin, gewisUser.user.id, body.posId))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using secure GEWIS PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }
}

