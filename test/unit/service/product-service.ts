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
import { Connection, getManager } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ProductService, { ProductFilterParameters } from '../../../src/service/product-service';
import {
  seedAllProducts, seedAllContainers, seedProductCategories,
  seedUsers, seedAllPointsOfSale, seedVatGroups,
} from '../../seed';
import Product from '../../../src/entity/product/product';
import { PaginatedProductResponse, ProductResponse } from '../../../src/controller/response/product-response';
import ProductRevision from '../../../src/entity/product/product-revision';
import UpdatedProduct from '../../../src/entity/product/updated-product';
import UpdatedContainer from '../../../src/entity/container/updated-container';
import Container from '../../../src/entity/container/container';
import ContainerRevision from '../../../src/entity/container/container-revision';
import CreateProductParams, { UpdateProductParams } from '../../../src/controller/request/product-request';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import UpdatedPointOfSale from '../../../src/entity/point-of-sale/updated-point-of-sale';
import ProductImage from '../../../src/entity/file/product-image';
import User from '../../../src/entity/user/user';
import { CreateContainerParams } from '../../../src/controller/request/container-request';
import ContainerService from '../../../src/service/container-service';
import { CreatePointOfSaleParams } from '../../../src/controller/request/point-of-sale-request';
import PointOfSaleService from '../../../src/service/point-of-sale-service';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import AuthenticationService from '../../../src/service/authentication-service';

chai.use(deepEqualInAnyOrder);

/**
 * Test if the price excluding VAT in the response is correct
 * @param response
 */
function correctPriceExclVat(response: ProductResponse) {
  const priceInclVat = Math.round(
    response.priceExclVat.amount * (1 + (response.vat.percentage / 100)),
  );
  // Rounding issues are a thing, e.g. with price including 21% VAT of 78
  const diff = Math.abs(priceInclVat - response.priceInclVat.amount);
  expect(diff).to.be.at.most(1);
}

/**
 * Test if all the product responses are part of the product set array.
 * @param response
 * @param superset
 */
function returnsAll(response: ProductResponse[], superset: Product[]) {
  expect(response).to.not.be.empty;
  const temp = superset.map((prod) => ({
    id: prod.id, ownerid: prod.owner.id, image: prod.image != null ? prod.image.downloadName : null,
  }));
  expect(response.map((prod) => ({ id: prod.id, ownerid: prod.owner.id, image: prod.image })))
    .to.deep.equalInAnyOrder(temp);
}

interface ProductWithRevision {
  product: Product,
  revision: number
}

/**
 * Test if all the product responses are part of the product set array.
 * @param response
 * @param superset
 */
function returnsAllRevisions(response: ProductResponse[], superset: ProductWithRevision[]) {
  expect(response).to.not.be.empty;
  expect(response.map((prod) => ({ id: prod.id, revision: prod.revision, ownerid: prod.owner.id })))
    .to.deep.equalInAnyOrder(superset.map((prod) => (
      ({ id: prod.product.id, revision: prod.revision, ownerid: prod.product.owner.id }))));
}

function productRevisionToProductWithRevision(product: ProductRevision): ProductWithRevision {
  return {
    product: product.product,
    revision: product.revision,
  };
}

function validateProductProperties(response: ProductResponse,
  productParams: CreateProductParams | UpdateProductParams) {
  Object.keys(productParams).forEach((key: keyof CreateProductParams) => {
    if (key === 'priceInclVat') {
      expect((productParams[key] as any).amount).to.be.equal((response.priceInclVat.amount));
    } else if (key === 'category') {
      expect((productParams[key] as any)).to.be.equal((response.category.id));
    } else if (key === 'vat') {
      expect((productParams[key] as any)).to.be.equal((response.vat.id));
    } else if (key === 'ownerId') {
      if ((productParams as any).ownerId !== undefined) {
        expect((productParams as any).ownerId).to.be.equal((response.owner.id));
      }
    } else {
      expect((productParams[key] as any)).to.be.equal((response[key]));
    }
  });
}

describe('ProductService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    products: Product[],
    productImages: ProductImage[],
    productRevisions: ProductRevision[],
    updatedProducts: UpdatedProduct[],
    containers: Container[],
    containerRevisions: ContainerRevision[],
    updatedContainers: UpdatedContainer[],
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    updatedPointsOfSale: UpdatedPointOfSale[],
  };

  before(async () => {
    const connection = await Database.initialize();

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const users = await seedUsers();

    const {
      products,
      productImages,
      productRevisions,
      updatedProducts,
    } = await seedAllProducts(users, categories, vatGroups);
    const {
      containers,
      containerRevisions,
      updatedContainers,
    } = await seedAllContainers(users, productRevisions, products);
    const {
      pointsOfSale,
      pointOfSaleRevisions,
      updatedPointsOfSale,
    } = await seedAllPointsOfSale(users, containerRevisions, containers);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      products,
      productImages,
      productRevisions,
      updatedProducts,
      containers,
      containerRevisions,
      updatedContainers,
      pointsOfSale,
      pointOfSaleRevisions,
      updatedPointsOfSale,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('getProducts function', () => {
    it('should return all products with no input specification', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ProductService.getProducts();

      const products = ctx.products.filter((prod) => prod.currentRevision !== null);

      returnsAll(records, products);
      for (let i = 0; i < records.length; i += 1) {
        const p = records[i];
        if (p.vat !== undefined || p.priceExclVat !== undefined) {
          correctPriceExclVat(p);
        } else {
          // eslint-disable-next-line no-await-in-loop
          const productRevision = await ProductRevision.findOne({
            where: { product: { id: p.id }, revision: p.revision },
            relations: ['vat'],
          });
          const vatGroup = productRevision!.vat;
          expect(vatGroup.hidden).to.be.true;
        }
      }

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(products.length);
    });
    it('should return all updated products', async () => {
      const updatedProducts: PaginatedProductResponse = await ProductService.getProducts(
        { updatedProducts: true },
      );
      const products = ctx.updatedProducts.map((prod) => prod.product);

      returnsAll(updatedProducts.records, products);
    });
    it('should return product with the ownerId specified', async () => {
      const owner = ctx.products[0].owner.id;
      const params: ProductFilterParameters = { ownerId: ctx.products[0].owner.id };
      const { records } = await ProductService.getProducts(params);

      const products = ctx.products.filter((prod) => (
        prod.currentRevision !== null && prod.owner.id === owner));

      returnsAll(records, products);
    });
    it('should return product with the revision specified', async () => {
      const productId = ctx.products[0].id;
      const productRevision = ctx.products[0].currentRevision - 1;
      expect(productRevision).to.be.greaterThan(0);

      const params: ProductFilterParameters = { productId, productRevision };
      const { records } = await ProductService.getProducts(params);

      const product: ProductWithRevision[] = [productRevisionToProductWithRevision(
        ctx.productRevisions.find((prod) => (
          (prod.revision === productRevision && prod.product.id === productId))),
      )];

      returnsAllRevisions(records, product);
    });
    it('should return a single product if productId is specified', async () => {
      const params: ProductFilterParameters = { productId: ctx.products[0].id };
      const { records } = await ProductService.getProducts(params);

      returnsAll(records, [ctx.products[0]]);
    });
    it('should return no products if the userId and productId dont match', async () => {
      const params: ProductFilterParameters = {
        ownerId: ctx.products[0].owner.id + 1,
        productId: ctx.products[0].id,
      };
      const { records } = await ProductService.getProducts(params);

      expect(records).to.be.empty;
    });
    it('should return the products belonging to a VAT group', async () => {
      const params: ProductFilterParameters = {
        vatGroupId: 1,
      };
      const { records } = await ProductService.getProducts(params);

      const products = ctx.productRevisions
        .filter((rev) => rev.vat.id === params.vatGroupId)
        .filter((rev) => rev.revision === rev.product.currentRevision);

      returnsAllRevisions(records, products);
    });
    it('should return the products belonging to a container', async () => {
      const params: ProductFilterParameters = {
        containerId: 3,
      };
      const { records } = await ProductService.getProducts(params);

      const products = ctx.containerRevisions
        .filter((rev) => {
          const container = ctx.containers.filter((cont) => cont.id === 3)[0];
          return rev.container.id === container.id && rev.revision === container.currentRevision;
        })
        .map((rev) => rev.products.map((prod) => prod.product))[0];

      returnsAll(records, products);
    });
    it('should return the updated products belonging to a container', async () => {
      const params: ProductFilterParameters = {
        containerId: 3,
        updatedProducts: true,
      };
      const { records } = await ProductService.getProducts(params);

      const products = ctx.containerRevisions.filter((rev) => {
        const container = ctx.containers.filter((cont) => cont.id === 3)[0];
        return rev.container.id === container.id && rev.revision === container.currentRevision;
      }).map((rev) => rev.products.map((prod) => prod.product))[0]
        .filter((prod) => (
          ctx.updatedProducts.map((upd) => upd.product).includes(prod)
        ));

      returnsAll(records, products);
    });
    it('should return the updated products belonging to an updatedContainer', async () => {
      const params: ProductFilterParameters = {
        containerId: 4,
        updatedContainer: true,
        updatedProducts: true,
      };
      const { records } = await ProductService.getProducts(params);

      const products = ctx.updatedContainers
        .filter((upd) => upd.container.id === 4)
        .map((upd) => upd.products)[0]
        .filter((prod) => ctx.updatedProducts
          .map((updprod) => updprod.product).includes(prod));

      // const products = ctx.containerRevisions.filter((rev) => {
      //   const container = ctx.containers.filter((cont) => cont.id === 3)[0];
      //   return rev.container.id === container.id && rev.revision === container.currentRevision;
      // }).map((rev) => rev.products.map((prod) => prod.product))[0]
      //   .filter((prod) => (ctx.updatedProducts
      //     .map((upd) => upd.product).includes(prod)));

      returnsAll(records, products);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await ProductService
        .getProducts({ updatedProducts: true }, { take, skip });
      const products = ctx.updatedProducts.map((prod) => prod.product);

      expect(_pagination.take).to.equal(take);
      expect(_pagination.skip).to.equal(skip);
      expect(_pagination.count).to.equal(products.length);
      expect(records.length).to.be.at.most(take);
    });
    it('should return the products belonging to a container revision that is not current', async () => {
      const params: ProductFilterParameters = {
        containerId: 1,
        containerRevision: 2,
      };

      const { records } = await ProductService.getProducts(params);

      const products = [1, 2, 5];
      expect(records.map((prod) => prod.id)).to.deep.equalInAnyOrder(products);
    });
    it('should return an updated container', async () => {
      const { id } = (await UpdatedContainer.findOne({ where: {}, relations: ['container'] })).container;
      const { records }: PaginatedProductResponse = await ProductService
        .getProducts({ containerId: id, updatedContainer: true });

      const { products } = ctx.updatedContainers
        .filter((cnt) => cnt.container.id === id)[0];

      returnsAll(records, products);
    });
    it('should return the products belonging to a point of sale', async () => {
      const { records } = await ProductService
        .getProducts({ pointOfSaleId: 1 });

      const { containers } = ctx.pointOfSaleRevisions.filter((pos) => (
        (pos.pointOfSale.id === 1 && pos.revision === pos.pointOfSale.currentRevision)))[0];

      const productRevisions = (containers.map((p) => p.products.map((pr) => pr)))
        .reduce((prev, cur) => prev.concat(cur));

      const products = productRevisions.map((p) => ((
        { product: p.product, revision: p.revision } as ProductWithRevision)));

      const filteredProducts = products.reduce((acc: ProductWithRevision[], current) => {
        if (!acc.some((item) => (
          (item.product.id === current.product.id && item.revision === current.revision)))) {
          acc.push(current);
        }
        return acc;
      }, []);

      returnsAllRevisions(records, filteredProducts);
    });
    it('should return all points of sale involving a single user and its memberAuthenticator users', async () => {
      const usersOwningAProd = [...new Set(ctx.products.map((prod) => prod.owner))];
      const owner = usersOwningAProd[0];

      // Sanity check
      const memberAuthenticators = await MemberAuthenticator.find({
        where: { user: { id: owner.id } },
      });
      expect(memberAuthenticators.length).to.equal(0);

      let products = await ProductService.getProducts({}, {}, owner);
      const originalLength = products.records.length;
      products.records.forEach((prod) => {
        expect(prod.owner.id).to.equal(owner.id);
      });

      await AuthenticationService
        .setMemberAuthenticator(getManager(), [owner], usersOwningAProd[1]);

      const ownerIds = [owner, usersOwningAProd[1]].map((o) => o.id);
      products = await ProductService.getProducts({}, {}, owner);
      expect(products.records.length).to.be.greaterThan(originalLength);
      products.records.forEach((prod) => {
        expect(ownerIds).to.include(prod.owner.id);
      });

      // Cleanup
      await MemberAuthenticator.delete({ user: { id: owner.id } });
    });
  });

  describe('updateProducts function', () => {
    it('should update a product by ID', async () => {
      const updateParams: UpdateProductParams = {
        category: 3,
        vat: 1,
        id: 2,
        alcoholPercentage: 8,
        name: 'Product2-update',
        priceInclVat: {
          amount: 72,
          currency: 'EUR',
          precision: 2,
        },
      };

      const res: ProductResponse = await ProductService.updateProduct(updateParams);

      validateProductProperties(res, updateParams);

      expect(res).to.exist;
    });

    it('should create a new product', async () => {
      const amount = 77;

      const productParams: CreateProductParams = {
        alcoholPercentage: 9,
        name: 'Product77-update',
        priceInclVat: {
          amount,
          currency: 'EUR',
          precision: 2,
        },
        category: 1,
        vat: 1,
        ownerId: ctx.users[0].id,
      };

      const res: ProductResponse = await ProductService.createProduct(productParams);

      validateProductProperties(res, productParams);
      expect(res).to.exist;

      // Hard Clean up
      await UpdatedProduct.delete(res.id);
      await Product.delete(res.id);
    });

    it('should confirm an updated product', async () => {
      // Create a new product.
      const amount = 77;

      const productParams: CreateProductParams = {
        alcoholPercentage: 9,
        ownerId: ctx.users[0].id,
        name: 'Product77-update',
        priceInclVat: {
          amount: amount - 1,
          currency: 'EUR',
          precision: 2,
        },
        category: 1,
        vat: 1,
      };

      const res: ProductResponse = await ProductService.createProduct(productParams);

      const updateParams: UpdateProductParams = {
        alcoholPercentage: 10,
        name: 'Product77-update',
        priceInclVat: {
          amount,
          currency: 'EUR',
          precision: 2,
        },
        category: 2,
        vat: 1,
        id: res.id,
      };

      await ProductService.updateProduct(updateParams);
      const product = await ProductService.approveProductUpdate(res.id);

      validateProductProperties(product, updateParams);
      expect(product).to.exist;
    });
  });

  describe('createProduct function', () => {
    it('should create the product without update if approve is true', async () => {
      const creation: CreateProductParams = {
        alcoholPercentage: 0,
        category: 1,
        vat: 1,
        name: 'New Product Name',
        ownerId: (await User.findOne({ where: { deleted: false } })).id,
        priceInclVat: {
          amount: 50,
          currency: 'EUR',
          precision: 2,
        },
      };

      const response = await ProductService.createProduct(creation, true);
      validateProductProperties(response, creation);
      const entity = await Product.findOne({ where: { id: response.id } });
      expect(entity.currentRevision).to.eq(1);
    });
  });

  describe('directProductUpdate', () => {
    it('should revise the product without creating a UpdatedProduct', async () => {
      const product = await Product.findOne({ where: {} });
      const update: UpdateProductParams = {
        alcoholPercentage: 10,
        category: 1,
        vat: 1,
        id: product.id,
        name: 'A product update',
        priceInclVat: {
          amount: 51,
          precision: 2,
          currency: 'EUR',
        },
      };
      const response = await ProductService.directProductUpdate(update);
      validateProductProperties(response, update);
    });
  });

  describe('propagateProductUpdate function', () => {
    it('should propagate the update to all containers', async () => {
      const ownerId = (await User.findOne({ where: { deleted: false } })).id;
      const createProduct: CreateProductParams = {
        alcoholPercentage: 0,
        category: 1,
        vat: 1,
        name: 'New Product Name',
        ownerId,
        priceInclVat: {
          amount: 50,
          currency: 'EUR',
          precision: 2,
        },
      };

      const product = await ProductService.createProduct(createProduct, true);

      const createContainer: CreateContainerParams = {
        name: 'Container Name',
        ownerId,
        products: [product.id],
        public: true,
      };

      const container = await ContainerService.createContainer(createContainer, true);

      const update: UpdateProductParams = {
        id: product.id,
        alcoholPercentage: 1,
        category: 2,
        vat: 1,
        name: 'New Product Name 2',
        priceInclVat: {
          amount: 55,
          currency: 'EUR',
          precision: 2,
        },
      };

      const updatedProduct = await ProductService.directProductUpdate(update);
      validateProductProperties(updatedProduct, update);

      const containerEntity = await Container.findOne({ where: { id: container.id } });
      expect(containerEntity.currentRevision).to.be.eq(2);

      const productInContainer = (await ContainerRevision.findOne({ where: { revision: 2, container: { id: container.id } }, relations: ['container', 'products', 'products.category'] })).products[0];
      expect(productInContainer.name).to.eq(update.name);
      expect(typeof productInContainer.alcoholPercentage === 'string'
        ? parseInt(productInContainer.alcoholPercentage, 10)
        : productInContainer.alcoholPercentage).to.eq(update.alcoholPercentage);
      expect(productInContainer.priceInclVat.getAmount()).to.eq(update.priceInclVat.amount);
      expect(productInContainer.category.id).to.eq(update.category);
    });
    it('should propagate the update to all POS', async () => {
      const ownerId = (await User.findOne({ where: { deleted: false } })).id;
      const createProduct: CreateProductParams = {
        alcoholPercentage: 0,
        category: 1,
        vat: 1,
        name: 'New Product Name',
        ownerId,
        priceInclVat: {
          amount: 50,
          currency: 'EUR',
          precision: 2,
        },
      };

      const product = await ProductService.createProduct(createProduct, true);

      const createContainer: CreateContainerParams = {
        name: 'Container Name',
        ownerId,
        products: [product.id],
        public: true,
      };

      const container = await ContainerService.createContainer(createContainer, true);

      const createPOS: CreatePointOfSaleParams = {
        containers: [container.id],
        name: 'POS Name',
        useAuthentication: true,
        ownerId,
      };

      const pos = await PointOfSaleService.createPointOfSale(createPOS, true);

      const productUpdate: UpdateProductParams = {
        alcoholPercentage: 1,
        category: 2,
        vat: 1,
        id: product.id,
        name: 'New Product Name 2',
        priceInclVat: {
          amount: 55,
          currency: 'EUR',
          precision: 2,
        },
      };

      await ProductService.directProductUpdate(productUpdate);
      const productFromPos = (await PointOfSaleRevision.findOne({ where: { revision: 2, pointOfSale: { id: pos.id } }, relations: ['pointOfSale', 'containers', 'containers.products', 'containers.products.category'] })).containers[0].products[0];

      expect(productFromPos.name).to.eq(productUpdate.name);
      expect(productFromPos.category.id).to.eq(productUpdate.category);
      expect(productFromPos.name).to.eq(productUpdate.name);
      expect(productFromPos.priceInclVat.getAmount()).to.eq(productUpdate.priceInclVat.amount);
    });
  });
});
