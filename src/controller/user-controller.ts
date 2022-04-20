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
import { FindManyOptions } from 'typeorm';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import User, { UserType } from '../entity/user/user';
import CreateUserRequest from './request/create-user-request';
import UpdateUserRequest from './request/update-user-request';
import { parseRequestPagination } from '../helpers/pagination';
import ProductService from '../service/product-service';
import PointOfSaleService from '../service/point-of-sale-service';
import TransactionService, {
  parseGetTransactionsFilters,
} from '../service/transaction-service';
import ContainerService from '../service/container-service';
import { PaginatedUserResponse } from './response/user-response';
import TransferService, { parseGetTransferFilters } from '../service/transfer-service';

export default class UserController extends BaseController {
  private logger: Logger = log4js.getLogger('UserController');

  /**
  * Create a new user controller instance.
  * @param options - The options passed to the base controller.
  */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
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
      '/:id': {
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
      '/:id/products': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Product', ['*'],
          ),
          handler: this.getUsersProducts.bind(this),
        },
      },
      '/:id/products/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Product', ['*'],
          ),
          handler: this.getUsersUpdatedProducts.bind(this),
        },
      },
      '/:id/containers': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Container', ['*'],
          ),
          handler: this.getUsersContainers.bind(this),
        },
      },
      '/:id/containers/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Container', ['*'],
          ),
          handler: this.getUsersUpdatedContainers.bind(this),
        },
      },
      '/:id/pointsofsale': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'PointOfSale', ['*'],
          ),
          handler: this.getUsersPointsOfSale.bind(this),
        },
      },
      '/:id/pointsofsale/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'PointOfSale', ['*'],
          ),
          handler: this.getUsersUpdatedPointsOfSale.bind(this),
        },
      },
      '/:id/transactions': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transaction', ['*'],
          ),
          handler: this.getUsersTransactions.bind(this),
        },
      },
      '/:id/transfers': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get', UserController.getRelation(req), 'Transfer', ['*'],
          ),
          handler: this.getUsersTransfers.bind(this),
        },
      },
    };
  }

  static getRelation(req: RequestWithToken): string {
    return req.params.id === req.token.user.id.toString() ? 'own' : 'all';
  }

  /**
   * Get a list of all users
   * @route GET /users
   * @group users - Operations of user controller
   * @security JWT
   * @param {integer} take.query - How many users the endpoint should return
   * @param {integer} skip.query - How many users should be skipped (for pagination)
   * @returns {PaginatedUserResponse.model} 200 - A list of all users
   */
  public async getAllUsers(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all users by user', req.token.user);

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
      const options: FindManyOptions = { where: { deleted: false } };
      const users = await User.find({ ...options, take, skip });
      const count = await User.count(options);

      const result: PaginatedUserResponse = {
        _pagination: {
          take, skip, count,
        },
        records: users,
      };

      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not get users:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Get all users of user type
   * @route GET /users/usertype/{userType}
   * @group users - Operations of user controller
   * @param {integer} userType.path.required - The userType of the requested users
   * @security JWT
   * @param {integer} take.query - How many users the endpoint should return
   * @param {integer} skip.query - How many users should be skipped (for pagination)
   * @returns {PaginatedUserResponse.model} 200 - A list of all users
   * @returns {string} 404 - Nonexistent usertype
   */
  public async getAllUsersOfUserType(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get all users of userType', parameters, 'by user', req.token.user);

    // If it does not exist, return a 404 error
    if (!(parameters.userType in UserType)) {
      res.status(404).json('Unknown userType.');
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
      const options: FindManyOptions = { where: { deleted: false, type: parameters.userType } };
      const users = await User.find({ ...options, take, skip });
      const count = await User.count(options);

      const result: PaginatedUserResponse = {
        _pagination: {
          take, skip, count,
        },
        records: users,
      };

      res.status(200).json(result);
    } catch (error) {
      this.logger.error('Could not get users:', error);
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
      const user = await User.findOne(parameters.id, { where: { deleted: false } });
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
   * @security JWT
   * @returns {User.model} 200 - New user
   * @returns {string} 400 - Bad request
   */
  // eslint-disable-next-line class-methods-use-this
  public async createUser(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateUserRequest;
    this.logger.trace('Create user', body, 'by user', req.token.user);

    if (body.firstName.length === 0) {
      res.status(400).json('firstName cannot be empty');
      return;
    }
    if (body.firstName.length > 64) {
      res.status(400).json('firstName too long');
      return;
    }
    if (body.lastName && body.lastName.length > 64) {
      res.status(400).json('lastName too long');
      return;
    }
    if (!Object.values(UserType).includes(body.type)) {
      res.status(400).json('type is not a valid UserType');
      return;
    }

    try {
      const user = await User.save(body as User);
      res.status(201).json(user);
    } catch (error) {
      this.logger.error('Could not create user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Update a user
   * @route PATCH /users/{id}
   * @group users - Operations of user controller
   * @security JWT
   * @returns {User.model} 200 - New user
   * @returns {string} 400 - Bad request
   */
  public async updateUser(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateUserRequest;
    console.log(body);
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
        await User.findOne(parameters.id, { where: { deleted: false } }),
      );
    } catch (error) {
      this.logger.error('Could not create product:', error);
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

      const products = await ProductService.getProducts({
        ownerId: parseInt(parameters.id, 10),
      }, { take, skip });
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

      const products = await ProductService.getProducts({
        ownerId: parseInt(parameters.id, 10),
      }, { take, skip });
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
        .getContainers({ ownerId: user.id }, { take, skip }));
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
        .getUpdatedContainers({ ownerId: user.id }, { take, skip }));
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
        .getPointsOfSale({ ownerId: user.id }, { take, skip }));
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
        .getUpdatedPointsOfSale({ ownerId: user.id }, { take, skip }));
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
}
