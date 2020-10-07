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
import dinero from 'dinero.js';
import log4js, { Logger } from 'log4js';
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import Product from '../entity/product';
import CreateProductRequest from './request/create-product-request';
import ProductCategory from '../entity/product-category';

export default class ProductController extends BaseController {
  private logger: Logger = log4js.getLogger('ProductController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        POST: {
          body: { modelName: 'CreateProductRequest' },
          policy: this.canCreateProduct.bind(this),
          handler: this.createProduct.bind(this),
        },
        GET: {
          policy: async () => true,
          handler: this.getProducts.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canCreateProduct(req: RequestWithToken): Promise<boolean> {
    const body = req.body as CreateProductRequest;
    return body.owner.id === req.token.user.id;
  }

  /**
   * Creates a new product entity.
   * @route POST /products
   * @group products - Operations of product controller
   * @param {CreateProductRequest.model} product.body.required - The new product.
   * @security JWT
   * @returns {Product.model} 200 - The created product entity.
   * @returns {string} 400 - Validation error.
   */
  public async createProduct(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateProductRequest;
    this.logger.trace('Create product', body, 'by user', req.token.user);

    // Validate that the currency is supported
    if (body.price.currency !== dinero.defaultCurrency
     || body.price.precision !== dinero.defaultPrecision) {
      res.status(400).json('Invalid price.');
      return;
    }

    // Validate the existence of the product category
    if (await ProductCategory.findOne(body.category) === undefined) {
      res.status(400).json('Invalid product category.');
      return;
    }

    try {
      const product: any = {
        ...body,
        price: dinero(body.price),
      };
      await Product.save(product as Product);
      res.json(product);
    } catch (error) {
      this.logger.error('Could not create product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Gets all product entities.
   * @route GET /products
   * @group products - Operations of product controller
   * @security JWT
   * @returns {Array<Product>} 200 - The collection of all products.
   * @returns {string} 400 - Validation error.
   */
  public async getProducts(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all products by user', req.token.user);

    try {
      const products = await Product.find({
        relations: [
          'owner',
          'category',
        ],
      });
      res.json(products);
    } catch (error) {
      this.logger.error('Could not get all products:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
