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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ProductService, { ProductParameters } from '../../../src/service/product-service';
import {
  seedAllProducts, seedAllContainers, seedProductCategories, seedUsers,
} from '../../seed';
import Product from '../../../src/entity/product/product';
import { ProductResponse } from '../../../src/controller/response/product-response';
import ProductRevision from '../../../src/entity/product/product-revision';
import UpdatedProduct from '../../../src/entity/product/updated-product';
import UpdatedContainer from '../../../src/entity/container/updated-container';
import Container from '../../../src/entity/container/container';
import ContainerRevision from '../../../src/entity/container/container-revision';
import ProductRequest from '../../../src/controller/request/product-request';

chai.use(deepEqualInAnyOrder);
/**
 * Test if all the product responses are part of the product set array.
 * @param response
 * @param superset
 */
function returnsAll(response: ProductResponse[], superset: Product[]) {
  expect(response).to.not.be.empty;
  expect(response.map((prod) => ({ id: prod.id, ownerid: prod.owner.id })))
    .to.deep.equalInAnyOrder(superset.map((prod) => ({ id: prod.id, ownerid: prod.owner.id })));
}

function validateProductProperties(response: ProductResponse,
  productParams: ProductRequest) {
  Object.keys(productParams).forEach((key: keyof ProductRequest) => {
    if (key === 'price') {
      expect((productParams[key] as any)).to.be.equal((response.price.amount));
    } else if (key === 'category') {
      expect((productParams[key] as any)).to.be.equal((response.category.id));
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
    productRevisions: ProductRevision[],
    updatedProducts: UpdatedProduct[],
    containers: Container[],
    containerRevisions: ContainerRevision[],
    updatedContainers: UpdatedContainer[],
  };

  before(async () => {
    const connection = await Database.initialize();

    const categories = await seedProductCategories();
    const users = await seedUsers();

    const {
      products,
      productRevisions,
      updatedProducts,
    } = await seedAllProducts(users, categories);
    const {
      containers,
      containerRevisions,
      updatedContainers,
    } = await seedAllContainers(users, productRevisions, products);

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
      productRevisions,
      updatedProducts,
      containers,
      containerRevisions,
      updatedContainers,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  describe('getProducts function', () => {
    it('should return all products with no input specification', async () => {
      const res: ProductResponse[] = await ProductService.getProducts();

      const products = ctx.products.filter((prod) => prod.currentRevision !== null);

      returnsAll(res, products);
    });
    it('should return all updated products', async () => {
      const updatedProducts: ProductResponse[] = await ProductService.getUpdatedProducts();
      const products = ctx.updatedProducts.map((prod) => prod.product);

      returnsAll(updatedProducts, products);
    });
    it('should return product with the owner specified', async () => {
      const owner = ctx.products[0].owner.id;
      const params: ProductParameters = { ownerId: ctx.products[0].owner.id };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      const products = ctx.products.filter((prod) => (
        prod.currentRevision !== null && prod.owner.id === owner));

      returnsAll(res, products);
    });
    it('should return a single product if productId is specified', async () => {
      const params: ProductParameters = { productId: ctx.products[0].id };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      returnsAll(res, [ctx.products[0]]);
    });
    it('should return no products if the userId and productId dont match', async () => {
      const params: ProductParameters = {
        ownerId: ctx.products[0].owner.id + 1,
        productId: ctx.products[0].id,
      };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      expect(res).to.be.empty;
    });
    it('should return the products belonging to a container', async () => {
      const params: ProductParameters = {
        containerId: 3,
      };
      const res: ProductResponse[] = await ProductService
        .getProducts(params);

      const products = ctx.containerRevisions
        .filter((rev) => {
          const container = ctx.containers.filter((cont) => cont.id === 3)[0];
          return rev.container.id === container.id && rev.revision === container.currentRevision;
        })
        .map((rev) => rev.products.map((prod) => prod.product))[0];

      returnsAll(res, products);
    });
    it('should return the updated products belonging to a container', async () => {
      const params: ProductParameters = {
        containerId: 3,
      };
      const res: ProductResponse[] = await ProductService
        .getUpdatedProducts(params);

      const products = ctx.containerRevisions.filter((rev) => {
        const container = ctx.containers.filter((cont) => cont.id === 3)[0];
        return rev.container.id === container.id && rev.revision === container.currentRevision;
      }).map((rev) => rev.products.map((prod) => prod.product))[0]
        .filter((prod) => (
          ctx.updatedProducts.map((upd) => upd.product).includes(prod)
        ));

      returnsAll(res, products);
    });
    it('should return the updated products belonging to an updatedContainer', async () => {
      const params: ProductParameters = {
        containerId: 4,
        updatedContainer: true,
      };
      const res: ProductResponse[] = await ProductService
        .getUpdatedProducts(params);

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

      returnsAll(res, products);
    });
    it('should return the products belonging to a container revision that is not current', async () => {
      const params: ProductParameters = {
        containerId: 1,
        containerRevision: 2,
      };

      const res: ProductResponse[] = await ProductService
        .getProducts(params);

      const products = [1, 2, 5];
      expect(res.map((prod) => prod.id)).to.deep.equalInAnyOrder(products);
    });
    it('should return an updated container', async () => {
      const res: ProductResponse[] = await ProductService
        .getAllProducts({ containerId: 4, updatedContainer: true });

      const { products } = ctx.updatedContainers
        .filter((cnt) => cnt.container.id === 4)[0];
      returnsAll(res, products);
    });
  });

  describe('updateProducts function', () => {
    it('should update a product by ID', async () => {
      const updateParams: ProductRequest = {
        category: 3,
        alcoholPercentage: 8,
        name: 'Product2-update',
        price: 69,
      };

      const res: ProductResponse = await ProductService.updateProduct(2, updateParams);

      validateProductProperties(res, updateParams);

      expect(res).to.exist;
    });

    it('should create a new product', async () => {
      const price = 77;

      const productParams: ProductRequest = {
        alcoholPercentage: 9,
        name: 'Product77-update',
        price,
        category: 1,
      };

      const res: ProductResponse = await ProductService.createProduct(ctx.users[0], productParams);

      validateProductProperties(res, productParams);
      expect(res).to.exist;

      // Hard Clean up
      await UpdatedProduct.delete(res.id);
      await Product.delete(res.id);
    });

    it('should confirm an updated product', async () => {
      // Create a new product.
      const price = 77;

      const productParams: ProductRequest = {
        alcoholPercentage: 9,
        name: 'Product77-update',
        price: price - 1,
        category: 1,
      };

      const res: ProductResponse = await ProductService.createProduct(ctx.users[0], productParams);

      const updateParams: ProductRequest = {
        alcoholPercentage: 10,
        name: 'Product77-update',
        price,
        category: 2,
      };

      await ProductService.updateProduct(res.id, updateParams);
      const product = await ProductService.approveProductUpdate(res.id);

      validateProductProperties(product, updateParams);
      expect(product).to.exist;
    });
  });
});
