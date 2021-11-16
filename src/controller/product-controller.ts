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
import { UploadedFile } from 'express-fileupload';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import ProductService from '../service/product-service';
import ProductRequest from './request/product-request';
import Product from '../entity/product/product';
import FileService from '../service/file-service';
import { PRODUCT_IMAGE_LOCATION } from '../files/storage';

export default class ProductController extends BaseController {
  private logger: Logger = log4js.getLogger('ProductController');

  private fileService: FileService;

  /**
   * Creates a new product controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.fileService = new FileService(PRODUCT_IMAGE_LOCATION, 'disk');
  }

  /**
   * @inheritdoc
   */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.getAllProducts.bind(this),
        },
        POST: {
          body: { modelName: 'ProductRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Product', ['*']),
          handler: this.createProduct.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.getSingleProduct.bind(this),
        },
        PATCH: {
          body: { modelName: 'ProductRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Product', ['*']),
          handler: this.updateProduct.bind(this),
        },
      },
      '/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.getAllUpdatedProducts.bind(this),
        },
      },
      '/:id(\\d+)/update': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Product', ['*']),
          handler: this.getSingleUpdatedProduct.bind(this),
        },
      },
      '/:id(\\d+)/approve': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Product', ['*']),
          handler: this.approveUpdate.bind(this),
        },
      },
      '/:id(\\d+)/image': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Product', ['*']),
          handler: this.updateProductImage.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing products
   * @route GET /products
   * @group products - Operations of product controller
   * @security JWT
   * @returns {Array.<ProductResponse>} 200 - All existing products
   * @returns {string} 500 - Internal server error
   */
  public async getAllProducts(req: RequestWithToken, res: Response): Promise<void> {
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
   * Create a new product.
   * @route POST /products
   * @group products - Operations of product controller
   * @param {ProductRequest.model} product.body.required - The product which should be created
   * @security JWT
   * @returns {ProductResponse.model} 200 - The created product entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createProduct(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ProductRequest;
    this.logger.trace('Create product', body, 'by user', req.token.user);

    // handle request
    try {
      if (await ProductService.verifyProduct(body)) {
        res.json(await ProductService.createProduct(req.token.user, body));
      } else {
        res.status(400).json('Invalid product.');
      }
    } catch (error) {
      this.logger.error('Could not create product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Update an existing product.
   * @route PATCH /products/{id}
   * @group products - Operations of product controller
   * @param {integer} id.path.required - The id of the product which should be updated
   * @param {ProductRequest.model} product.body.required - The product which should be updated
   * @security JWT
   * @returns {ProductResponse.model} 200 - The created product entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Product not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateProduct(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ProductRequest;
    const { id } = req.params;
    this.logger.trace('Update product', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      if (await ProductService.verifyProduct(body)) {
        const update = await ProductService.updateProduct(Number.parseInt(id, 10), body);
        if (update) {
          res.json(update);
        } else {
          res.status(404).json('Product not found.');
        }
      } else {
        res.status(400).json('Invalid product.');
      }
    } catch (error) {
      this.logger.error('Could not update product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Approve a product update.
   * @route POST /products/{id}/approve
   * @param {integer} id.path.required - The id of the product update to approve
   * @group products - Operations of product controller
   * @security JWT
   * @returns {ProductResponse.model} 200 - The approved product entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async approveUpdate(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Update accepted', id, 'by user', req.token.user);

    const productId = Number.parseInt(id, 10);
    // Handle
    try {
      const product = await ProductService.approveProductUpdate(productId);
      if (product) {
        res.json(product);
      } else {
        res.status(404).json('Product update not found.');
      }
    } catch (error) {
      this.logger.error('Could not approve update: ', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested product
   * @route GET /products/{id}
   * @group products - Operations of products controller
   * @param {integer} id.path.required - The id of the product which should be returned
   * @security JWT
   * @returns {ProductResponse.model} 200 - The requested product entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getSingleProduct(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single product', id, 'by user', req.token.user);

    // handle request
    try {
      // check if product in database
      const product = (await ProductService.getProducts({ productId: parseInt(id, 10) }))[0];
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
   * @returns {Array.<ProductResponse>} 200 - All existing updated products
   * @returns {string} 500 - Internal server error
   */
  public async getAllUpdatedProducts(req: RequestWithToken, res: Response): Promise<void> {
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
   * @route GET /products/{id}/update
   * @group products - Operations of products controller
   * @param {integer} id.path.required - The id of the product which should be returned
   * @security JWT
   * @returns {ProductResponse.model} 200 - The requested updated product entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getSingleUpdatedProduct(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single product', id, 'by user', req.token.user);

    const productId = parseInt(id, 10);

    // handle request
    try {
      if (await Product.findOne(productId)) {
        res.json((await ProductService.getUpdatedProducts({ productId: parseInt(id, 10) }))[0]);
      } else {
        res.status(404).json('Product not found.');
      }
    } catch (error) {
      this.logger.error('Could not return product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Upload a new image for a product
   * @route POST /products/{id}/image
   * @group products - Operations of products controller
   * @consumes multipart/form-data
   * @param {integer} id.path.required - The id of the product which should be returned
   * @param {file} file.formData
   * @security JWT
   * @returns 204 - Success
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async updateProductImage(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const { files } = req;
    this.logger.trace('Update product', id, 'image by user', req.token.user);

    if (!req.files || Object.keys(files).length !== 1) {
      res.status(400).send('No file or too many files were uploaded');
      return;
    }
    if (files.file === undefined) {
      res.status(400).send("No file is uploaded in the 'file' field");
      return;
    }

    const productId = parseInt(id, 10);

    // handle request
    try {
      const product = await Product.findOne(productId, { relations: ['image'] });
      if (product) {
        await this.fileService.uploadProductImage(
          product, files.file as UploadedFile, req.token.user,
        );
        res.status(204).send();
      } else {
        res.status(404).json('Product not found');
        return;
      }
    } catch (error) {
      this.logger.error('Could not upload image:', error);
      res.status(500).json('Internal server error');
    }
  }
}
