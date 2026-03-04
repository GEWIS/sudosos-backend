/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the member-authentication-secure-controller.
 *
 * @module authentication
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TokenHandler from '../authentication/token-handler';
import User from '../entity/user/user';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import { UserType } from '../entity/user/user';
import AuthenticationController from './authentication-controller';
import MemberAuthenticationSecurePinRequest from './request/member-authentication-secure-pin-request';
import MemberUser from '../entity/user/member-user';

/**
 * Handles authenticated-only member authentication endpoints for secure PIN authentication.
 * All endpoints require valid JWT tokens and build upon existing authentication.
 *
 * @promote
 */
export default class MemberAuthenticationSecureController extends BaseController {
  private logger: Logger = log4js.getLogger('MemberAuthenticationSecureController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new member authentication secure controller instance.
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
      '/member/pin-secure': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.secureMemberPINLogin.bind(this),
          restrictions: { lesser: false },
        },
      },
    };
  }

  /**
   * POST /authentication/member/pin-secure
   * @summary Secure member PIN authentication that requires POS user authentication
   * @operationId secureMemberPINAuthentication
   * @tags authenticate - Operations of authentication controller
   * @security JWT
   * @param {MemberAuthenticationSecurePinRequest} request.body.required - The PIN login request with posId
   * @return {AuthenticationResponse} 200 - The created json web token
   * @return {string} 403 - Authentication error (invalid POS user or credentials)
   * @return {string} 500 - Internal server error
   */
  private async secureMemberPINLogin(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as MemberAuthenticationSecurePinRequest;
    this.logger.trace('Secure member PIN authentication for memberId', body.memberId, 'by POS user', req.token.user.id);

    try {
      // Verify the caller is a POS user
      const tokenUser = await User.findOne({ where: { id: req.token.user.id } });
      if (!tokenUser || tokenUser.type !== UserType.POINT_OF_SALE) {
        res.status(403).json('Only POS users can use secure member PIN authentication.');
        return;
      }

      // Verify the POS user's ID matches the posId in the request
      const pointOfSale = await PointOfSale.findOne({ where: { user: { id: tokenUser.id } } });
      if (!pointOfSale || pointOfSale.id !== body.posId) {
        res.status(403).json('POS user ID does not match the requested posId.');
        return;
      }

      // Look up the member user by memberId
      const memberUser = await MemberUser.findOne({
        where: { memberId: body.memberId },
        relations: ['user'],
      });

      if (!memberUser) {
        res.status(403).json({
          message: `User ${body.memberId} not registered`,
        });
        return;
      }

      // Reuse the PIN login constructor logic
      await (AuthenticationController.PINLoginConstructor(this.roleManager,
        this.tokenHandler, body.pin, memberUser.user.id, body.posId))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using secure member PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
