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
import CreateProductParams, {
  CreateProductRequest,
  UpdateProductParams,
  UpdateProductRequest,
} from './request/product-request';
import Product from '../entity/product/product';
import FileService from '../service/file-service';
import { PRODUCT_IMAGE_LOCATION } from '../files/storage';
import { parseRequestPagination } from '../helpers/pagination';
import { verifyCreateProductRequest, verifyProductRequest } from './request/validators/product-request-spec';
import { isFail } from '../helpers/specification-validation';
import { asNumber } from '../helpers/validators';
import userTokenInOrgan from '../helpers/token-helper';

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
    this.fileService = new FileService(PRODUCT_IMAGE_LOCATION);
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
          body: { modelName: 'CreateProductRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', ProductController.postRelation(req), 'Product', ['*']),
          handler: this.createProduct.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await ProductController.getRelation(req), 'Product', ['*']),
          handler: this.getSingleProduct.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateProductRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await ProductController.getRelation(req), 'Product', ['*']),
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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await ProductController.getRelation(req), 'Product', ['*']),
          handler: this.getSingleUpdatedProduct.bind(this),
        },
      },
      '/:id(\\d+)/approve': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'approve', await ProductController.getRelation(req), 'Product', ['*']),
          handler: this.approveUpdate.bind(this),
        },
      },
      '/:id(\\d+)/image': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', await ProductController.getRelation(req), 'Product', ['*']),
          handler: this.updateProductImage.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing products
   * @route GET /products
   * @operationId getAllProducts
   * @group products - Operations of product controller
   * @security JWT
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @returns {PaginatedProductResponse.model} 200 - All existing products
   * @returns {string} 500 - Internal server error
   */
  public async getAllProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all products', body, 'by user', req.token.user);

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
      const products = await ProductService.getProducts({}, { take, skip });
      res.status(200).json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Create a new product.
   * @route POST /products
   * @operationId createProduct
   * @group products - Operations of product controller
   * @param {CreateProductRequest.model} product.body.required - The product which should be created
   * @security JWT
   * @returns {UpdatedProductResponse.model} 200 - The created product entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createProduct(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateProductRequest;
    this.logger.trace('Create product', body, 'by user', req.token.user);

    // handle request
    try {
      const request: CreateProductParams = {
        ...body,
        ownerId: body.ownerId ?? req.token.user.id,
      };

      const validation = await verifyCreateProductRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const approve = this.roleManager.can(req.token.roles, 'approve', await ProductController.getRelation(req), 'Product', ['*']);
      res.json(await ProductService.createProduct(request, approve));
    } catch (error) {
      this.logger.error('Could not create product:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Update an existing product.
   * @route PATCH /products/{id}
   * @operationId updateProduct
   * @group products - Operations of product controller
   * @param {integer} id.path.required - The id of the product which should be updated
   * @param {UpdateProductRequest.model} product.body.required - The product which should be updated
   * @security JWT
   * @returns {ProductResponse.model} 200 - The created product entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Product not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateProduct(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateProductRequest;
    const { id } = req.params;
    const productId = Number.parseInt(id, 10);
    this.logger.trace('Update product', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      const params: UpdateProductParams = {
        ...body,
        id: productId,
      };

      const validation = await verifyProductRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const product = await Product.findOne({ where: { id: productId } });
      if (!product) {
        res.status(404).json('Product not found.');
        return;
      }

      const approve = this.roleManager.can(req.token.roles, 'approve', await ProductController.getRelation(req), 'Product', ['*']);
      if (approve) {
        res.json(await ProductService.directProductUpdate(params));
      } else {
        res.json(await ProductService.updateProduct(params));
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
   * @operationId getSingleProduct
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
      const product = (await ProductService
        .getProducts({ productId: parseInt(id, 10) })).records[0];
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
   * @operationId getUpdatedProducts
   * @group products - Operations of product controller
   * @security JWT
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @returns {PaginatedProductResponse.model} 200 - All existing updated products
   * @returns {string} 500 - Internal server error
   */
  public async getAllUpdatedProducts(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all updated products', body, 'by user', req.token.user);

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
      const products = await ProductService.getProducts({ updatedProducts: true }, { take, skip });
      res.json(products);
    } catch (error) {
      this.logger.error('Could not return all products:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested updated product
   * @route GET /products/{id}/update
   * @operationId getUpdateProduct
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
      if (await Product.findOne({ where: { id: productId } })) {
        res.json((await ProductService
          .getProducts({ updatedProducts: true, productId: parseInt(id, 10) })).records[0]);
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
   * @operationId updateProductImage
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
    const file = files.file as UploadedFile;
    if (file.data === undefined) {
      res.status(400).send('File body data is missing from request');
      return;
    }
    if (file.name === undefined) {
      res.status(400).send('File name is missing from request');
      return;
    }

    const productId = parseInt(id, 10);

    // handle request
    try {
      const product = await Product.findOne({ where: { id: productId }, relations: ['image'] });
      if (product) {
        await this.fileService.uploadEntityImage(
          product, file, req.token.user,
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

  /**
   * Function to determine which credentials are needed to post product
   *    'all' if user is not connected to product
   *    'organ' if user is not connected to product via organ
   *    'own' if user is connected to product
   * @param req - Request with CreateProductRequest as body
   * @returns whether product is connected to user token
   */
  static postRelation(req: RequestWithToken): string {
    const request = req.body as CreateProductRequest;
    if (request.ownerId && userTokenInOrgan(req, request.ownerId)) return 'organ';
    if (request.ownerId && request.ownerId === req.token.user.id) return 'all';
    return 'own';
  }

  /**
   * Function to determine which credentials are needed to get product
   *    'all' if user is not connected to product
   *    'own' if user is connected to product
   * @param req - Request with product id as param
   * @returns whether product is connected to user token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const productId = asNumber(req.params.id);
    const product = await Product.findOne({ where: { id: productId }, relations: ['owner'] });
    if (product && product.owner.id === req.token.user.id) return 'own';
    if (product && userTokenInOrgan(req, product.owner.id)) return 'organ';
    return 'all';
  }
}
