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
import User from '../../../src/entity/user/user';
import Invoice from '../../../src/entity/invoices/invoice';
import Database from '../../../src/database/database';
import {
  seedAllContainers,
  seedAllProducts,
  seedInvoices,
  seedPointsOfSale,
  seedProductCategories, seedTransactions,
  seedUsers,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import { BaseInvoiceResponse } from '../../../src/controller/response/invoice-response';
import InvoiceService from '../../../src/service/invoice-service';

describe('InvoiceService', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    invoices: Invoice[],
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
      containerRevisions,
    } = await seedAllContainers(users, productRevisions, products);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions);
    const invoices = await seedInvoices(users, transactions);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      invoices,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  describe('getAllInvoices function', () => {
    it('should return all invoices with no input specification', async () => {
      const res: BaseInvoiceResponse[] = await InvoiceService.getInvoices();
      console.warn(res);
    });
  });
});
