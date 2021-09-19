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
import { json } from 'body-parser';
import { expect } from 'chai';
import User from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import UpdatedPointOfSale from '../../../src/entity/point-of-sale/updated-point-of-sale';
import Database from '../../../src/database/database';
import {
  seedAllContainers, seedAllPointsOfSale,
  seedAllProducts,
  seedProductCategories,
  seedUsers,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import { PointOfSaleResponse } from '../../../src/controller/response/point-of-sale-response';
import PointOfSaleService from '../../../src/service/point-of-sale-service';

/**
 * Test if all the point of sale responses are part of the point of sale set array.
 * @param response
 * @param superset
 */
function pointOfSaleSuperset(response: PointOfSaleResponse[], superset: PointOfSale[]): Boolean {
  return response.every((searchPOS: PointOfSaleResponse) => (
    superset.find((supersetPOS: PointOfSale) => (
      supersetPOS.id === searchPOS.id
      && supersetPOS.owner.id === searchPOS.owner.id
    )) !== undefined
  ));
}

describe('PointOfSaleService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    pointsOfSale: PointOfSale[],
    updatedPointsOfSale: UpdatedPointOfSale[]
  };

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const {
      products,
      productRevisions,
    } = await seedAllProducts(users, categories);
    const {
      containers,
      containerRevisions,
    } = await seedAllContainers(users, productRevisions, products);
    const {
      pointsOfSale,
      updatedPointsOfSale,
    } = await seedAllPointsOfSale(users, containerRevisions, containers);

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    ctx = {
      connection,
      app,
      specification,
      users,
      pointsOfSale,
      updatedPointsOfSale,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('getPointOfSales function', () => {
    it('should return all point of sales with no input specification', async () => {
      console.log('get result');
      const res: PointOfSaleResponse[] = await PointOfSaleService.getPointOfSales();

      const withRevisions = ctx.pointsOfSale.filter((c) => c.currentRevision > 0);
      expect(res).to.be.length(withRevisions.length);
      expect(pointOfSaleSuperset(res, ctx.pointsOfSale)).to.be.true;
      expect(res.every(
        (c: PointOfSaleResponse) => ctx.specification.validateModel('PointOfSaleResponse', c, false, true).valid
      )).to.be.true;
    });
  });
});
