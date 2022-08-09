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
import TokenHandler from '../authentication/token-handler';
import AuthenticationService, { AuthenticationContext } from '../service/authentication-service';
import AuthenticationLDAPRequest from './request/authentication-ldap-request';
import RoleManager from '../rbac/role-manager';
import wrapInManager from '../helpers/database';
import { LDAPUser } from '../helpers/ad';
import AuthenticationLocalRequest from './request/authentication-local-request';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import AuthenticationPinRequest from './request/authentication-pin-request';
import LocalAuthenticator from '../entity/authenticator/local-authenticator';
import ResetLocalRequest from './request/reset-local-request';
import AuthenticationResetTokenRequest from './request/authentication-reset-token-request';

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
          handler: this.LDAPLogin.bind(this),
        },
      },
      '/pin': {
        POST: {
          body: { modelName: 'AuthenticationPinRequest' },
          policy: async () => true,
          handler: this.PINLogin.bind(this),
        },
      },
      '/local': {
        POST: {
          body: { modelName: 'AuthenticationLocalRequest' },
          policy: async () => true,
          handler: this.LocalLogin.bind(this),
        },
        PUT: {
          body: { modelName: 'AuthenticationResetTokenRequest' },
          policy: async () => true,
          handler: this.resetLocalUsingToken.bind(this),
        },
      },
      '/local/reset': {
        POST: {
          body: { modelName: 'ResetLocalRequest' },
          policy: async () => true,
          handler: this.createResetToken.bind(this),
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
   * PIN login and hand out token
   * @route POST /authentication/pin
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationPinRequest.model} req.body.required - The PIN login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 403 - Authentication error.
   */
  public async PINLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationPinRequest;
    this.logger.trace('PIN authentication for user', body.userId);

    try {
      await (AuthenticationController.PINLoginConstructor(this.roleManager,
        this.tokenHandler, body.pin, body.userId))(req, res);
    } catch (error) {
      this.logger.error('Could not authenticate using PIN:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Construct a login function for PIN.
   * This was done such that it is easily adaptable.
   * @param roleManager
   * @param tokenHandler
   * @param pin - Provided PIN code
   * @param userId - Provided User
   * @constructor
   */
  public static PINLoginConstructor(roleManager: RoleManager, tokenHandler: TokenHandler,
    pin: string, userId: number) {
    return async (req: Request, res: Response) => {
      const user = await User.findOne({
        where: { id: userId, deleted: false },
      });

      if (!user) {
        res.status(403).json({
          message: `User ${userId} not registered`,
        });
        return;
      }

      const pinAuthenticator = await PinAuthenticator.findOne({ where: { user }, relations: ['user'] });
      if (!pinAuthenticator) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
        return;
      }
      const context: AuthenticationContext = {
        roleManager,
        tokenHandler,
      };

      const result = await AuthenticationService.HashAuthentication(pin,
        pinAuthenticator, context, true);

      if (!result) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
      }

      res.json(result);
    };
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
  public async LDAPLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationLDAPRequest;
    this.logger.trace('LDAP authentication for user', body.accountName);

    try {
      await AuthenticationController.LDAPLoginConstructor(this.roleManager, this.tokenHandler,
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
  public static LDAPLoginConstructor(roleManager: RoleManager, tokenHandler: TokenHandler,
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
   * Local login and hand out token
   * @route POST /authentication/local
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationLocalRequest.model} req.body.required - The local login.
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 403 - Authentication error.
   */
  public async LocalLogin(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationLocalRequest;
    this.logger.trace('Local authentication for user', body.accountMail);

    try {
      const user = await User.findOne({
        where: { email: body.accountMail, deleted: false },
      });

      if (!user) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
        return;
      }

      const localAuthenticator = await LocalAuthenticator.findOne({ where: { user }, relations: ['user'] });
      if (!localAuthenticator) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
        return;
      }

      const context: AuthenticationContext = {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      };

      const result = await AuthenticationService.HashAuthentication(body.password,
        localAuthenticator, context, false);

      if (!result) {
        res.status(403).json({
          message: 'Invalid credentials.',
        });
      }

      res.json(result);
    } catch (error) {
      this.logger.error('Could not authenticate using Local:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Reset local authentication using the provided token
   * @route PUT /authentication/local
   * @group authenticate - Operations of authentication controller
   * @param {AuthenticationResetTokenRequest.model} req.body.required - The reset token.
   * @returns {string} 204 - Successfully reset
   * @returns {string} 403 - Authentication error.
   */
  public async resetLocalUsingToken(req: Request, res: Response): Promise<void> {
    const body = req.body as AuthenticationResetTokenRequest;
    this.logger.trace('Reset using token for user', body.accountMail);

    try {
      const resetToken = await AuthenticationService.isResetTokenRequestValid(body);
      if (!resetToken) {
        res.status(403).json({
          message: 'Invalid request.',
        });
        return;
      }

      if (AuthenticationService.isTokenExpired(resetToken)) {
        res.status(403).json({
          message: 'Token expired.',
        });
        return;
      }

      await AuthenticationService
        .resetLocalUsingToken(resetToken, body.token, body.password);
      res.status(204).send();
      return;
    } catch (error) {
      this.logger.error('Could not reset using token:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a reset token for the local authentication
   * @route POST /authentication/local/reset
   * @group authenticate - Operations of authentication controller
   * @param {ResetLocalRequest.model} req.body.required - The reset info.
   * @returns {string} 204 - Creation success
   */
  public async createResetToken(req: Request, res: Response): Promise<void> {
    const body = req.body as ResetLocalRequest;
    this.logger.trace('Reset request for user', body.accountMail);
    try {
      const user = await User.findOne({
        where: { email: body.accountMail, deleted: false },
      });
      // If the user does not exist we simply return a success code as to not leak info.
      if (!user) {
        res.status(204).send();
        return;
      }

      await AuthenticationService.createResetToken(user);
      // send email with link.
      res.status(204).send();
      return;
    } catch (error) {
      this.logger.error('Could not create reset token:', error);
      res.status(500).json('Internal server error.');
    }
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
      const contents = await AuthenticationService.makeJsonWebToken(
        { tokenHandler: this.tokenHandler, roleManager: this.roleManager }, user, false,
      );
      const token = await this.tokenHandler.signToken(contents, body.nonce);
      const response = AuthenticationService
        .asAuthenticationResponse(contents.user, contents.roles, contents.organs, token);
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create token:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
