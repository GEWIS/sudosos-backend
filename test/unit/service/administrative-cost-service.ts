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
  seedContainers, seedInactivityAdministrativeCosts, seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedTransactions, seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import AdministrativeCostService, {
} from '../../../src/service/administrative-cost-service';
import User, { UserType } from '../../../src/entity/user/user';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Swagger from '../../../src/start/swagger';
import Balance from '../../../src/entity/transactions/balance';
import { calculateBalance } from '../../helpers/balance';
import InactivityAdministrativeCosts from '../../../src/entity/transactions/inactivity-administrative-costs';
import {
  BaseInactivityAdministrativeCostsResponse,
} from '../../../src/controller/response/inactivity-administrative-costs-response';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import chai, { expect } from 'chai';
import { BaseInactivityAdministrativeCostsParams } from '../../../src/controller/request/inactivity-administrative-costs-request';
import BalanceService from '../../../src/service/balance-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { changeBalance } from '../../helpers/test-helpers';
import { addTransaction, addTransfer } from '../../helpers/transaction-helpers';
import { UserFactory } from '../../helpers/user-factory';

chai.use(deepEqualInAnyOrder);

function returnsAll(response: T[], superset: InactivityAdministrativeCosts[], mapping: any) {
  expect(response.map(mapping)).to.deep.equalInAnyOrder(superset.map(mapping));
}

function baseKeyMapping(inactivityAdministrativeCost: BaseInactivityAdministrativeCostsResponse | InactivityAdministrativeCosts) {
  return {
    id: inactivityAdministrativeCost.id,
    from: inactivityAdministrativeCost.from,
    amount: inactivityAdministrativeCost.amount.getAmount(),
    lastTransactionId: inactivityAdministrativeCost.lastTransactionId,
    lastTransferId: inactivityAdministrativeCost.lastTransferId,
  };
}

export type T = BaseInactivityAdministrativeCostsResponse | InactivityAdministrativeCosts;

function getOlderDate(yearDifference: number): Date {
  let date = new Date();
  date.setFullYear(date.getFullYear() - yearDifference);
  date.setMonth(date.getMonth() - 1);

  return date;
}

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
    inactivityAdministrativeCosts: InactivityAdministrativeCosts[],
    balances: Balance[],
    spec: SwaggerSpecification,
    dineroTransformer: DineroTransformer,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date(), 10);
    const transfers = await seedTransfers(users, new Date('2020-02-12'), new Date());
    const { inactivityAdministrativeCosts, administrativeCostTransfers } = await seedInactivityAdministrativeCosts(users, transactions, transfers);
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));
    const dineroTransformer = DineroTransformer.Instance;

    const balances = users.map((u) =>
      calculateBalance(u, transactions, subTransactions, transfers, new Date()),
    );

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
      transfers: transfers.concat(administrativeCostTransfers),
      inactivityAdministrativeCosts,
      dineroTransformer,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.destroy();
  });



  describe('getAdministrativeCostUsers function', async () => {
    it('should return all users with a inactivity administrative cost', async () => {

      const res = (await AdministrativeCostService.getInactivityAdministrativeCost());

      returnsAll(res, ctx.inactivityAdministrativeCosts, baseKeyMapping);
    });
    it('should return specified user by id', async () => {
      const administrativeCostId = ctx.inactivityAdministrativeCosts[0].id;
      const res: InactivityAdministrativeCosts[] = (await AdministrativeCostService.getInactivityAdministrativeCost({ userId: administrativeCostId }));

      returnsAll(res, [ctx.inactivityAdministrativeCosts[0]], baseKeyMapping);
    });
  });

  describe('createInactivityAdministrativeCosts function', async () => {
    it('should create a new inactivity administrative cost entity for a member with more than 10 euros', async () => {
      const balances = (await BalanceService.getBalances(
        { minBalance: DineroTransformer.Instance.from(10) })).records;
      const user = await User.findOne({ where: { id: balances[0].id } });
      const balance = await BalanceService.getBalance(user.id);

      await Transaction.findOne( { where: { id: balance.lastTransactionId } });
      await Transfer.findOne( { where: { id: balance.lastTransferId } });

      const creation: BaseInactivityAdministrativeCostsParams = {
        fromId: user.id,
        lastTransferId: balance.lastTransferId,
        lastTransactionId: balance.lastTransactionId,
      };

      const response = await AdministrativeCostService.createInactivityAdministrativeCost(creation);

      const administrativeCost = await InactivityAdministrativeCosts.findOne( {
        where: { fromId: user.id },
        relations: { from: true, transfer: true },
      } );

      const newBalance = await BalanceService.getBalance(user.id);
      const difference = balance.amount.amount - newBalance.amount.amount;
      const transfer = await Transfer.findOne({ where: { id: administrativeCost.transfer.id } } );

      expect(response.from.id).to.equal(administrativeCost.from.id);
      expect(response.id).to.equal(administrativeCost.id);
      expect(difference).to.equal(10);
      expect(ctx.dineroTransformer.to(response.transfer.amount)).to.equal(ctx.dineroTransformer.to(transfer.amount));
    });

    it('should create a new inactivity administrative cost entity for a member with less than 10 euros', async () => {
      const user = await User.findOne({ where: { } });
      const balance = await BalanceService.getBalance(user.id);

      const isPositive = balance.amount.amount > 0;
      await changeBalance(user.id, 5, isPositive);

      await Transaction.findOne( { where: { id: balance.lastTransactionId } });
      await Transfer.findOne( { where: { id: balance.lastTransferId } });

      const creation: BaseInactivityAdministrativeCostsParams = {
        fromId: user.id,
        lastTransferId: balance.lastTransferId,
        lastTransactionId: balance.lastTransactionId,
      };

      const response = await AdministrativeCostService.createInactivityAdministrativeCost(creation);

      const administrativeCost = await InactivityAdministrativeCosts.findOne( {
        where: { fromId: user.id },
        relations: { from: true, transfer: true },
      } );

      const newBalance = await BalanceService.getBalance(user.id);
      const transfer = await Transfer.findOne({ where: { id: administrativeCost.transfer.id } } );

      expect(response.from.id).to.equal(administrativeCost.from.id);
      expect(response.id).to.equal(administrativeCost.id);
      expect(newBalance.amount.amount).to.equal(0);
      expect(ctx.dineroTransformer.to(response.transfer.amount)).to.equal(ctx.dineroTransformer.to(transfer.amount));
    });
  });

  describe('positiveBalance function', async () => {
    it('should return true if use has a positive balance', async () => {
      const balances = (await BalanceService.getBalances(
        { minBalance: DineroTransformer.Instance.from(1) })).records;
      const response = await AdministrativeCostService.positiveBalance(balances[0].id);

      expect(response).to.be.true;
    });
    it('should return true if use has a positive balance', async () => {
      const balances = (await BalanceService.getBalances(
        { maxBalance: DineroTransformer.Instance.from(0) })).records;
      const response = await AdministrativeCostService.positiveBalance(balances[0].id);

      expect(response).to.be.false;
    });
  });
  describe('check inactivityAdministrativeCosts function', async () => {
    it('should return all users that should get a fine', async () => {
      const date = getOlderDate(3);
      const user = Object.assign(new User(), {
        firstName: 'John',
        lastName: 'Doe',
        type: UserType.MEMBER,
        sentAdministrativeCostsEmail: true,
      });
      await user.save();

      const transaction = (await addTransaction(user, ctx.pointOfSaleRevisions, false, date)).transaction;
      const transfer = (await addTransfer(user, ctx.users, false, date)).transfer;

      const response = await AdministrativeCostService.checkInactivityAdministrativeCosts({ fine: true });

      expect(response[0].id).to.be.equal(user.id);
      expect(response[0].sentAdministrativeCostsEmail).to.be.true;
      expect(response[0].id).to.be.equal(transfer.fromId);
      expect(response[0].id).to.be.equal(transaction.from.id);
    });
    it('should return all users that should get a notification', async () => {
      const date = getOlderDate(2);
      const user = (await UserFactory()).user;

      const transaction = (await addTransaction(user, ctx.pointOfSaleRevisions, false, date)).transaction;
      const transfer = (await addTransfer(user, ctx.users, false, date)).transfer;

      const response = await AdministrativeCostService.checkInactivityAdministrativeCosts({ fine: false });

      expect(response[0].id).to.be.equal(user.id);
      expect(response[0].sentAdministrativeCostsEmail).to.be.false;
      expect(response[0].id).to.be.equal(transfer.fromId);
      expect(response[0].id).to.be.equal(transaction.from.id);
    });
    it('should not return the administrative cost transfer if its the last transfer', async () => {
      const date = getOlderDate(3);
      const user = (await UserFactory()).user;

      const transaction = (await addTransaction(user, ctx.pointOfSaleRevisions, false, date)).transaction;
      const transfer = (await addTransfer(user, ctx.users, false, date)).transfer;

      const administrativeCostParams: BaseInactivityAdministrativeCostsParams = {
        fromId: user.id,
        lastTransactionId: transaction.id,
        lastTransferId: transfer.id,
      };

      const administrativeCost = await AdministrativeCostService.createInactivityAdministrativeCost(administrativeCostParams);
      const response = await AdministrativeCostService.checkInactivityAdministrativeCosts({ fine: true });

      expect(response[0].id).to.not.be.equal(administrativeCost.transfer.id);
    });
  });
});