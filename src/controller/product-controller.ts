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
import ProductService from '../service/product-service';

export default class ProductController extends BaseController {
  private logger: Logger = log4js.getLogger('ProductController');

  /**
   * Creates a new product controller instance.
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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.returnAllProducts.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.returnSingleProduct.bind(this),
        },
      },
      '/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.returnAllUpdatedProducts.bind(this),
        },
      },
      '/updated/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.returnSingleUpdatedProduct.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing products
   * @route GET /products
   * @group products - Operations of product controller
   * @security JWT
   * @returns {Array<ProductResponse>} 200 - All existing products
   * @returns {string} 500 - Internal server error
   */
  public async returnAllProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all products', body, 'by user', req.token.user);

    // Handle request
    try {
      const products = await ProductService.getProducts();
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested product
   * @route GET /products/{id}
   * @group products - Operations of products controller
   * @param {integer} id.path.required - The id of the product which should be returned
   * @security JWT
   * @returns {Product.model} 200 - The requested product entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleProduct(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single product', id, 'by user', req.token.user);

    // handle request
    try {
      // check if product in database
      const product = await ProductService.getProducts({ productId: parseInt(id, 10) });
      if (product) {
        res.json(product);
      } else {
        res.status(404).json('Product not found.');
      }
    } catch (error) {
      this.logger.error('Could not return product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all updated products
   * @route GET /products/updated
   * @group products - Operations of product controller
   * @security JWT
   * @returns {Array<Product>} 200 - All existing updated products
   * @returns {string} 500 - Internal server error
   */
  public async returnAllUpdatedProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all updated products', body, 'by user', req.token.user);

    // Handle request
    try {
      const products = await ProductService.getUpdatedProducts();
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested updated product
   * @route GET /products/updated/{id}
   * @group products - Operations of products controller
   * @param {integer} id.path.required - The id of the product which should be returned
   * @security JWT
   * @returns {Product.model} 200 - The requested updated product entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleUpdatedProduct(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single product', id, 'by user', req.token.user);

    // handle request
    try {
      // check if product in database
      const product = await ProductService.getUpdatedProducts({ productId: parseInt(id, 10) });
      if (product) {
        res.json(product);
      } else {
        res.status(404).json('Product not found.');
      }
    } catch (error) {
      this.logger.error('Could not return product:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
