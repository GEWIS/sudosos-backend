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
import Database from '../../../src/database/database';
import {
  seedContainers, seedFines, seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedTransactions, seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import AdministrativeCostService, {
} from '../../../src/service/administrative-cost-service';
import User from '../../../src/entity/user/user';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Fine from '../../../src/entity/fine/fine';
import Swagger from '../../../src/start/swagger';
import Balance from '../../../src/entity/transactions/balance';
import { calculateBalance } from '../../helpers/balance';
import { expect } from 'chai';

describe('AdministrativeCostService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    users: User[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    fines: Fine[],
    balances: Balance[],
    spec: SwaggerSpecification,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    const seededUsers = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(seededUsers, categories, vatGroups);
    const { containerRevisions } = await seedContainers(seededUsers, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(seededUsers, containerRevisions);
    const { transactions } = await seedTransactions(seededUsers, pointOfSaleRevisions, new Date('2020-02-12'), new Date(), 10);
    const transfers = await seedTransfers(seededUsers, new Date('2020-02-12'), new Date('2021-11-30'));
    const { fines, fineTransfers, users } = await seedFines(seededUsers, transactions, transfers, true);
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    const balances: Balance[] = [];

    for (let nr = 0; nr < users.length; nr += 1) {
      balances.push(calculateBalance(users[0], transactions, subTransactions, transfers, new Date()));
    }

    ctx = {
      connection,
      app,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      balances,
      transfers: transfers.concat(fineTransfers),
      fines,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.destroy();
  });

  describe('getAdministrativeCostUsers function', () => {
    it('should return only users to send a notification to', async () =>{

      const { records } = await AdministrativeCostService.getAdministrativeCostUsers({ notification: true });

      records.forEach((i) => {
        expect(i.sentAdministrativeCostsEmail).to.eq(false);
      });



    });
  });
});