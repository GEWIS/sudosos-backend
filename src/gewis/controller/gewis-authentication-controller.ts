/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import { Response } from 'express';
import * as jwt from 'jsonwebtoken';
import log4js, { Logger } from 'log4js';
import * as util from 'util';
import BaseController, { BaseControllerOptions } from '../../controller/base-controller';
import Policy from '../../controller/policy';
import JsonWebToken from '../../authentication/json-web-token';
import TokenHandler from '../../authentication/token-handler';
import GewisUser from '../../entity/user/gewis-user';
import AuthenticationController from '../../controller/authentication-controller';
import GewiswebAuthenticationRequest, { GewiswebTokenRequest } from './request/gewisweb-authentication-request';

/**
  * The GEWIS authentication controller is responsible for:
  * - Verifying user authentications.
  * - Handing out json web tokens.
  */
export default class GewisAuthenticationController extends BaseController {
  /**
    * Reference to the logger instance.
    */
  private logger: Logger = log4js.getLogger('GewisAuthenticationController');

  /**
    * Reference to the token handler of the application.
    */
  private tokenHandler: TokenHandler;

  /**
   * The secret key shared with gewisweb for JWT HMAC verification.
   */
  private gewiswebSecret: string;

  /**
    * Creates a new authentication controller instance.
    * @param options - The options passed to the base controller.
    * @param tokenHandler - The token handler for creating signed tokens.
    * @param gewiswebSecret - The shared JWT secret with gewisweb.
    */
  public constructor(
    options: BaseControllerOptions,
    tokenHandler: TokenHandler,
    gewiswebSecret: string,
  ) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
    this.gewiswebSecret = gewiswebSecret;
  }

  /**
    * @inheritdoc
    */
  public getPolicy(): Policy {
    return {
      '/gewisweb': {
        POST: {
          body: { modelName: 'GewiswebAuthenticationRequest' },
          policy: this.canPerformGewiswebLogin.bind(this),
          handler: this.gewiswebLogin.bind(this),
        },
      },
    };
  }

  /**
    * Validates that the request is authorized by the policy.
    * @param req - The incoming request.
    */
  public async canPerformGewiswebLogin(req: GewiswebTokenRequest): Promise<boolean> {
    const body = req.body as GewiswebAuthenticationRequest;

    try {
      req.token = await util.promisify(jwt.verify)
        .bind(null, body.token, this.gewiswebSecret, {
          algorithms: ['HS256'],
          complete: false,
        })();

      // Check the existence of the user
      const user = await GewisUser.findOne({ gewisId: req.token.lidnr });
      if (!user) return false;
    } catch {
      // Invalid token supplied.
      return false;
    }

    return true;
  }

  /**
    * GEWIS login verification based on gewisweb JWT tokens.
    * This method verifies the validity of the gewisweb JWT token, and returns a SudoSOS
    * token if the GEWIS token is valid.
    * @route POST /authentication/gewisweb
    * @group authenticate - Operations of authentication controller
    * @param {GewiswebAuthenticationRequest.model} req.body.required - The mock login.
    * @returns {AuthenticationResponse.model} 200 - The created json web token.
    * @returns {MessageResponse.model} 403 - The created json web token.
    * @returns {string} 400 - Validation error.
    */
  public async gewiswebLogin(req: GewiswebTokenRequest, res: Response): Promise<void> {
    const body = req.body as GewiswebAuthenticationRequest;
    this.logger.trace('Gewisweb authentication for user with membership id', req.token.lidnr);

    try {
      const user = await GewisUser.findOne({
        where: { gewisId: req.token.lidnr },
        relations: ['user'],
      });
      const roles = await this.roleManager.getRoles(user.user);

      const contents: JsonWebToken = {
        user: user.user,
        roles,
      };
      const token = await this.tokenHandler.signToken(contents, body.nonce);
      const response = AuthenticationController.asAuthenticationResponse(user.user, roles, token);
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
