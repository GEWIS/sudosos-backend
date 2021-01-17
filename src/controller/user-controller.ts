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
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import User, { UserType } from '../entity/user/user';
import Product from '../entity/product/product';
import Transaction from '../entity/transactions/transaction';

export default class UserController extends BaseController {
  private logger: Logger = log4js.getLogger('UserController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.canRequestAdminInfo.bind(this),
          handler: this.getAllUsers.bind(this),
        },
      },
      '/:id': {
        GET: {
          policy: this.canGetItselfOrIsAdmin.bind(this),
          handler: this.getIndividualUser.bind(this),
        },
      },
      '/:id/products': {
        GET: {
          policy: this.canGetItselfOrIsAdmin.bind(this),
          handler: this.getUsersProducts.bind(this),
        },
      },
      '/:id/transactions': {
        GET: {
          policy: this.canGetItselfOrIsAdmin.bind(this),
          handler: this.getUsersTransactions.bind(this),
        },
      },
    };
  }

  /**
   * Validates that user requests itself, or that the user is an admin
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetItselfOrIsAdmin(req: RequestWithToken): Promise<boolean> {
    if (req.params.id === req.token.user.id.toString()) return true;
    if (req.token.user.type === UserType.LOCAL_ADMIN) return true;
    return false;
    // TODO: implement user roles and thus admin verification
  }

  /**
   * Validates that the user is an admin
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,class-methods-use-this
  public async canRequestAdminInfo(req: RequestWithToken): Promise<boolean> {
    // TODO: implement user roles and thus admin verification
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  /**
   * Get a list of all users
   * @route GET /users
   * @group users - Operations of user controller
   * @returns {[User.model]} 200 - A list of all users
   */
  public async getAllUsers(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all users', 'by user', req.token.user);

    const users = await User.find();
    res.status(200).json(users);
  }

  /**
   * Get an individual user
   * @route GET /users/:id
   * @group users - Operations of user controller
   * @returns {User.model} 200 - Individual user
   * @returns {string} 404 - Nonexistent user id
   */
  public async getIndividualUser(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get individual user', parameters, 'by user', req.token.user);

    // Get the user object if it exists
    const user = await User.findOne(parameters.id);
    // If it does not exist, return a 404 error
    if (user === undefined) {
      res.status(404).json('Unknown user ID.');
      return;
    }

    res.status(200).json(user);
  }

  /**
   * Get an user's products
   * @route GET /users/:id/products
   * @group users - Operations of user controller
   * @returns {[Product.model]} 200 - List of products.
   */
  public async getUsersProducts(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace("Get user's products", parameters, 'by user', req.token.user);

    const owner = await User.findOne(parameters.id);
    const products = await Product.find({
      owner,
    });

    res.status(200).json(products);
  }

  /**
   * Get an user's transactions (from, to or created)
   * @route GET /users/:id/transactions
   * @group users - Operations of user controller
   * @returns {[Transaction.model]} 200 - List of transactions.
   */
  public async getUsersTransactions(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace("Get user's transactions", parameters, 'by user', req.token.user);

    const user = await User.findOne(parameters.id);
    const transactions = await Transaction.find({
      where: [{ to: user }, { from: user }, { createdBy: user }],
      order: { createdAt: 'DESC' },
    });

    res.status(200).json(transactions);
  }
}
