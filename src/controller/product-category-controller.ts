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
import ProductCategoryService from '../service/product-category-service';
import ProductCategoryRequest from './request/product-category-request';
import ProductCategory from '../entity/product/product-category';

export default class ProductCategoryController extends BaseController {
  private logger: Logger = log4js.getLogger('ProductCategoryController');

  /**
     * Creates a new product-category controller instance.
     * @param options - The options passed to the base controller.
     */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
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
          body: { modelName: 'ProductRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'ProductCategory', ['*']),
          handler: this.postProductCategory.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'ProductCategory', ['*']),
          handler: this.returnSingleProductCategory.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing product-categories
   * @route GET /product-categories
   * @group productCategories - Operations of product-categories controller
   * @security JWT
   * @returns {Array<ProductCategoryResponse>} 200 - All existing product-categories
   * @returns {string} 500 - Internal server error
   */
  public async returnAllProductCategories(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all product-categories', body, 'by user', req.token.user);
    // Handle request
    try {
      const productCategories = await ProductCategoryService.getProductCategories();
      res.json(productCategories);
    } catch (error) {
      this.logger.error('Could not return all product-categories:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Post a new product-category.
   * @route POST /product-categories
   * @group productCategories - Operations of product-categories controller
   * @param {ProductCategoryRequest.model} productCategory.body.required - The product-category which should be created
   * @security JWT
   * @returns {ProductResponse.model} 200 - The created product-category entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async postProductCategory(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ProductCategoryRequest;
    this.logger.trace('Create product-category', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(await ProductCategoryService.postProductCategory(body));
    } catch (error) {
      this.logger.error('Could not create product-category:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested product-category
   * @route GET /product-categories/{id}
   * @group productCategories - Operations of product-categories controller
   * @param {integer} id.path.required - The id of the product-category which should be returned
   * @security JWT
   * @returns {ProductCategoryResponse.model} 200 - The requested product-category entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleProductCategory(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single product-category', id, 'by user', req.token.user);

    // handle request
    try {
      // check if product in database
      const productCategory = (await ProductCategoryService.getProductCategories({ id: parseInt(id, 10) }))[0];
      if (productCategory) {
        res.json(productCategory);
      } else {
        res.status(404).json('Product-category not found.');
      }
    } catch (error) {
      this.logger.error('Could not return product-category:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
