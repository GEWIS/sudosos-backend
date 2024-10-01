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
 *
 *  @license
 */

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { TransferSeeder, UserSeeder } from '../../seed';
import Swagger from '../../../src/start/swagger';
import bodyParser from 'body-parser';
import { finishTestDB } from '../../helpers/test-helpers';
import InactiveAdministrativeCost from '../../../src/entity/transactions/inactive-administrative-cost';
import InactiveAdministrativeCostSeeder from '../../seed/ledger/inactive-administrative-cost-seeder';
import InactiveAdministrativeCostService from '../../../src/service/inactive-administrative-cost-service';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import {
  BaseInactiveAdministrativeCostResponse,
} from '../../../src/controller/response/inactive-administrative-cost-response';
import BalanceService from '../../../src/service/balance-service';
import {
  CreateInactiveAdministrativeCostRequest,
} from '../../../src/controller/request/inactive-administrative-cost-request';

chai.use(deepEqualInAnyOrder);

function keyMapping(inactiveAdministrativeCost: BaseInactiveAdministrativeCostResponse | InactiveAdministrativeCost) {
  return {
    id: inactiveAdministrativeCost.id,
    fromId: inactiveAdministrativeCost.from.id,
  };
}

export type T = BaseInactiveAdministrativeCostResponse | InactiveAdministrativeCost;

function returnsAll(response: T[], superset: InactiveAdministrativeCost[], mapping: any) {
  expect(response.map(mapping)).to.deep.equalInAnyOrder(superset.map(mapping));
}


describe('InactiveAdministrativeCostService', () => {
  let ctx: {
    connection: DataSource;
    app: Application;
    specification: SwaggerSpecification;
    users: User[];
    transfers: Transfer[];
    inactiveAdministrativeCosts: InactiveAdministrativeCost[];
  };

  before(async function test(): Promise<void> {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date(2020, 1);
    const end = new Date();

    const users = await new UserSeeder().seed();

    const transfers = await new TransferSeeder().seed(users, begin, end);
    const { inactiveAdministrativeCosts, inactiveAdministrativeCostsTransfers } = await new InactiveAdministrativeCostSeeder().seed(users, begin, end);

    const transfersUpdated = transfers.concat(inactiveAdministrativeCostsTransfers);

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
      transfers: transfersUpdated,
      inactiveAdministrativeCosts,
    };
  });

  // close database connection
  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getInactiveAdministrativeCosts', async (): Promise<void> => {
    it('should return all administrative costs entities', async () => {
      const res = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts();
      returnsAll(res, ctx.inactiveAdministrativeCosts, keyMapping);
    });
    it('should return administrative cost for certain user', async () => {
      const user = ctx.users[0];

      const res = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts({ fromId: user.id });
      await new BalanceService().updateBalances({});

      expect(res[0].fromId).to.be.eq(user.id);
    });
  });
  
  describe('createInactiveAdministrativeCosts', async (): Promise<void> => {
    it('should create inactive administrative cost for certain user', async () => {
      const user = ctx.users[0];
      const previousBalance = (await new BalanceService().getBalance(user.id)).amount.amount;

      const res = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost({ forId: user.id });
      await new BalanceService().updateBalances({});
      const newBalance = (await new BalanceService().getBalance(user.id)).amount.amount;

      const inactiveAdministrativeCosts: InactiveAdministrativeCost[] = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts();
      const lastEntry = inactiveAdministrativeCosts.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));

      expect(lastEntry.id).to.be.eq(res.id);
      expect(newBalance).to.be.eq(previousBalance - res.amount.getAmount());
    });
  });
});
