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
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import { RequestWithToken } from '../middleware/token-middleware';
import POSProductOrderingService from '../service/pos-product-ordering-service';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { POSProductOrderingRequest } from './request/pos-product-ordering-request';
import { POSProductOrderingResponse } from './response/pos-product-ordering-response';

export default class POSProductOrderingController extends BaseController {
  private logger: Logger = log4js.getLogger('POSProductOrderingController');

  /**
  * Creates a new transaction controller instance.
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
      '/productordering': {
        POST: {
          body: { modelName: 'POSProductOrderingRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'PointOfSale', ['*']),
          handler: this.createPOSProductOrdering.bind(this),
        },
      },
      '/:id(\\d+)/productordering': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'PointOfSale', ['*']),
          handler: this.getPOSProductOrdering.bind(this),
        },
        PATCH: {
          body: { modelName: 'POSProductOrderingRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'PointOfSale', ['*']),
          handler: this.updatePOSProductOrdering.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'PointOfSale', ['*']),
          handler: this.deletePOSProductOrdering.bind(this),
        },
      },
    };
  }

  /**
  * Creates a new product ordering for the requested point of sale
  * @route POST /pointsofsale/productordering
  * @group productOrdering - Operations of the point of sale product ordering controller
  * @param {POSProductOrderingRequest.model} ordering.body.required
  * - The ordering which should be created
  * @security JWT
  * @returns {POSProductOrderingResponse.model} 200 - The created point of sale ordering
  * @returns {string} 400 - Validation error
  * @returns {string} 500 - Internal server error
  */
  public async createPOSProductOrdering(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as POSProductOrderingRequest;
    this.logger.trace('Create POS product ordering', body, 'by user', req.token.user);

    // handle request
    try {
      if (await POSProductOrderingService.verifyOrdering(body)) {
        res.status(200).json(await POSProductOrderingService.createPOSProductOrdering(body));
      } else {
        res.status(400).json('Invalid POS product ordering.');
      }
    } catch (error) {
      this.logger.error('Could not create POS product ordering:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
  * Get a product ordering for a point of sale
  * @route GET /pointsofsale/{id}/productordering
  * @group productOrdering - Operations of the point of sale product ordering controller
  * @param {integer} id.path.required - The id of the point of sale of the ordering
  * @security JWT
  * @returns {POSProductOrderingResponse.model} 200 - Point of sale ordering
  * @returns {string} 404 - Nonexistent point of sale error
  * @returns {string} 500 - Internal server error
  */
  public async getPOSProductOrdering(req: RequestWithToken, res: Response): Promise<void> {
    const parameters = req.params;
    this.logger.trace('Get POS product ordering', parameters, 'by user', req.token.user);

    // handle request
    try {
      const id = parseInt(parameters.id, 10);
      const ordering = await POSProductOrderingService
        .getPOSProductOrdering(id);

      // if the ordering exists, return it
      if (ordering) {
        res.status(200).json(ordering);

      // if the ordering doesn't exist but the pos does, return empty ordering
      } else if (await PointOfSale.findOne(id)) {
        res.status(200).json({ pointOfSaleId: id, ordering: [] } as POSProductOrderingResponse);

      // if the pos doesn't exist 404
      } else {
        res.status(404).json('Point of sale not found.');
      }
    } catch (error) {
      this.logger.error('Could not get POS product ordering:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
  * Updates the product ordering for the requested point of sale
  * @route PATCH /pointsofsale/{id}/productordering
  * @group productOrdering - Operations of the point of sale product ordering controller
  * @param {integer} id.path.required - The id of the point of sale of the ordering
  * which should be updated
  * @param {POSProductOrderingRequest.model} ordering.body.required
  * - The ordering which should be created
  * @security JWT
  * @returns {POSProductOrderingResponse.model} 200 - The created point of sale ordering
  * @returns {string} 400 - Invalid ordering error
  * @returns {string} 400 - Invalid update error
  * @returns {string} 404 - Nonexistent product ordering error
  * @returns {string} 500 - Internal server error
  */
  public async updatePOSProductOrdering(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as POSProductOrderingRequest;
    const id = parseInt(req.params.id, 10);
    this.logger.trace('Update POS product ordering for POS', id, 'by user', req.token.user);

    // handle request
    try {
      if (await POSProductOrderingService.getPOSProductOrdering(id)) {
        if (POSProductOrderingService.verifyUpdate(id, body)) {
          if (await POSProductOrderingService.verifyOrdering(body)) {
            res.status(200).json(await POSProductOrderingService.createPOSProductOrdering(body));
          } else {
            res.status(400).json('Invalid POS product ordering.');
          }
        } else {
          res.status(400).json('Requested id does not match POS id.');
        }
      } else {
        res.status(404).json('POS product ordering not found.');
      }
    } catch (error) {
      this.logger.error('Could not update POS product ordering:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
  * Deletes a product ordering
  * @route DELETE /pointsofsale/{id}/productordering
  * @group productOrdering - Operations of the point of sale product ordering controller
  * @param {integer} id.path.required - The id of the product ordering which should be deleted
  * @security JWT
  * @returns {POSProductOrderingResponse.model} 200 - The deleted product ordering
  * @returns {string} 404 - Nonexistent product ordering error
  * @returns {string} 404 - Nonexistent point of sale error
  * @returns {string} 500 - Internal server error
  */
  public async deletePOSProductOrdering(req: RequestWithToken, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    this.logger.trace('Delete POS product ordering for POS', id, 'by user', req.token.user);

    // handle request
    try {
      if (await POSProductOrderingService.getPOSProductOrdering(id)) {
        res.status(200).json(
          await POSProductOrderingService.deletePOSProductOrdering(id),
        );
      } else if (await PointOfSale.findOne(id)) {
        res.status(404).json('POS product ordering not found.');
      } else {
        res.status(404).json('Point of sale not found.');
      }
    } catch (error) {
      this.logger.error('Could not delete POS product ordering:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
