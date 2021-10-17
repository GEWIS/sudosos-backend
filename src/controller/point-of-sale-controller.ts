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
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'PointOfSale', ['*']),
          handler: this.returnSinglePointOfSale.bind(this),
        },
      },
      '/:id(\\d+)/containers': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']),
          handler: this.returnAllPointOfSaleContainers.bind(this),
        },
      },
      '/:id(\\d+)/products': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']),
          handler: this.returnAllPointOfSaleProducts.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing Point of Sales
   * @route GET /pointsofsale
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @returns {Array<PointOfSaleResponse>} 200 - All existing point of sales
   * @returns {string} 500 - Internal server error
   */
  public async returnAllPointsOfSale(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all point of sales', body, 'by user', req.token.user);

    // Handle request
    try {
      const pointsOfSale = await PointOfSaleService.getPointsOfSale();
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
      // check if product in database
      const pointOfSale = (await PointOfSaleService
        .getPointsOfSale({ pointOfSaleId: parseInt(id, 10) }))[0];
      if (pointOfSale) {
        res.json(pointOfSale);
      } else {
        res.status(404).json('Point of Sale not found.');
      }
    } catch (error) {
      this.logger.error('Could not return point of sale:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the containers of the requested Point of Sale, empty list if POS does not exist
   * @route GET /pointsofsale/{id}/containers
   * @group pointofsale - Operations of the point of sale controller
   * @security JWT
   * @returns {Array<ContainerResponse>} 200 - All containers of the requested Point of Sale
   * @returns {string} 500 - Internal server error
   */
  public async returnAllPointOfSaleContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get all point of sale containers', id, 'by user', req.token.user);

    // Handle request
    try {
      const containers = await ContainerService.getContainers({ posId: parseInt(id, 10) });
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
   * @returns {Array<ProductResponse>} 200 - All products of the requested Point of Sale
   * @returns {string} 500 - Internal server error
   */
  public async returnAllPointOfSaleProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get all point of sale products', id, 'by user', req.token.user);

    // Handle request
    try {
      const products = await ProductService.getProductsPOS({ pointOfSaleId: parseInt(id, 10) });
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all point of sale products:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
