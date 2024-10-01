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
import User, { UserType } from '../../../src/entity/user/user';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { ContainerSeeder, PointOfSaleSeeder, ProductSeeder, TransferSeeder, UserSeeder } from '../../seed';
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
import TransferService from '../../../src/service/transfer-service';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import dinero from 'dinero.js';
import TransactionService from '../../../src/service/transaction-service';
import TransferRequest from '../../../src/controller/request/transfer-request';
import ContainerRevision from '../../../src/entity/container/container-revision';
import ProductRevision from '../../../src/entity/product/product-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';

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
    validAdminCostRequest: CreateInactiveAdministrativeCostRequest;
    validTransReq: TransactionRequest;
    specification: SwaggerSpecification;
    users: User[];
    transfers: Transfer[];
    inactiveAdministrativeCosts: InactiveAdministrativeCost[];
    pointsOfSale: PointOfSaleRevision[];
    containers: ContainerRevision[];
    products: ProductRevision[];
  };

  before(async function test(): Promise<void> {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date(2023, 1);
    const end = new Date();

    const users = await new UserSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed(users);
    const transfers = await new TransferSeeder().seed(users, begin, end);
    const { inactiveAdministrativeCosts, inactiveAdministrativeCostsTransfers } = await new InactiveAdministrativeCostSeeder().seed(users, begin, end);
    const { containerRevisions } = await new ContainerSeeder().seed(users, productRevisions);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const transfersUpdated = transfers.concat(inactiveAdministrativeCostsTransfers);

    const validAdminCostRequest: CreateInactiveAdministrativeCostRequest = {
      forId: users[0].id,
    };
    const user = User.create({
      firstName: 'John',
      lastName: 'Doe',
      type: UserType.LOCAL_USER,
    });
    const newUser = await user.save();
    const updatedUser = users.concat(newUser);
    const pos = pointOfSaleRevisions.filter((p) => p.pointOfSale.deletedAt == null)[0];
    const conts = pos.containers.filter((c) => c.container.deletedAt == null).slice(0, 2);
    const products = conts.map((c) => c.products.filter((p) => p.product.deletedAt == null).slice(0, 2));
    const validTransReq: TransactionRequest = {
      from: newUser.id,
      createdBy: newUser.id,
      subTransactions: conts.map((c, i) => (
        {
          to: c.container.owner.id,
          container: {
            id: c.containerId,
            revision: c.revision,
          },
          subTransactionRows: products[i].map((p, i2) => (
            {
              product: {
                id: p.productId,
                revision: p.revision,
              },
              amount: i2 + 1,
              totalPriceInclVat: p.priceInclVat.multiply(i2 + 1).toObject(),
            }
          )),
          totalPriceInclVat: products[i].reduce((total, p, i2) => total
            .add(p.priceInclVat.multiply(i2 + 1)), dinero({ amount: 0 })).toObject(),
        }
      )),
      pointOfSale: {
        id: pos.pointOfSaleId,
        revision: pos.revision,
      },
      totalPriceInclVat: products.reduce((total1, prods) => total1
        .add(prods.reduce((total2, p, i) => total2
          .add(p.priceInclVat.multiply(i + 1)), dinero({ amount: 0 })),
        ), dinero({ amount: 0 })).toObject(),
      createdAt: new Date(2020, 1).toString(),
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      validAdminCostRequest,
      validTransReq,
      specification,
      containers: containerRevisions,
      products: productRevisions,
      users: updatedUser,
      transfers: transfersUpdated,
      pointsOfSale: pointOfSaleRevisions,
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
  
  describe('createInactiveAdministrativeCost', async (): Promise<void> => {
    it('should create inactive administrative cost for certain user', async () => {
      const user = ctx.users[0];
      const previousBalance = (await new BalanceService().getBalance(user.id)).amount.amount;

      const res = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost(ctx.validAdminCostRequest);
      await new BalanceService().updateBalances({});
      const newBalance = (await new BalanceService().getBalance(user.id)).amount.amount;

      const inactiveAdministrativeCosts: InactiveAdministrativeCost[] = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts();
      const lastEntry = inactiveAdministrativeCosts.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));

      expect(lastEntry.id).to.be.eq(res.id);
      expect(newBalance).to.be.eq(previousBalance - res.amount.getAmount());
    });
  });

  describe('deleteInactiveAdministrativeCost', async (): Promise<void> => {
    it('should delete a given inactive administrative cost', async () => {
      const createdInactiveAdministrativeCost = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost(ctx.validAdminCostRequest);
      const deletedInactiveAdministrativeCost = await new InactiveAdministrativeCostService().deleteInactiveAdministrativeCost(createdInactiveAdministrativeCost.id);

      // Check if entity was deleted
      expect(await InactiveAdministrativeCost.findOne({ where: { id: deletedInactiveAdministrativeCost.id } })).to.be.null;

      // Check creation of transfer
      const transfers = (await new TransferService().getTransfers()).records;
      const undoTransfer = transfers.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));

      expect(undoTransfer.to.id).to.be.eq(deletedInactiveAdministrativeCost.fromId);
    });
  });
  
  describe('checkInactiveUsers', async (): Promise<void> => {
    it('should return all users who should receive a notification', async () => {
      const user = await User.findOne({ where: { id: ctx.validTransReq.from } });
      await new TransactionService().createTransaction(ctx.validTransReq);
      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'cool',
        fromId: user.id,
        toId: undefined,
        createdAt: new Date(2020, 1).toString(),
      };
      await new TransferService().createTransfer(req);

      const users = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification: true });

      expect(user.id).to.be.eql(users[0].id);
    });
    it('should not return users which already had a notification send', async () => {
      const user = await User.findOne({ where: { id: ctx.validTransReq.from } });
      user.inactiveNotificationSend = true;
      await user.save();
      await new TransactionService().createTransaction(ctx.validTransReq);
      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'cool',
        fromId: user.id,
        toId: undefined,
        createdAt: new Date(2020, 1).toString(),
      };
      await new TransferService().createTransfer(req);

      const users = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification: true });

      expect(users).to.be.empty;
    });
  });
});
