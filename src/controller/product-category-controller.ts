/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

/**
 * This is the module page of product-category-controller.
 *
 * @module catalogue/product-categories
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import ProductCategoryService from '../service/product-category-service';
import ProductCategoryRequest from './request/product-category-request';
import { parseRequestPagination, toResponse } from '../helpers/pagination';

/**
 * Controller for managing all routes related to the `product category` entity.
 */
export default class ProductCategoryController extends BaseController {
  private logger: Logger = log4js.getLogger('ProductCategoryController');

  /**
     * Creates a new productcategory controller instance.
     * @param options - The options passed to the base controller.
     */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritdoc
   */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'ProductCategory', ['*']),
          handler: this.returnAllProductCategories.bind(this),
        },
        POST: {
          body: { modelName: 'ProductCategoryRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'ProductCategory', ['*']),
          handler: this.postProductCategory.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'ProductCategory', ['*']),
          handler: this.returnSingleProductCategory.bind(this),
        },
        PATCH: {
          body: { modelName: 'ProductCategoryRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'ProductCategory', ['*']),
          handler: this.updateProductCategory.bind(this),
        },
      },
    };
  }

  /**
   * GET /productcategories
   * @summary Returns all existing productcategories
   * @operationId getAllProductCategories
   * @tags productCategories - Operations of productcategory controller
   * @security JWT
   * @param {boolean} onlyRoot.query - Whether to return only root categories
   * @param {boolean} onlyLeaf.query - Whether to return only leaf categories
   * @param {integer} take.query - How many product categories the endpoint should return
   * @param {integer} skip.query - How many product categories should be skipped (for pagination)
   * @return {PaginatedProductCategoryResponse} 200 - All existing productcategories
   * @return {string} 500 - Internal server error
   */
  public async returnAllProductCategories(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all productcategories', body, 'by user', req.token.user);

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
      const [categories, count] = await ProductCategoryService
        .getProductCategories({
          onlyRoot: req.query.onlyRoot === 'true',
          onlyLeaf: req.query.onlyLeaf === 'true',
        }, { take, skip });
      res.json(toResponse(
        categories.map(ProductCategoryService.asProductCategoryResponse),
        count,
        { take, skip },
      ));
    } catch (error) {
      this.logger.error('Could not return all product-categories:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /productcategories
   * @summary Post a new productCategory.
   * @operationId createProductCategory
   * @tags productCategories - Operations of productcategory controller
   * @param {ProductCategoryRequest} request.body.required
   * - The productCategory which should be created
   * @security JWT
   * @return {ProductCategoryResponse} 200 - The created productcategory entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async postProductCategory(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ProductCategoryRequest;
    this.logger.trace('Create productcategory', body, 'by user', req.token.user);
    try {
      if (await ProductCategoryService.verifyProductCategory(body)) {
        const category = await ProductCategoryService.postProductCategory(body);
        res.json(ProductCategoryService.asProductCategoryResponse(category));
      } else {
        res.status(400).json('Invalid productcategory.');
      }
    } catch (error) {
      this.logger.error('Could not create productcategory:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /productcategories/{id}
   * @summary Returns the requested productcategory
   * @operationId getSingleProductCategory
   * @tags productCategories - Operations of productcategory controller
   * @param {integer} id.path.required - The id of the productcategory which should be returned
   * @security JWT
   * @return {ProductCategoryResponse} 200 - The requested productcategory entity
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async returnSingleProductCategory(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single productcategory', id, 'by user', req.token.user);

    // handle request
    try {
      // check if product in database
      const parsedId = parseInt(id, 10);
      const [categories] = await ProductCategoryService.getProductCategories({ id: parsedId });
      if (categories.length > 0) {
        res.json(ProductCategoryService.asProductCategoryResponse(categories[0]));
      } else {
        res.status(404).json('Productcategory not found.');
      }
    } catch (error) {
      this.logger.error('Could not return productcategory:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /productcategories/{id}
   * @summary Update an existing productcategory.
   * @operationId updateProductCategory
   * @tags productCategories - Operations of productcategory controller
   * @param {integer} id.path.required - The id of the productcategory which should be returned
   * @param {ProductCategoryRequest} request.body.required
   * - The productcategory which should be created
   * @security JWT
   * @return {ProductCategoryResponse} 200 - The patched productcategory entity
   * @return {string} 400 - Validation error
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async updateProductCategory(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ProductCategoryRequest;
    const { id } = req.params;
    this.logger.trace('Update productcategory', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      if (await ProductCategoryService.verifyProductCategory(body)) {
        const parsedId = Number.parseInt(id, 10);
        const category = await ProductCategoryService.patchProductCategory(parsedId, body);
        if (category) {
          res.json(ProductCategoryService.asProductCategoryResponse(category));
        } else {
          res.status(404).json('Productcategory not found.');
        }
      } else {
        res.status(400).json('Invalid productcategory.');
      }
    } catch (error) {
      this.logger.error('Could not update productcategory:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
