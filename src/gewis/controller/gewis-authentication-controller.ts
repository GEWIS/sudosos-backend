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
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import log4js, { Logger } from 'log4js';
import * as util from 'util';
import BaseController, { BaseControllerOptions } from '../../controller/base-controller';
import Policy from '../../controller/policy';
import TokenHandler from '../../authentication/token-handler';
import GewisUser from '../../entity/user/gewis-user';
import GewiswebToken from '../gewisweb-token';
import GewiswebAuthenticationRequest from './request/gewisweb-authentication-request';
import AuthenticationService from '../../service/authentication-service';
import GEWISAuthenticationPinRequest from './request/gewis-authentication-pin-request';
import AuthenticationLDAPRequest from '../../controller/request/authentication-ldap-request';
import AuthenticationController from '../../controller/authentication-controller';
import Gewis from '../gewis';
import User from '../../entity/user/user';
import wrapInManager from '../../helpers/database';
import UserService from '../../service/user-service';
import UpdateUserRequest from '../../controller/request/update-user-request';

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
          policy: async () => true,
          handler: this.gewiswebLogin.bind(this),
        },
      },
      '/GEWIS/pin': {
        POST: {
          body: { modelName: 'GEWISAuthenticationPinRequest' },
          policy: async () => true,
          handler: this.gewisPINLogin.bind(this),
        },
      },
      '/GEWIS/LDAP': {
        POST: {
          body: { modelName: 'AuthenticationLDAPRequest' },
          policy: async () => true,
          handler: this.ldapLogin.bind(this),
        },
      },
    };
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
  public async gewiswebLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as GewiswebAuthenticationRequest;

    try {
      let gewisweb: GewiswebToken;
      try {
        gewisweb = await util.promisify(jwt.verify)
          .bind(null, body.token, this.gewiswebSecret, {
            algorithms: ['HS512'],
            complete: false,
          })();
      } catch (error) {
        // Invalid token supplied.
        res.status(403).json({
          message: 'Invalid JWT signature',
        });
        return;
      }
      this.logger.trace('Gewisweb authentication for user with membership id', gewisweb.lidnr);

      let gewisUser = await GewisUser.findOne({
        where: { gewisId: gewisweb.lidnr },
        relations: ['user'],
      });
      if (!gewisUser) {
        // If
        gewisUser = await wrapInManager<GewisUser>(Gewis.createUserFromWeb)(gewisweb);
      } else {
        //
        const update: UpdateUserRequest = {
          firstName: gewisweb.given_name,
          lastName: gewisweb.family_name,
          email: gewisweb.email,
          ofAge: gewisweb.is_18_plus,
        };
        await UserService.updateUser(gewisUser.user.id, update);
      }

      const contents = await AuthenticationService
        .makeJsonWebToken({ roleManager: this.roleManager, tokenHandler: this.tokenHandler },
          gewisUser.user, false);
      const token = await this.tokenHandler.signToken(contents, body.nonce);
      const response = AuthenticationService
        .asAuthenticationResponse(contents.user, contents.roles, contents.organs, token);
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * LDAP login and hand out token
   *    If user has never signed in before this also creates an GEWIS account.
   * @route POST /authentication/GEWIS/LDAP
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationLDAPRequest.model} req.body.required - The LDAP login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 403 - Authentication error.
   */
  public async ldapLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationLDAPRequest;
    this.logger.trace('GEWIS LDAP authentication for user', body.accountName);

    try {
      await AuthenticationController.LDAPLoginConstructor(this.roleManager, this.tokenHandler,
        wrapInManager<User>(Gewis.findOrCreateGEWISUserAndBind))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using LDAP:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PIN login and hand out token.
   * @route POST /authentication/GEWIS/pin
   * @group authenticate - Operations of authentication controller
   * @param {GEWISAuthenticationPinRequest.model} req.body.required - The PIN login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 403 - Authentication error.
   */
  public async gewisPINLogin(req: Request, res: Response): Promise<void> {
    const { pin, gewisId } = req.body as GEWISAuthenticationPinRequest;
    this.logger.trace('GEWIS PIN authentication for user', gewisId);

    try {
      const gewisUser = await GewisUser.findOne({
        where: { gewisId },
        relations: ['user'],
      });

      if (!gewisUser) {
        res.status(403).json({
          message: `User ${gewisId} not registered`,
        });
        return;
      }
      await (AuthenticationController.PINLoginConstructor(this.roleManager, this.tokenHandler,
        pin, gewisUser.user.id))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
