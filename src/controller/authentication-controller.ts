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
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import User from '../entity/user/user';
import AuthenticationMockRequest from './request/authentication-mock-request';
import JsonWebToken from '../authentication/json-web-token';
import TokenHandler from '../authentication/token-handler';
import AuthenticationService, { AuthenticationContext } from '../service/authentication-service';
import AuthenticationLDAPRequest from './request/authentication-ldap-request';
import RoleManager from '../rbac/role-manager';
import wrapInManager from '../helpers/database';
import { LDAPUser } from '../helpers/ad';

/**
 * The authentication controller is responsible for:
 * - Verifying user authentications.
 * - Handing out json web tokens.
 */
export default class AuthenticationController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('AuthenticationController');

  /**
   * Reference to the token handler of the application.
   */
  protected tokenHandler: TokenHandler;

  /**
   * Creates a new authentication controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler - The token handler for creating signed tokens.
   */
  public constructor(
    options: BaseControllerOptions,
    tokenHandler: TokenHandler,
  ) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/mock': {
        POST: {
          body: { modelName: 'AuthenticationMockRequest' },
          policy: AuthenticationController.canPerformMock.bind(this),
          handler: this.mockLogin.bind(this),
        },
      },
      '/LDAP': {
        POST: {
          body: { modelName: 'AuthenticationLDAPRequest' },
          policy: async () => true,
          handler: this.ldapLogin.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  static async canPerformMock(req: Request): Promise<boolean> {
    const body = req.body as AuthenticationMockRequest;

    // Only allow in development setups
    if (process.env.NODE_ENV !== 'development') return false;

    // Check the existence of the user
    const user = await User.findOne({ id: body.userId });
    if (!user) return false;

    return true;
  }

  /**
   * LDAP login and hand out token
   * If user has never signed in before this also creates an account.
   * @route POST /authentication/LDAP
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationLDAPRequest.model} req.body.required - The LDAP login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 403 - Authentication error.
   */
  public async ldapLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationLDAPRequest;
    this.logger.trace('LDAP authentication for user', body.accountName);

    try {
      AuthenticationController.LDAPLogin(this.roleManager, this.tokenHandler,
        wrapInManager<User>(AuthenticationService.createUserAndBind))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using LDAP:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Constructor for the LDAP function to make it easily adaptable.
   * @constructor
   */
  public static LDAPLogin(roleManager: RoleManager, tokenHandler: TokenHandler,
    onNewUser: (ADUser: LDAPUser) => Promise<User>) {
    return async (req: Request, res: Response) => {
      const body = req.body as AuthenticationLDAPRequest;
      const user = await AuthenticationService.LDAPAuthentication(
        body.accountName, body.password, onNewUser,
      );

      // If user is undefined something went wrong.
      if (!user) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
        return;
      }

      const context: AuthenticationContext = {
        roleManager,
        tokenHandler,
      };

      // AD login gives full access.
      const token = await AuthenticationService.getSaltedToken(user, context, false);
      res.json(token);
    };
  }

  /**
   * Mock login and hand out token.
   * @route POST /authentication/mock
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationMockRequest.model} req.body.required - The mock login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   */
  public async mockLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationMockRequest;
    this.logger.trace('Mock authentication for user', body.userId);

    try {
      const user = await User.findOne({ id: body.userId });
      const roles = await this.roleManager.getRoles(user);

      const contents: JsonWebToken = {
        user,
        roles,
        lesser: false,
      };
      const token = await this.tokenHandler.signToken(contents, body.nonce);
      const response = AuthenticationService.asAuthenticationResponse(user, roles, token);
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
