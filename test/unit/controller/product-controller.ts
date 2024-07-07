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


import {
  Connection, IsNull, Not,
} from 'typeorm';
import express, { Application } from 'express';
import { request, expect } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import fileUpload from 'express-fileupload';
import * as fs from 'fs';
import path from 'path';
import sinon from 'sinon';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { seedProducts, seedProductCategories, seedVatGroups } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import {
  CreateProductRequest,
  UpdateProductRequest,
} from '../../../src/controller/request/product-request';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { ProductResponse } from '../../../src/controller/response/product-response';
import Product from '../../../src/entity/product/product';
import ProductController from '../../../src/controller/product-controller';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';
import { DiskStorage } from '../../../src/files/storage';
import VatGroup from '../../../src/entity/vat-group';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import ProductRevision from '../../../src/entity/product/product-revision';

/**
 * Tests if a product response is equal to the request.
 * @param source - The source from which the product was created.
 * @param response - The received product.
 * @return true if the source and response describe the same product.
 */
function productEq(source: CreateProductRequest | UpdateProductRequest, response: ProductResponse) {
  expect(source.name).to.eq(response.name);
  expect(source.category).to.eq(response.category.id);
  expect(source.alcoholPercentage).to.eq(response.alcoholPercentage);
  expect(source.priceInclVat.amount).to.eq(response.priceInclVat.amount);
  if ('ownerId' in source) {
    expect(source.ownerId).to.eq(response.owner.id);
  }
  expect(source.featured).to.eq(response.featured);
  expect(source.preferred).to.eq(response.preferred);
  expect(source.priceList).to.eq(response.priceList);
}

describe('ProductController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: ProductController,
    adminUser: User,
    localUser: User,
    organ: User,
    adminToken: String,
    organMemberToken: String,
    token: String,
    vatGroups: VatGroup[],
    tokenNoRoles: String,
    products: Product[],
    deletedProducts: Product[],
    validProductReq: UpdateProductRequest,
    invalidProductReq: UpdateProductRequest,
    validCreateProductReq: CreateProductRequest,
  };

  const stubs: sinon.SinonStub[] = [];

  // Initialize context
  before(async () => {
    // initialize test database
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const organ = {
      id: 3,
      firstName: 'Organ',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(organ);

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { products } = await seedProducts(
      [organ, adminUser, localUser], categories, vatGroups,
    );

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');
    const organMemberToken = await tokenHandler.signToken({
      user: localUser, roles: ['User', 'Seller'], organs: [organ], lesser: false,
    }, 'nonce');
    const tokenNoRoles = await tokenHandler.signToken({ user: localUser, roles: [], lesser: false }, 'nonce');

    const validProductReq: UpdateProductRequest = {
      name: 'Valid product',
      priceInclVat: {
        amount: 72,
        currency: 'EUR',
        precision: 2,
      } as DineroObjectRequest,
      alcoholPercentage: 0,
      category: 2,
      vat: 2,
      featured: true,
      preferred: true,
      priceList: true,
    };

    const invalidProductReq: UpdateProductRequest = {
      ...validProductReq,
      name: '',
    };

    const validCreateProductReq: CreateProductRequest = {
      ...validProductReq,
      ownerId: organ.id,
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const organRole = { organ: new Set<string>(['*']) };

    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Product: {
          create: all,
          get: all,
          update: all,
          delete: all,
          approve: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    roleManager.registerRole({
      name: 'Seller',
      permissions: {
        Product: {
          create: organRole,
          get: all,
          update: organRole,
          delete: organRole,
        },
      },
      assignmentCheck: async () => true,
    });

    roleManager.registerRole({
      name: 'User',
      permissions: {
        Product: {
          get: own,
          create: own,
          update: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

    const controller = new ProductController({ specification, roleManager });
    app.use(json());
    app.use(fileUpload());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/products', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      organ,
      organMemberToken,
      adminToken,
      token,
      vatGroups,
      tokenNoRoles,
      products: products.filter((p) => p.deletedAt == null),
      deletedProducts: products.filter((p) => p.deletedAt != null),
      validProductReq,
      invalidProductReq,
      validCreateProductReq,
    };
  });

  // close database connection
  after(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  // Unit test cases
  describe('GET /products', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing products in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const products = res.body.records as ProductResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      // Every product that has a current revision should be returned.
      const activeProductCount = await Product.count({ where: { currentRevision: Not(IsNull()) } });
      expect(products.length).to.equal(Math.min(activeProductCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeProductCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
    it('should adhere to pagination', async () => {
      const take = 2;
      const skip = 3;

      const res = await request(ctx.app)
        .get('/products')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const products = res.body.records as ProductResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      // Every product that has a current revision should be returned.
      const activeProductCount = await Product.count({ where: { currentRevision: Not(IsNull()) } });

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activeProductCount);
      expect(products.length).to.be.at.most(take);
    });
  });

  function testValidationOnRoute(type: any, route: string) {
    async function expectError(req: CreateProductRequest, error: string) {
      // @ts-ignore
      let res;
      if (type === 'post') {
        res = await request(ctx.app).post(route)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(req);
      } else if (type === 'patch') {
        res = await request(ctx.app).patch(route)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(req);
      }
      expect(res.status).to.eq(400);
      expect(res.body).to.eq(error);
    }
    it('should verify Alcohol', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        alcoholPercentage: -1,
      };
      await expectError(req, 'Alcohol percentage must be non-negative');
    });
    it('should verify Category', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        category: -1,
      };
      await expectError(req, '-1 is an invalid product category.');
    });
    it('should verify Price', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        priceInclVat: {
          amount: -72,
          currency: 'EUR',
          precision: 2,
        },
      };
      await expectError(req, 'Price must be greater than zero');
    });
    it('should verify Name', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        name: '',
      };
      await expectError(req, 'Name must be a non-zero length string.');
    });
    it('should verify Vat group', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        vat: 9999999,
      };
      await expectError(req, '');
    });
    it('should verify Owner', async () => {
      const req: CreateProductRequest = {
        ...ctx.validCreateProductReq,
        ownerId: ctx.localUser.id,
      };
      await expectError(req, '');
    });
  }
  describe('POST /products', () => {
    it('should verifyProductRequest Specification', async (): Promise<void> => {
      testValidationOnRoute('post', '/products');
    });

    it('should store the given product in the database and return an HTTP 200 and the product if admin', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validCreateProductReq);

      expect(await Product.count()).to.equal(productCount + 1);
      productEq(ctx.validCreateProductReq, res.body as ProductResponse);
      const databaseProduct = await Product.findOne({
        where: { id: (res.body as ProductResponse).id },
      });
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const product = res.body as ProductResponse;

      // Cleanup
      await ProductRevision.delete({ productId: product.id, revision: product.revision });
      await Product.delete({ id: product.id });
    });
    it('should store the given product in the database and return an HTTP 200 and the product if organ', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send(ctx.validCreateProductReq);

      expect(res.status).to.equal(200);
      const body = res.body as ProductResponse;
      expect(ctx.specification.validateModel(
        'ProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      expect(await Product.count()).to.equal(productCount + 1);

      productEq(ctx.validCreateProductReq, body);
      const databaseProduct = await Product.findOne({
        where: { id: body.id },
      });
      expect(databaseProduct).to.exist;
      const databaseUpdatedProduct = await Product.findOne({
        where: { id: body.id },
      });
      expect(databaseUpdatedProduct).to.exist;

      const product = res.body as ProductResponse;

      // Cleanup
      await ProductRevision.delete({ productId: product.id, revision: product.revision });
      await Product.delete({ id: product.id });
    });
    it('should return an HTTP 403 if not admin', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.tokenNoRoles}`)
        .send(ctx.validCreateProductReq);
      expect(res.status).to.equal(403);

      expect(await Product.count()).to.equal(productCount);
      expect(res.body).to.be.empty;
    });
    it('should return HTTP 400 if VAT group is deleted', async () => {
      const vatGroup = ctx.vatGroups.find((v) => v.deleted === true);
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...ctx.validCreateProductReq,
          vat: vatGroup.id,
        } as CreateProductRequest);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('vat: 5 is an invalid VAT group.');
    });
    it('should return an HTTP 400 if owner is not of type organ', async () => {
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...ctx.validProductReq,
          ownerId: ctx.localUser.id,
        } as CreateProductRequest);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('ownerId: Owner must be of type ORGAN.');
    });
  });
  describe('GET /products/:id', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'ProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the product with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as ProductResponse).id).to.equal(1);

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 200 and the product with the given id if connected via organ', async () => {
      const product = await Product.findOne({ relations: ['owner'], where: { owner: { id: ctx.organ.id } } });
      const res = await request(ctx.app)
        .get(`/products/${product.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`);
      expect(ctx.specification.validateModel(
        'ProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
      expect((res.body as ProductResponse).id).to.equal(product.id);
      expect(res.status).to.equal(200);

      const res2 = await request(ctx.app)
        .get(`/products/${product.id}`)
        .set('Authorization', `Bearer ${ctx.organ}`);
      expect(res2.status).to.eq(403);
    });
    it('should return an HTTP 404 if the product with the given id does not exist', async () => {
      const id = (await Product.count({ withDeleted: true })) + 1;
      const res = await request(ctx.app)
        .get(`/products/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(await Product.findOne({ where: { id } })).to.be.null;

      // check if product is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
  describe('PATCH /products/:id', () => {
    it('should verifyProductRequest Specification', async (): Promise<void> => {
      testValidationOnRoute('patch', '/products/1');
    });

    it('should return an HTTP 200 and the product update if user', async () => {
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validProductReq);
      expect(res.status).to.equal(200);

      const body = res.body as ProductResponse;
      productEq(ctx.validProductReq, res.body as ProductResponse);
      const databaseProduct = await Product.findOne({
        where: { id: body.id, currentRevision: body.revision },
      });
      expect(databaseProduct).to.exist;

      expect(ctx.specification.validateModel(
        'ProductResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 404 if the product is soft deleted', async () => {
      const id = ctx.deletedProducts[0].id;
      const res = await request(ctx.app)
        .get(`/products/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if banner is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 404 if the product with the given id does not exist', async () => {
      const id = await Product.count({ withDeleted: true }) + 1;
      const res = await request(ctx.app)
        .patch(`/products/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validProductReq);

      // sanity check
      expect(await Product.findOne({ where: { id } })).to.be.null;

      // check if banner is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.tokenNoRoles}`)
        .send(ctx.validProductReq);

      // check if banner is not returned
      expect(res.body).to.be.empty;

      // success code
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 400 if VAT group is deleted', async () => {
      const vatGroup = ctx.vatGroups.find((v) => v.deleted === true);
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          ...ctx.validProductReq,
          vat: vatGroup.id,
        } as CreateProductRequest);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('vat: 5 is an invalid VAT group.');
    });
  });

  describe('POST /products/:id/image', () => {
    beforeEach(() => {
      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').resolves('fileLocation');
      stubs.push(saveFileStub);
    });

    it('should upload the product image if admin', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[0];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png');

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;
      expect((await Product.findOne({ where: { id }, relations: ['image'] })).image).to.be.not.undefined;
    });
    it('should update the product image if admin', async () => {
      const stub = sinon.stub(DiskStorage.prototype, 'validateFileLocation');
      stubs.push(stub);

      const { id } = ctx.products.filter((product) => product.image !== undefined)[0];
      const { image } = await Product.findOne({ where: { id } });

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png');

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;
      expect((await Product.findOne({ where: { id }, relations: ['image'] })).image.id).to.not.equal(image);
    });
    it('should return 403 if not admin', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[1];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png');

      expect(res.status).to.equal(403);
    });
    it('should return 400 if no file is given', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[1];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(400);
    });
    it('should return 400 if file is given in wrong field', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[1];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('wrongField', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png');

      expect(res.status).to.equal(400);
    });
    it('should return 400 if two files are given', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[1];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png')
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image-duplicate.png');

      expect(res.status).to.equal(400);
    });
    it('should return 400 if no file data is given', async () => {
      const { id } = ctx.products.filter((product) => product.image === undefined)[1];

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('file', null, 'product-image.png');

      expect(res.status).to.equal(400);
    });
    it('should return 404 if product does not exist', async () => {
      const id = ctx.products[ctx.products.length - 1].id + 100;

      const res = await request(ctx.app)
        .post(`/products/${id}/image`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .attach('file', fs.readFileSync(path.join(__dirname, '../../static/product.png')), 'product-image.png');

      expect(res.status).to.equal(404);
    });
  });
  describe('DELETE /products/:id', () => {
    it('should return 204 if owner', async () => {
      const product = ctx.products.find((p) => p.owner.id === ctx.organ.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/products/${product.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbProduct = await Product.findOne({ where: { id: product.id }, withDeleted: true });
      expect(dbProduct).to.not.be.null;
      expect(dbProduct.deletedAt).to.not.be.null;

      // Cleanup
      await dbProduct.recover();
    });
    it('should return 204 for any product if admin', async () => {
      const product = ctx.products.find((p) => p.owner.id !== ctx.adminUser.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/products/${product.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbProduct = await Product.findOne({ where: { id: product.id }, withDeleted: true });
      expect(dbProduct).to.not.be.null;
      expect(dbProduct.deletedAt).to.not.be.null;

      // Cleanup
      await dbProduct.recover();
    });
    it('should return 403 if not owner', async () => {
      const product = ctx.products.find((p) => p.owner.id !== ctx.organ.id && p.deletedAt == null);
      const res = await request(ctx.app)
        .delete(`/products/${product.id}`)
        .set('Authorization', `Bearer ${ctx.organMemberToken}`)
        .send();

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should return 404 if product does not exist', async () => {
      const productId = ctx.products.length + ctx.deletedProducts.length + 2;

      const res = await request(ctx.app)
        .delete(`/products/${productId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Product not found');
    });
    it('should return 404 if product is soft deleted', async () => {
      const productId = ctx.deletedProducts[0].id;

      const res = await request(ctx.app)
        .delete(`/products/${productId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send();

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Product not found');
    });
  });
});
