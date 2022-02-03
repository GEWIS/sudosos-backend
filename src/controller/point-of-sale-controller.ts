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
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import PointOfSaleService from '../service/point-of-sale-service';
import ContainerService from '../service/container-service';
import ProductService from '../service/product-service';
import {
  PaginatedUpdatedPointOfSaleResponse,
} from './response/point-of-sale-response';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import { asNumber } from '../helpers/validators';
import UpdatedPointOfSale from '../entity/point-of-sale/updated-point-of-sale';
import { parseRequestPagination } from '../helpers/pagination';
import verifyUpdatePointOfSaleRequest from './request/validators/update-point-of-sale-request-spec';
import { isFail } from '../helpers/specification-validation';
import { CreatePointOfSaleRequest, UpdatePointOfSaleRequest } from './request/point-of-sale-request';

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'PointOfSale', ['*']),
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
      },
      '/:id(\\d+)/update': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.returnSingleUpdatedPointOfSale.bind(this),
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
      '/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await PointOfSaleController.getRelation(req), 'PointOfSale', ['*']),
          handler: this.returnUpdatedPointsOfSale.bind(this),
        },
      },
      '/:id(\\d+)/approve': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'approve', 'all', 'PointOfSale', ['*']),
          handler: this.approveUpdate.bind(this),
        },
      },
    };
  }

  /**
   * Create a new Point of Sale.
   * @route POST /pointsofsale
   * @group pointofsale - Operations of the point of sale controller
   * @param {CreatePointOfSaleRequest.model} pointofsale.body.required -
   * The point of sale which should be created
   * @security JWT
   * @returns {PointOfSale.model} 200 - The created point of sale entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createPointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreatePointOfSaleRequest;
    this.logger.trace('Create point of sale', body, 'by user', req.token.user);

    // handle request
    try {
      // If no ownerId is provided we use the token user id.
      const request: CreatePointOfSaleRequest = {
        ...body,
        ownerId: body.ownerId ?? req.token.user.id,
      };

      const validation = await verifyUpdatePointOfSaleRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      res.json(await PointOfSaleService.createPointOfSale(request));
    } catch (error) {
      this.logger.error('Could not create point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all existing Point of Sales
   * @route GET /pointsofsale
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} take.query - How many points of sale the endpoint should return
   * @param {integer} skip.query - How many points of sale should be skipped (for pagination)
   * @returns {PaginatedPointOfSaleResponse.model} 200 - All existing point of sales
   * @returns {string} 500 - Internal server error
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
   * Returns the requested Point of Sale
   * @route GET /pointsofsale/{id}
   * @group pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale which should be returned
   * @security JWT
   * @returns {PointOfSaleResponse.model} 200 - The requested point of sale entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSinglePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single point of sale', id, 'by user', req.token.user);

    // handle request
    try {
      const pointOfSaleId = parseInt(id, 10);
      // Check if point of sale exists.
      if (!await PointOfSale.findOne(pointOfSaleId)) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      const pointOfSale = (await PointOfSaleService
        .getPointsOfSale({ pointOfSaleId, returnContainers: true })).records[0];
      if (pointOfSale) {
        res.json(pointOfSale);
      }
    } catch (error) {
      this.logger.error('Could not return point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Update an existing Point of Sale.
   * @route PATCH /pointsofsale/{id}
   * @group pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale which should be updated
   * @param {UpdatePointOfSaleRequest.model} pointofsale.body.required -
   * The Point of Sale which should be updated
   * @security JWT
   * @returns {UpdatedPointOfSaleResponse.model} 200 - The updated Point of Sale entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Product not found error
   * @returns {string} 500 - Internal server error
   */
  public async updatePointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdatePointOfSaleRequest;
    const { id } = req.params;
    const pointOfSaleId = Number.parseInt(id, 10);
    this.logger.trace('Update Point of Sale', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      const request: UpdatePointOfSaleRequest = {
        ...body,
        ownerId: body.ownerId ?? req.token.user.id,
      };

      const validation = await verifyUpdatePointOfSaleRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const update = await PointOfSaleService.updatePointOfSale(pointOfSaleId, request);
      if (!update) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      res.json(update);
    } catch (error) {
      this.logger.error('Could not update Point of Sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the containers of the requested Point of Sale, empty list if POS does not exist
   * @route GET /pointsofsale/{id}/containers
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @returns {PaginatedContainerResponse.model} 200 - All containers of the requested Point of Sale
   * @returns {string} 500 - Internal server error
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
   * Returns the products of the requested Point of Sale, empty list if POS does not exist
   * @route GET /pointsofsale/{id}/products
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @returns {PaginatedProductResponse.model} 200 - All products of the requested Point of Sale
   * @returns {string} 500 - Internal server error
   */
  public async returnAllPointOfSaleProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get all point of sale products', id, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      const products = await ProductService.getProducts({
        pointOfSaleId: parseInt(id, 10),
      }, { take, skip });
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all point of sale products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all a single Points of Sale
   * @route GET /pointsofsale/{id}/update
   * @group pointofsale - Operations of the point of sale controller
   * @param {integer} id.path.required - The id of the Point of Sale which should be returned
   * @security JWT
   * @returns {UpdatedPointOfSaleResponse.model} 200 - The requested updated Point of Sale entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleUpdatedPointOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const pointOfSaleId = parseInt(id, 10);
    this.logger.trace('Get single updated Point of Sale', id, 'by user', req.token.user);

    // handle request
    try {
      // Point of sale does not exist.
      if (!await PointOfSale.findOne(pointOfSaleId)) {
        res.status(404).json('Point of Sale not found.');
        return;
      }

      // No update available.
      if (!await UpdatedPointOfSale.findOne(pointOfSaleId)) {
        res.json();
        return;
      }

      res.json((await PointOfSaleService.getUpdatedPointsOfSale(
        { pointOfSaleId, returnContainers: true },
      )).records[0]);
    } catch (error) {
      this.logger.error('Could not return point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all updated Points of Sale
   * @route GET /pointsofsale/updated
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @param {integer} take.query - How many points of sale the endpoint should return
   * @param {integer} skip.query - How many points of sale should be skipped (for pagination)
   * @returns {PaginatedUpdatedPointOfSaleResponse.model} 200 - All existing updated point of sales
   * @returns {string} 500 - Internal server error
   */
  public async returnUpdatedPointsOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all updated Points of sale', body, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      const pointsOfSale: PaginatedUpdatedPointOfSaleResponse = (
        (await PointOfSaleService.getUpdatedPointsOfSale({}, { take, skip })));

      res.json(pointsOfSale);
    } catch (error) {
      this.logger.error('Could not return all updated Points of Sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Approve a Point of Sale update.
   * @route POST /pointsofsale/{id}/approve
   * @param {integer} id.path.required - The id of the Point of Sale update to approve
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @returns {PointOfSaleResponse.model} 200 - The approved Point of Sale entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async approveUpdate(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Update accepted', id, 'by user', req.token.user);

    const pointOfSaleId = Number.parseInt(id, 10);
    // Handle
    try {
      const pointOfSale = await PointOfSaleService.approvePointOfSaleUpdate(pointOfSaleId);
      if (!pointOfSale) {
        res.status(404).json('Point of Sale update not found.');
        return;
      }

      res.json(pointOfSale);
    } catch (error) {
      this.logger.error('Could not approve update: ', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Function to determine which credentials are needed to get POS
   * all if user is not connected to POS
   * own if user is connected to POS
   * @param req
   * @returns whether POS is connected to used token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const canViewPointOfSale = await PointOfSaleService.canViewPointOfSale(
      req.token.user.id, asNumber(req.params.id),
    );
    if (canViewPointOfSale) {
      return 'own';
    }
    return 'all';
  }
}
