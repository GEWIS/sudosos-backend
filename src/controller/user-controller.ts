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
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import User, { UserType } from '../entity/user/user';
import CreateUserRequest from './request/create-user-request';
import UpdateUserRequest from './request/update-user-request';
import { parseRequestPagination } from '../helpers/pagination';
import ProductService from '../service/product-service';
import PointOfSaleService from '../service/point-of-sale-service';
import TransactionService, { parseGetTransactionsFilters } from '../service/transaction-service';
import ContainerService from '../service/container-service';
import TransferService, { parseGetTransferFilters } from '../service/transfer-service';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import AuthenticationService, { AuthenticationContext } from '../service/authentication-service';
import TokenHandler from '../authentication/token-handler';
import RBACService from '../service/rbac-service';
import { isFail } from '../helpers/specification-validation';
import verifyUpdatePinRequest from './request/validators/update-pin-request-spec';
import UpdatePinRequest from './request/update-pin-request';
import UserService, { parseGetUsersFilters, UserFilterParameters } from '../service/user-service';
import { asNumber } from '../helpers/validators';
import { verifyCreateUserRequest } from './request/validators/user-request-spec';
import userTokenInOrgan from '../helpers/token-helper';
import { parseUserToResponse } from '../helpers/revision-to-response';
import { AcceptTosRequest } from './request/accept-tos-request';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import LocalAuthenticator from '../entity/authenticator/local-authenticator';
import UpdateLocalRequest from './request/update-local-request';
import verifyUpdateLocalRequest from './request/validators/update-local-request-spec';

export default class UserController extends BaseController {
  private logger: Logger = log4js.getLogger('UserController');

  /**
   * Reference to the token handler of the application.
   */
  private tokenHandler: TokenHandler;

  /**
   * Create a new user controller instance.
   * @param options - The options passed to the base controller.
   * @param tokenHandler
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
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', 'all', 'User', ['*'],
          ),
          handler: this.getAllUsers.bind(this),
        },
        POST: {
          body: { modelName: 'CreateUserRequest' },
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'User', ['*'],
          ),
          handler: this.createUser.bind(this),
        },
      },
      '/usertype/:userType': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', 'all', 'User', ['*'],
          ),
          handler: this.getAllUsersOfUserType.bind(this),
        },
      },
      '/acceptTos': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'acceptToS', 'own', 'User', ['*'],
          ),
          handler: this.acceptToS.bind(this),
          body: { modelName: 'AcceptTosRequest' },
          restrictions: { acceptedTOS: false },
        },
      },
      '/:id(\\d+)/authenticator/pin': {
        PUT: {
          body: { modelName: 'UpdatePinRequest' },
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update', UserController.getRelation(req), 'Authenticator', ['pin'],
          ),
          handler: this.updateUserPin.bind(this),
        },
      },
      '/:id(\\d+)/authenticator/local': {
        PUT: {
          body: { modelName: 'UpdateLocalRequest' },
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update', UserController.getRelation(req), 'Authenticator', ['password'],
          ),
          handler: this.updateUserLocalPassword.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'User', ['*'],
          ),
          handler: this.getIndividualUser.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'delete', UserController.getRelation(req), 'User', ['*'],
          ),
          handler: this.deleteUser.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateUserRequest' },
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update', UserController.getRelation(req), 'User', ['*'],
          ),
          handler: this.updateUser.bind(this),
        },
      },
      '/:id(\\d+)/members': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'User', ['*'],
          ),
          handler: this.getOrganMembers.bind(this),
        },
      },
      '/:id(\\d+)/authenticate': {
        POST: {
          policy: async () => true,
          handler: this.authenticateAsUser.bind(this),
        },
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Authenticator', ['*'],
          ),
          handler: this.getUserAuthenticatable.bind(this),
        },
      },
      '/:id(\\d+)/products': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Product', ['*'],
          ),
          handler: this.getUsersProducts.bind(this),
        },
      },
      '/:id(\\d+)/roles': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Roles', ['*'],
          ),
          handler: this.getUserRoles.bind(this),
        },
      },
      '/:id(\\d+)/products/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Product', ['*'],
          ),
          handler: this.getUsersUpdatedProducts.bind(this),
        },
      },
      '/:id(\\d+)/containers': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Container', ['*'],
          ),
          handler: this.getUsersContainers.bind(this),
        },
      },
      '/:id(\\d+)/containers/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Container', ['*'],
          ),
          handler: this.getUsersUpdatedContainers.bind(this),
        },
      },
      '/:id(\\d+)/pointsofsale': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'PointOfSale', ['*'],
          ),
          handler: this.getUsersPointsOfSale.bind(this),
        },
      },
      '/:id(\\d+)/pointsofsale/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'PointOfSale', ['*'],
          ),
          handler: this.getUsersUpdatedPointsOfSale.bind(this),
        },
      },
      '/:id(\\d+)/transactions': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transaction', ['*'],
          ),
          handler: this.getUsersTransactions.bind(this),
        },
      },
      '/:id(\\d+)/transfers': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transfer', ['*'],
          ),
          handler: this.getUsersTransfers.bind(this),
        },
      },
      '/:id(\\d+)/financialmutations': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transfer', ['*'],
          ) && this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transaction', ['*'],
          ),
          handler: this.getUsersFinancialMutations.bind(this),
        },
      },
    };
  }

  /**
   * Function to determine which credentials are needed to GET
   *    'all' if user is not connected to User
   *    'organ' if user is connected to User via organ
   *    'own' if user is connected to User
   * @param req
   * @returns whether User is connected to used token
   */
  static getRelation(req: RequestWithToken): string {
    if (userTokenInOrgan(req, asNumber(req.params.id))) return 'organ';
    return req.params.id === req.token.user.id.toString() ? 'own' : 'all';
  }

  /**
   * Get a list of all users
   * @route GET /users
   * @group users - Operations of user controller
   * @security JWT
   * @param {integer} take.query - How many users the endpoint should return
   * @param {integer} skip.query - How many users should be skipped (for pagination)
   * @param {string} firstName.query - Filter based on first name
   * @param {string} lastName.query - Filter based on last name
   * @param {boolean} active.query - Filter based if the user is active
   * @param {boolean} ofAge.query - Filter based if the user is 18+
   * @param {integer} id.query - Filter based on user ID
   * @param {type} type.query - Filter based on user type.
   * @returns {PaginatedUserResponse.model} 200 - A list of all users
   */
  public async getAllUsers(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all users by user', req.token.user);

    let take;
    let skip;
    let filters: UserFilterParameters;
    try {
      const pagination = parseRequestPagination(req);
      filters = parseGetUsersFilters(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const users = await UserService.getUsers(filters, { take, skip });
      res.status(200).json(users);
    } catch (error) {
      this.logger.error('Could not get users:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all users of user type
   * @route GET /users/usertype/{userType}
   * @group users - Operations of user controller
   * @param {string} userType.path.required - The userType of the requested users
   * @security JWT
   * @param {integer} take.query - How many users the endpoint should return
   * @param {integer} skip.query - How many users should be skipped (for pagination)
   * @returns {PaginatedUserResponse.model} 200 - A list of all users
   * @returns {string} 404 - Nonexistent usertype
   */
  public async getAllUsersOfUserType(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get all users of userType', parameters, 'by user', req.token.user);
    const userType = req.params.userType.toUpperCase();

    // If it does not exist, return a 404 error
    const type = UserType[userType as keyof typeof UserType];
    if (!type || Number(userType)) {
      res.status(404).json('Unknown userType.');
      return;
    }

    try {
      req.query.type = userType;
      this.getAllUsers(req, res);
    } catch (error) {
      this.logger.error('Could not get users:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Put an users pin code
   * @route PUT /users/{id}/authenticator/pin
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {UpdatePinRequest.model} update.body.required -
   *    The PIN code to update to
   * @security JWT
   * @returns 200 - Update success
   * @returns {string} 400 - Validation Error
   * @returns {string} 404 - Nonexistent user id
   */
  public async updateUserPin(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    const updatePinRequest = req.body as UpdatePinRequest;
    this.logger.trace('Update user pin', parameters, 'by user', req.token.user);

    try {
      // Get the user object if it exists
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const validation = await verifyUpdatePinRequest(updatePinRequest);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      await AuthenticationService.setUserAuthenticationHash(user,
        updatePinRequest.pin.toString(), PinAuthenticator);
      res.status(200).json();
    } catch (error) {
      this.logger.error('Could not update pin:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Put a user's local password
   * @route PUT /users/{id}/authenticator/local
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {UpdateLocalRequest.model} update.body.required -
   *    The password update
   * @security JWT
   * @returns 204 - Update success
   * @returns {string} 400 - Validation Error
   * @returns {string} 404 - Nonexistent user id
   */
  public async updateUserLocalPassword(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    const updateLocalRequest = req.body as UpdateLocalRequest;
    this.logger.trace('Update user local password', parameters, 'by user', req.token.user);

    try {
      const userId = Number.parseInt(parameters.id, 10);
      // Get the user object if it exists
      const user = await User.findOne(userId, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const validation = await verifyUpdateLocalRequest(updateLocalRequest);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      await AuthenticationService.setUserAuthenticationHash(user,
        updateLocalRequest.password, LocalAuthenticator);
      res.status(204).json();
    } catch (error) {
      this.logger.error('Could not update local password:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an organs members
   * @route GET /users/{id}/members
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @security JWT
   * @returns {PaginatedUserResponse.model} 200 - All members of the organ
   * @returns {string} 404 - Nonexistent user id
   * @returns {string} 400 - User is not an organ
   */
  public async getOrganMembers(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get organ members', parameters, 'by user', req.token.user);

    try {
      const organId = asNumber(parameters.id);
      // Get the user object if it exists
      const user = await User.findOne({ where: { id: organId } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      if (user.type !== UserType.ORGAN) {
        res.status(400).json('User is not of type Organ');
        return;
      }

      const members = await UserService.getUsers({ organId });
      res.status(200).json(members);
    } catch (error) {
      this.logger.error('Could not get organ members:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an individual user
   * @route GET /users/{id}
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @security JWT
   * @returns {User.model} 200 - Individual user
   * @returns {string} 404 - Nonexistent user id
   */
  public async getIndividualUser(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get individual user', parameters, 'by user', req.token.user);

    try {
      // Get the user object if it exists
      const user = await UserService.getSingleUser(asNumber(parameters.id));
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      this.logger.error('Could not get individual user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Create a new user
   * @route POST /users
   * @group users - Operations of user controller
   * @param {CreateUserRequest.model} user.body.required -
   * The user which should be created
   * @security JWT
   * @returns {User.model} 200 - New user
   * @returns {string} 400 - Bad request
   */
  // eslint-disable-next-line class-methods-use-this
  public async createUser(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateUserRequest;
    this.logger.trace('Create user', body, 'by user', req.token.user);

    try {
      const validation = await verifyCreateUserRequest(body);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const user = await UserService.createUser(body);
      res.status(201).json(user);
    } catch (error) {
      this.logger.error('Could not create user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  // TODO make a specification that can handle undefined attributes.
  /**
   * Update a user
   * @route PATCH /users/{id}
   * @group users - Operations of user controller
   * @param {UpdateUserRequest.model} user.body.required -
   * The user which should be updated
   * @security JWT
   * @returns {UpdateUserRequest.model} 200 - New user
   * @returns {string} 400 - Bad request
   */
  public async updateUser(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateUserRequest;
    const parameters = req.params;
    this.logger.trace('Update user', parameters.id, 'with', body, 'by user', req.token.user);

    if (body.firstName !== undefined) console.log(body.firstName.length);
    if (body.firstName !== undefined && body.firstName.length === 0) {
      res.status(400).json('firstName cannot be empty');
      return;
    }
    if (body.firstName !== undefined && body.firstName.length > 64) {
      res.status(400).json('firstName too long');
      return;
    }
    if (body.lastName !== undefined && body.lastName.length > 64) {
      res.status(400).json('lastName too long');
      return;
    }

    try {
      // Get the user object if it exists
      let user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      user = {
        ...body,
      } as User;
      await User.update(parameters.id, user);
      res.status(200).json(
        await UserService.getSingleUser(asNumber(parameters.id)),
      );
    } catch (error) {
      this.logger.error('Could not update user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Delete a single user
   * @route DELETE /users/{id}
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @security JWT
   * @returns {string} 204 - User successfully deleted
   * @returns {string} 400 - Cannot delete yourself
   */
  public async deleteUser(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Delete individual user', parameters, 'by user', req.token.user);

    if (req.token.user.id === parseInt(parameters.id, 10)) {
      res.status(400).json('Cannot delete yourself');
      return;
    }

    try {
      // Get the user object if it exists
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      user.deleted = true;
      await user.save();
      res.status(204).json('User deleted');
    } catch (error) {
      this.logger.error('Could not create product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Accept the Terms of Service if you have not accepted it yet
   * @route POST /users/acceptTos
   * @group users - Operations of the User controller
   * @param {AcceptTosRequest.model} params.body.required
   * @security JWT
   * @returns {string} 204 - ToS accepted
   * @returns {string} 400 - ToS already accepted
   */
  public async acceptToS(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Accept ToS for user', req.token.user);

    const { id } = req.token.user;
    const body = req.body as AcceptTosRequest;

    try {
      const user = await UserService.getSingleUser(id);
      if (user === undefined) {
        res.status(404).json('User not found.');
        return;
      }

      const success = await UserService.acceptToS(id, body);
      if (!success) {
        res.status(400).json('User already accepted ToS.');
        return;
      }

      res.status(204).json();
      return;
    } catch (error) {
      this.logger.error('Could not accept ToS for user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an user's products
   * @route GET /users/{id}/products
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedProductResponse.model} 200 - List of products.
   */
  public async getUsersProducts(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace("Get user's products", parameters, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const owner = await User.findOne(parameters.id);
      if (owner == null) {
        res.status(404).json({});
        return;
      }

      const products = await ProductService.getProducts({}, { take, skip }, owner);
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an user's updated products
   * @route GET /users/{id}/products/updated
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedProductResponse.model} 200 - List of products.
   */
  public async getUsersUpdatedProducts(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace("Get user's updated products", parameters, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const owner = await User.findOne(parameters.id);
      if (owner == null) {
        res.status(404).json({});
        return;
      }

      const products = await ProductService.getProducts({}, { take, skip }, owner);
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the user's containers
   * @route GET /users/{id}/containers
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @returns {PaginatedContainerResponse.model} 200 - All users updated containers
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getUsersContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's containers", id, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      // Get the user object if it exists
      const user = await User.findOne(id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const containers = (await ContainerService
        .getContainers({}, { take, skip }, user));
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the user's updated containers
   * @route GET /users/{id}/containers/updated
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @returns {PaginatedContainerResponse.model} 200 - All users updated containers
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getUsersUpdatedContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's updated containers", id, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      // Get the user object if it exists
      const user = await User.findOne(id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const containers = (await ContainerService
        .getUpdatedContainers({}, { take, skip }, user));
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return updated containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the user's Points of Sale
   * @route GET /users/{id}/pointsofsale
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {integer} take.query - How many points of sale the endpoint should return
   * @param {integer} skip.query - How many points of sale should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedPointOfSaleResponse.model} 200 - All users updated point of sales
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getUsersPointsOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's points of sale", id, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      // Get the user object if it exists
      const user = await User.findOne(id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const pointsOfSale = (await PointOfSaleService
        .getPointsOfSale({}, { take, skip }, user));
      res.json(pointsOfSale);
    } catch (error) {
      this.logger.error('Could not return point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the user's updated Points of Sale
   * @route GET /users/{id}/pointsofsale/updated
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user
   * @param {integer} take.query - How many points of sale the endpoint should return
   * @param {integer} skip.query - How many points of sale should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedUpdatedPointOfSaleResponse.model} 200 - All users updated point of sales
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getUsersUpdatedPointsOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's updated points of sale", id, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      // Get the user object if it exists
      const user = await User.findOne(id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const pointsOfSale = (await PointOfSaleService
        .getUpdatedPointsOfSale({}, { take, skip }, user));
      res.json(pointsOfSale);
    } catch (error) {
      this.logger.error('Could not return updated points of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an user's transactions (from, to or created)
   * @route GET /users/{id}/transactions
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user that should be involved
   * in all returned transactions
   * @param {integer} fromId.query - From-user for selected transactions
   * @param {integer} createdById.query - User that created selected transaction
   * @param {integer} toId.query - To-user for selected transactions
   * transactions. Requires ContainerId
   * @param {integer} productId.query - Product ID for selected transactions
   * @param {integer} productRevision.query - Product Revision for selected
   * transactions. Requires ProductID
   * @param {string} fromDate.query - Start date for selected transactions (inclusive)
   * @param {string} tillDate.query - End date for selected transactions (exclusive)
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedTransactionResponse.model} 200 - List of transactions.
   */
  public async getUsersTransactions(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's", id, 'transactions by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    try {
      filters = parseGetTransactionsFilters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      const user = await User.findOne(id);
      if (user == null) {
        res.status(404).json({});
        return;
      }
      const transactions = await TransactionService.getTransactions(filters, { take, skip }, user);

      res.status(200).json(transactions);
    } catch (error) {
      this.logger.error('Could not return all transactions:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get an user's transfers
   * @route GET /users/{id}/transfers
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user that should be involved
   * in all returned transfers
   * @param {integer} take.query - How many transfers the endpoint should return
   * @param {integer} skip.query - How many transfers should be skipped (for pagination)
   * @param {integer} fromId.query - From-user for selected transfers
   * @param {integer} toId.query - To-user for selected transfers
   * @param {integer} id.query - ID of selected transfers
   * @security JWT
   * @returns {PaginatedTransferResponse.model} 200 - List of transfers.
   */
  public async getUsersTransfers(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace("Get user's transfers", id, 'by user', req.token.user);

    // Parse the filters given in the query parameters. If there are any issues,
    // the parse method will throw an exception. We will then return a 400 error.
    let filters;
    try {
      filters = parseGetTransferFilters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      // Get the user object if it exists
      const user = await User.findOne(id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const transfers = (await TransferService.getTransfers(
        { ...filters }, { take, skip }, user,
      ));
      res.json(transfers);
    } catch (error) {
      this.logger.error('Could not return user transfers', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Authenticate as another user
   * @route POST /users/{id}/authenticate
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user that should be authenticated as
   * @security JWT
   * @returns {AuthenticationResponse.model} 200 - The created json web token.
   * @returns {string} 400 - Validation error.
   * @returns {string} 404 - User not found error.
   * @returns {string} 403 - Authentication error.
   */
  public async authenticateAsUser(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Authenticate as user', parameters, 'by user', req.token.user);

    try {
      // Get the user object if it exists
      const authenticateAs = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (authenticateAs === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      // Check if user can authenticate as requested user.
      const authenticator = await MemberAuthenticator
        .findOne({ where: { user: req.token.user, authenticateAs } });

      if (authenticator === undefined) {
        res.status(403).json('Authentication error');
        return;
      }

      const context: AuthenticationContext = {
        roleManager: this.roleManager,
        tokenHandler: this.tokenHandler,
      };

      const token = await AuthenticationService.getSaltedToken(authenticateAs, context, false);
      res.status(200).json(token);
    } catch (error) {
      this.logger.error('Could not authenticate as user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all users that the user can authenticate as
   * @route GET /users/{id}/authenticate
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user to get authentications of
   * @security JWT
   * @returns {string} 404 - User not found error.
   * @returns {Array.<UserResponse.model>} 200 - A list of all users the given ID can authenticate
   */
  public async getUserAuthenticatable(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get authenticatable users of user', parameters, 'by user', req.token.user);

    try {
      // Get the user object if it exists
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      // Extract from member authenticator table.
      const authenticators = await MemberAuthenticator.find({ where: { user }, relations: ['authenticateAs'] });
      const users = authenticators.map((auth) => parseUserToResponse(auth.authenticateAs));
      res.status(200).json(users);
    } catch (error) {
      this.logger.error('Could not get authenticatable of user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all roles assigned to the user.
   * @route GET /users/{id}/roles
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user to get the roles from
   * @security JWT
   * @returns {Array.<RoleResponse.model>} 200 - The roles of the user
   * @returns {string} 404 - User not found error.
   */
  public async getUserRoles(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get roles of user', parameters, 'by user', req.token.user);

    try {
      // Get the user object if it exists
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const roles = await this.roleManager.getRoles(user);
      if (req.token.organs && req.token.organs.length > 0) roles.push('SELLER');
      const definitions = this.roleManager.toRoleDefinitions(roles);
      res.status(200).json(RBACService.asRoleResponse(definitions));
    } catch (error) {
      this.logger.error('Could not get roles of user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all financial mutations of a user.
   * @route GET /users/{id}/financialmutations
   * @group users - Operations of user controller
   * @param {integer} id.path.required - The id of the user to get the mutations from
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @security JWT
   * @returns {PaginatedFinancialMutationResponse.model} 200 - The financial mutations of the user
   * @returns {string} 404 - User not found error.
   */
  public async getUsersFinancialMutations(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get financial mutations of user', parameters, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    try {
      // Get the user object if it exists
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
      // If it does not exist, return a 404 error
      if (user === undefined) {
        res.status(404).json('Unknown user ID.');
        return;
      }

      const mutations = await UserService.getUserFinancialMutations(user, { take, skip });
      res.status(200).json(mutations);
    } catch (error) {
      this.logger.error('Could not get financial mutations of user:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
