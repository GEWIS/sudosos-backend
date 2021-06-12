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
import { expect } from 'chai';
import dinero from 'dinero.js';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ProductService, { ProductParameters } from '../../../src/service/product-service';
import {
  seedAllProducts, seedContainers, seedProductCategories, seedUpdatedContainers, seedUsers,
} from '../../seed';
import Product from '../../../src/entity/product/product';
import { ProductResponse } from '../../../src/controller/response/product-response';
import ProductRevision from '../../../src/entity/product/product-revision';
import UpdatedProduct from '../../../src/entity/product/updated-product';
import UpdatedContainer from '../../../src/entity/container/updated-container';
import BaseProduct from '../../../src/entity/product/base-product';

/**
 * Test if all the product responses are part of the product set array.
 * @param response
 * @param superset
 */
function productSuperset(response: ProductResponse[], superset: Product[]): Boolean {
  return response.every((searchProduct: ProductResponse) => (
    superset.find((supersetProduct: Product) => (
      supersetProduct.id === searchProduct.id && supersetProduct.owner.id === searchProduct.owner.id
    )) !== undefined
  ));
}

describe('ProductService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    allProducts: Product[],
    productsRevisions: ProductRevision[],
    updatedProducts: UpdatedProduct[],
    updatedContainers: UpdatedContainer[],
  };

  before(async () => {
    const connection = await Database.initialize();

    const categories = await seedProductCategories();
    const users = await seedUsers();

    let allProducts; let productsRevisions; let
      updatedProducts;
    let updatedContainers;
    await seedAllProducts(users, categories).then(async (res) => {
      allProducts = res.products;
      productsRevisions = res.productRevisions;
      updatedProducts = res.updatedProducts;
      await seedContainers(users, res.productRevisions);
      await seedUpdatedContainers(users, productsRevisions, allProducts).then((rs) => {
        updatedContainers = rs.updatedContainers;
      });
    });

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
      allProducts,
      productsRevisions,
      updatedProducts,
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
      const productSet: {[key:string]: any} = {};

      ctx.productsRevisions.forEach((product) => {
        if (productSet[product.product.id] === undefined) {
          productSet[product.product.id] = product;
        }
      });

      const containsAll = ctx.productsRevisions.every((product) => res.find(
        (prod) => product.product.id === prod.id,
      ) !== undefined);

      expect(containsAll).to.be.true;
      expect(res.length).to.be.equal(Object.keys(productSet).length);
      expect(productSuperset(res, ctx.allProducts)).to.be.true;
    });
    it('should return all updated products', async () => {
      const updatedProducts: ProductResponse[] = await ProductService.getUpdatedProducts();

      const containsAll = ctx.updatedProducts.every((product) => updatedProducts.find(
        (prod) => product.product.id === prod.id,
      ) !== undefined);

      expect(containsAll).to.be.true;
      expect(productSuperset(updatedProducts, ctx.allProducts)).to.be.true;
    });
    it('should return product with the owner specified', async () => {
      const params: ProductParameters = { ownerId: ctx.allProducts[0].owner.id };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      expect(productSuperset(res, ctx.allProducts)).to.be.true;

      const belongsToOwner = res.every((product: ProductResponse) => (
        product.owner.id === ctx.allProducts[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return a single product if productId is specified', async () => {
      const params: ProductParameters = { productId: ctx.allProducts[0].id };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      expect(res).to.be.length(1);
      expect(res[0].id).to.be.equal(ctx.allProducts[0].id);
    });
    it('should return no products if the userId and productId dont match', async () => {
      const params: ProductParameters = {
        ownerId: ctx.allProducts[0].owner.id + 1,
        productId: ctx.allProducts[0].id,
      };
      const res: ProductResponse[] = await ProductService.getProducts(params);

      expect(res).to.be.length(0);
    });
    it('should return the products belonging to a container', async () => {
      const params: ProductParameters = {
        containerId: 3,
      };
      const res: ProductResponse[] = await ProductService
        .getProducts(params);

      const products = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

      products.forEach((product) => {
        expect(res.find((pr) => pr.id === product.id)).to.not.be.undefined;
      });

      expect(res).to.be.length(5);
    });
    it('should return the updated products belonging to a container', async () => {
      const params: ProductParameters = {
        containerId: 4,
      };
      const res: ProductResponse[] = await ProductService
        .getUpdatedProducts(params);

      const products = [{ id: 11 }];
      products.forEach((product) => {
        expect(res.find((pr) => pr.id === product.id)).to.not.be.undefined;
      });

      expect(res).to.be.length(1);
    });
    it('should return the products belonging to a container revision that is not current', async () => {
      const params: ProductParameters = {
        containerId: 1,
        containerRevision: 2,
      };

      const res: ProductResponse[] = await ProductService
        .getProducts(params);

      const products = [{ id: 1 }, { id: 2 }, { id: 5 }];
      products.forEach((product) => {
        expect(res.find((pr) => pr.id === product.id)).to.not.be.undefined;
      });
      expect(res).to.be.length(3);
    });
    it('should return an updated container', async () => {
      const res: ProductResponse[] = await ProductService
        .getUpdatedContainer(1);

      const products = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }];
      products.forEach((product) => {
        expect(res.find((pr) => pr.id === product.id)).to.not.be.undefined;
      });

      expect(res).to.be.length(6);
    });
    it('should update a product by ID', async () => {
      const updateParams: {[key:string]: any} & Partial<BaseProduct> = {
        alcoholPercentage: 8,
        name: 'Product2-update',
        picture: 'https://sudosos/product2-update.png',
        price: dinero({
          amount: 69,
        }),
      };

      const res: ProductResponse = await ProductService.updateProduct(2, updateParams);

      Object.keys(updateParams).forEach((key: keyof ProductResponse) => {
        if (key === 'price') {
          expect(updateParams.price.getAmount()).to.be.equal(69);
        } else {
          expect((updateParams[key] as any)).to.be.equal((res[key]));
        }
      });

      expect(res).to.exist;
    });
  });
});
