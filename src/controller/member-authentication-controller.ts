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
 * This is the module page of the member-authentication-controller.
 *
 * @module authentication
 */

import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import TokenHandler from '../authentication/token-handler';
import MemberUser from '../entity/user/member-user';
import MemberAuthenticationPinRequest from './request/member-authentication-pin-request';
import AuthenticationController from './authentication-controller';

/**
 * The member authentication controller is responsible for:
 * - Verifying member user authentications by memberId.
 * - Handing out json web tokens.
 */
export default class MemberAuthenticationController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('MemberAuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  private tokenHandler: TokenHandler;

  /**
   * Creates a new member authentication controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(options: BaseControllerOptions, tokenHandler: TokenHandler) {
    super(options);
    this.configureLogger(this.logger);
    this.tokenHandler = tokenHandler;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/member/pin': {
        POST: {
          body: { modelName: 'MemberAuthenticationPinRequest' },
          policy: async () => true,
          handler: this.memberPINLogin.bind(this),
        },
      },
    };
  }

  /**
   * POST /authentication/member/pin
   * @deprecated Use /authentication/member/pin-secure instead
   * @summary PIN login for members using memberId.
   * @operationId memberPinAuthentication
   * @tags authenticate - Operations of authentication controller
   * @param {MemberAuthenticationPinRequest} request.body.required - The PIN login.
   * @return {AuthenticationResponse} 200 - The created json web token.
   * @return {string} 400 - Validation error.
   * @return {string} 403 - Authentication error.
   */
  public async memberPINLogin(req: Request, res: Response): Promise<void> {
    const { pin, memberId } = req.body as MemberAuthenticationPinRequest;
    this.logger.trace('Member PIN authentication for user with memberId', memberId);

    try {
      const memberUser = await MemberUser.findOne({
        where: { memberId },
        relations: ['user'],
      });

      if (!memberUser) {
        res.status(403).json({
          message: `User ${memberId} not registered`,
        });
        return;
      }
      await (AuthenticationController.PINLoginConstructor(this.roleManager, this.tokenHandler,
        pin, memberUser.user.id))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
