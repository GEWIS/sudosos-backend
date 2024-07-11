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
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import PointOfSaleService from '../service/point-of-sale-service';
import ContainerService from '../service/container-service';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import { asNumber } from '../helpers/validators';
import { parseRequestPagination } from '../helpers/pagination';
import { isFail } from '../helpers/specification-validation';
import {
  CreatePointOfSaleParams, CreatePointOfSaleRequest,
  UpdatePointOfSaleParams,
  UpdatePointOfSaleRequest,
} from './request/point-of-sale-request';
import {
  verifyCreatePointOfSaleRequest,
  verifyUpdatePointOfSaleRequest,
} from './request/validators/point-of-sale-request-spec';
import userTokenInOrgan from '../helpers/token-helper';
import TransactionService from '../service/transaction-service';
import { PointOfSaleWithContainersResponse } from './response/point-of-sale-response';

export default class PointOfSaleController extends BaseController {
  private logger: Logger = log4js.getLogger('PointOfSaleController');

  /**
   * Creates a new point of sale controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'PointOfSale', ['*']),
          handler: this.returnAllPointsOfSale.bind(this),
        },
        POST: {
          body: { modelName: 'CreatePointOfSaleRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', PointOfSaleController.postRelation(req), 'PointOfSale', ['*']),
          handler: this.createPointOfSale.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.returnSinglePointOfSale.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdatePointOfSaleRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.updatePointOfSale.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.deletePointOfSale.bind(this),
        },
      },
      '/:id(\\d+)/transactions': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'Transaction', ['*']),
          handler: this.returnPointOfSaleTransactions.bind(this),
        },
      },
      '/:id(\\d+)/containers': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'Container', ['*']),
          handler: this.returnAllPointOfSaleContainers.bind(this),
        },
      },
      '/:id(\\d+)/products': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.returnAllPointOfSaleProducts.bind(this),
        },
      },
    };
  }

  /**
   * POST /pointsofsale
   * @summary Create a new Point of Sale.
   * @operationId createPointOfSale
   * @tags pointofsale - Operations of the point of sale controller
   * @param {CreatePointOfSaleRequest} request.body.required -
   * The point of sale which should be created
   * @security JWT
   * @return {PointOfSaleWithContainersResponse} 200 - The created point of sale entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createPointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreatePointOfSaleRequest;
    this.logger.trace('Create point of sale', body, 'by user', req.token.user);

    // handle request
    try {
      // If no ownerId is provided we use the token user id.
      const params: CreatePointOfSaleParams = {
        ...body,
        ownerId: body.ownerId ?? req.token.user.id,
      };

      const validation = await verifyCreatePointOfSaleRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      res.json(await PointOfSaleService.createPointOfSale(params));
    } catch (error) {
      this.logger.error('Could not create point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /pointsofsale
   * @summary Returns all existing Point of Sales
   * @operationId getAllPointsOfSale
   * @tags pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} take.query - How many points of sale the endpoint should return
   * @param {integer} skip.query - How many points of sale should be skipped (for pagination)
   * @return {PaginatedPointOfSaleResponse} 200 - All existing point of sales
   * @return {string} 500 - Internal server error
   */
  public async returnAllPointsOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all point of sales', body, 'by user', req.token.user);

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
      const pointsOfSale = await PointOfSaleService.getPointsOfSale({}, { take, skip });
      res.json(pointsOfSale);
    } catch (error) {
      this.logger.error('Could not return all point of sales:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /pointsofsale/{id}
   * @summary Returns the requested Point of Sale
   * @operationId getSinglePointOfSale
   * @tags pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale which should be returned
   * @security JWT
   * @return {PointOfSaleWithContainersResponse} 200 - The requested point of sale entity
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async returnSinglePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single point of sale', id, 'by user', req.token.user);

    // handle request
    try {
      const pointOfSaleId = parseInt(id, 10);
      // Check if point of sale exists.
      if (!await PointOfSale.findOne({ where: { id: pointOfSaleId } })) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      const pointOfSale = (await PointOfSaleService
        .getPointsOfSale({ pointOfSaleId, returnContainers: true, returnProducts: true })).records[0];
      if (pointOfSale) {
        res.json(pointOfSale);
      }
    } catch (error) {
      this.logger.error('Could not return point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /pointsofsale/{id}
   * @summary Update an existing Point of Sale.
   * @operationId updatePointOfSale
   * @tags pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale which should be updated
   * @param {UpdatePointOfSaleRequest} request.body.required -
   *    The Point of Sale which should be updated
   * @security JWT
   * @return {PointOfSaleWithContainersResponse} 200 - The updated Point of Sale entity
   * @return {string} 400 - Validation error
   * @return {string} 404 - Product not found error
   * @return {string} 500 - Internal server error
   */
  public async updatePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdatePointOfSaleRequest;
    const { id } = req.params;
    const pointOfSaleId = Number.parseInt(id, 10);
    this.logger.trace('Update Point of Sale', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      const params: UpdatePointOfSaleParams = {
        ...body,
        id: pointOfSaleId,
      };

      const validation = await verifyUpdatePointOfSaleRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const pointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId } });
      if (!pointOfSale) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      res.json(await PointOfSaleService.updatePointOfSale(params));
    } catch (error) {
      this.logger.error('Could not update Point of Sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /pointsofsale/{id}/containers
   * @summary Returns the containers of the requested Point of Sale, empty list if POS does not exist
   * @operationId getAllPointOfSaleContainers
   * @tags pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} id.path.required - The id of the point of sale
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @return {PaginatedContainerResponse} 200 - All containers of the requested Point of Sale
   * @return {string} 500 - Internal server error
   */
  public async returnAllPointOfSaleContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get all point of sale containers', id, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      const containers = await ContainerService.getContainers({
        posId: parseInt(id, 10),
      }, { take, skip });
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return all point of sale containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /pointsofsale/{id}/products
   * @summary Returns the products of the requested Point of Sale, empty list if POS does not exist
   * @operationId getAllPointOfSaleProducts
   * @tags pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} id.path.required - The id of the point of sale
   * @return {Array.<ProductResponse>} 200 - All products of the requested Point of Sale
   * @return {string} 500 - Internal server error
   */
  public async returnAllPointOfSaleProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get all point of sale products', id, 'by user', req.token.user);

    // Handle request
    try {
      const pointOfSaleId = parseInt(id, 10);
      const products = (await PointOfSaleService.getPointsOfSale({ pointOfSaleId, returnContainers: true, returnProducts: true }))
        .records.flatMap((p: PointOfSaleWithContainersResponse) => p.containers).flatMap((c) => c.products);
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all point of sale products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /pointsofsale/{id}/transactions
   * @summary Returns a Point of Sale transactions
   * @operationId getTransactions
   * @tags pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale of which to get the transactions.
   * @param {integer} take.query - How many transactions the endpoint should return
   * @param {integer} skip.query - How many transactions should be skipped (for pagination)
   * @security JWT
   * @return {PaginatedBaseTransactionResponse} 200 - The requested Point of Sale transactions
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async returnPointOfSaleTransactions(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const pointOfSaleId = parseInt(id, 10);
    this.logger.trace('Get Point of Sale transactions', id, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    // handle request
    try {
      // Point of sale does not exist.
      if (!await PointOfSale.findOne({ where: { id: pointOfSaleId } })) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      const transactions = await TransactionService.getTransactions(
        { pointOfSaleId }, { take, skip },
      );
      res.status(200).json(transactions);
    } catch (error) {
      this.logger.error('Could not return point of sale transactions:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /pointsofsale/{id}
   * @summary (Soft) delete the given point of sale. Cannot be undone.
   * @operationId deletePointOfSale
   * @tags pointofsale - Operations of point of sale controller
   * @param {integer} id.path.required - The id of the point of sale which should be deleted
   * @security JWT
   * @return {string} 204 - Success
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async deletePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete point of sale', id, 'by user', req.token.user);

    try {
      const pointOfSaleId = parseInt(id, 10);

      const pointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId } });

      if (pointOfSale == null) {
        res.status(404).json('Point of sale not found');
        return;
      }

      await PointOfSaleService.deletePointOfSale(pointOfSaleId);
      res.status(204).send();
      return;
    } catch (error) {
      this.logger.error('Could not delete point of sale', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Function to determine which credentials are needed to post POS
   *    'all' if user is not connected to POS
   *    'organ' if user is connected to POS via organ
   *    'own' if user is connected to POS
   * @param req - Request with CreatePointOfSaleRequest as body
   * @return whether POS is connected to user token
   */
  static postRelation(req: RequestWithToken): string {
    const request = req.body as CreatePointOfSaleRequest;
    if (request.ownerId && request.ownerId === req.token.user.id) return 'own';
    if (request.ownerId && userTokenInOrgan(req, request.ownerId)) return 'organ';
    return 'own';
  }

  /**
   * Function to determine which credentials are needed to get POS
   *    'all' if user is not connected to POS
   *    'organ' if user is connected to POS via organ
   *    'own' if user is connected to POS
   * @param req
   * @return whether POS is connected to used token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const pointOfSaleId = asNumber(req.params.id);
    const pos: PointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId }, relations: ['owner'] });

    if (!pos) return 'all';
    if (userTokenInOrgan(req, pos.owner.id)) return 'organ';

    const canViewPointOfSale = await PointOfSaleService.canViewPointOfSale(
      req.token.user.id, pos,
    );

    if (canViewPointOfSale) {
      return 'own';
    }

    return 'all';
  }
}
