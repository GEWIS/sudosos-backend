/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import { DataSource, In } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User, { UserType } from '../../../src/entity/user/user';
import Transfer from '../../../src/entity/transactions/transfer';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import {
  ContainerSeeder,
  PointOfSaleSeeder,
  ProductSeeder,
  TransactionSeeder,
  TransferSeeder,
  UserSeeder,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import bodyParser from 'body-parser';
import { finishTestDB } from '../../helpers/test-helpers';
import InactiveAdministrativeCost from '../../../src/entity/transactions/inactive-administrative-cost';
import InactiveAdministrativeCostSeeder from '../../seed/ledger/inactive-administrative-cost-seeder';
import InactiveAdministrativeCostService from '../../../src/service/inactive-administrative-cost-service';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import {
  BaseInactiveAdministrativeCostResponse, UserToInactiveAdministrativeCostResponse,
} from '../../../src/controller/response/inactive-administrative-cost-response';
import BalanceService from '../../../src/service/balance-service';
import {
  CreateInactiveAdministrativeCostRequest, HandoutInactiveAdministrativeCostsRequest,
} from '../../../src/controller/request/inactive-administrative-cost-request';
import TransferService from '../../../src/service/transfer-service';
import dinero from 'dinero.js';
import TransferRequest from '../../../src/controller/request/transfer-request';
import ContainerRevision from '../../../src/entity/container/container-revision';
import ProductRevision from '../../../src/entity/product/product-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import { rootStubs } from '../../root-hooks';
import Mailer from '../../../src/mailer';
import nodemailer, { Transporter } from 'nodemailer';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import { inUserContext, UserFactory } from '../../helpers/user-factory';

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
    specification: SwaggerSpecification;
    transactions: Transaction[];
    subTransactions: SubTransaction[];
    users: User[];
    transfers: Transfer[];
    inactiveAdministrativeCosts: InactiveAdministrativeCost[];
    pointsOfSale: PointOfSaleRevision[];
    containers: ContainerRevision[];
    products: ProductRevision[];
  };

  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;

  before(async function test(): Promise<void> {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date(2020, 1);
    const end = new Date(2021, 1);

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

    const pos = pointOfSaleRevisions.filter((p) => p.pointOfSale.deletedAt == null);
    const { subTransactions, transactions } = await new TransactionSeeder().seed(users, pos, begin, end);

    await ServerSettingsStore.getInstance().initialize();

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      validAdminCostRequest,
      transactions,
      subTransactions,
      specification,
      containers: containerRevisions,
      products: productRevisions,
      users: updatedUser,
      transfers: transfersUpdated,
      pointsOfSale: pointOfSaleRevisions,
      inactiveAdministrativeCosts,
    };
  });

  beforeEach(() => {
    // Restore the default stub
    rootStubs?.mail.restore();

    // Reset the mailer, because it was created with an old, expired stub
    Mailer.reset();

    sandbox = sinon.createSandbox();
    sendMailFake = sandbox.spy();
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
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
    it('should return administrative cost for a certain id', async () => {
      const inactiveAdministrativeCostId = ctx.inactiveAdministrativeCosts[0].id;

      const res = await new InactiveAdministrativeCostService().getInactiveAdministrativeCosts({ inactiveAdministrativeCostId });

      expect(res[0].id).to.be.eq(inactiveAdministrativeCostId);
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
      const transfer = await Transfer.findOne({
        where: { id: lastEntry.transfer.id },
        relations: { inactiveAdministrativeCost: true },
      });

      expect(lastEntry.id).to.be.eq(res.id);
      expect(newBalance).to.be.eq(previousBalance - res.amount.getAmount());
      expect(transfer.fromId).to.be.eq(lastEntry.fromId);
      expect(transfer.inactiveAdministrativeCost).not.be.null;
    });
  });

  describe('deleteInactiveAdministrativeCost', async (): Promise<void> => {
    it('should delete a given inactive administrative cost', async () => {
      const createdInactiveAdministrativeCost = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost(ctx.validAdminCostRequest);
      const deletedInactiveAdministrativeCost = await new InactiveAdministrativeCostService().deleteInactiveAdministrativeCost(createdInactiveAdministrativeCost.id);

      // Check creation of transfer
      const undoTransfer = await Transfer.findOne({ where: { id: deletedInactiveAdministrativeCost.creditTransferId } });

      expect(undoTransfer).not.be.null;
      expect(deletedInactiveAdministrativeCost.creditTransferId).to.be.eq(undoTransfer.id);
    });
    it('should return undefined when entity does not exist', async () => {
      const lastId = ctx.inactiveAdministrativeCosts.length;
      const res = await new InactiveAdministrativeCostService().deleteInactiveAdministrativeCost(lastId + 1);

      expect(res).not.be.undefined;
    });
    it('should restore the user’s balance when an inactive administrative cost is deleted', async () => {
      const balances = await new BalanceService().getBalances({});
      const user = balances.records.find(x => x.amount.amount > 100);

      const before = (await new BalanceService().getBalance(user.id)).amount.amount;

      const created = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost({ forId: user.id });
      await new BalanceService().updateBalances({});
      const afterDeduction = (await new BalanceService().getBalance(user.id)).amount.amount;

      await new InactiveAdministrativeCostService().deleteInactiveAdministrativeCost(created.id);
      await new BalanceService().updateBalances({});
      const afterRefund = (await new BalanceService().getBalance(user.id)).amount.amount;

      expect(afterDeduction).to.be.lessThan(before);
      expect(afterRefund).to.be.closeTo(before, 1);
    });
  });
  
  describe('checkInactiveUsers', async (): Promise<void> => {
    it('should return all users who should receive a notification', async () => {
      const user = await User.findOne({ where: { id: ctx.users[0].id } });
      await new BalanceService().updateBalances({});

      // Ensure user has positive balance first - add enough to cover negative balance + buffer
      const initialBalance = await new BalanceService().getBalance(user.id);
      const amountToAdd = initialBalance.amount.amount <= 0 
        ? Math.abs(initialBalance.amount.amount) + 1000 
        : 0;
      if (amountToAdd > 0) {
        const addMoneyReq: TransferRequest = {
          amount: {
            amount: amountToAdd,
            precision: dinero.defaultPrecision,
            currency: dinero.defaultCurrency,
          },
          description: 'add money for test',
          fromId: 0,
          toId: user.id,
          createdAt: new Date(2020, 1).toString(),
        };
        await new TransferService().createTransfer(addMoneyReq);
        await new BalanceService().updateBalances({});
      }

      // Create old transfer (this debits money but user should still have positive balance)
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
      await new BalanceService().updateBalances({});

      // Verify user has positive balance
      const finalBalance = await new BalanceService().getBalance(user.id);
      expect(finalBalance.amount.amount).to.be.greaterThan(0);

      const users: UserToInactiveAdministrativeCostResponse[] = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification: true });

      const userIds = users.map(u => u.id);
      expect(userIds).to.include(user.id);
    });
    it('should still return users that had an inactive administrative cost as last transfer', async () => {
      const user = await User.findOne({ where: { id: ctx.users[0].id } });
      await new BalanceService().updateBalances({});

      // Ensure user has positive balance first - add enough to cover negative balance + buffer + administrative cost
      const initialBalance = await new BalanceService().getBalance(user.id);
      const administrativeCostValue = ServerSettingsStore.getInstance().getSetting('administrativeCostValue') as number;
      const amountToAdd = initialBalance.amount.amount <= 0 
        ? Math.abs(initialBalance.amount.amount) + administrativeCostValue + 1000 
        : administrativeCostValue + 1000;
      const addMoneyReq: TransferRequest = {
        amount: {
          amount: amountToAdd,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'add money for test',
        fromId: 0,
        toId: user.id,
        createdAt: new Date(2020, 1).toString(),
      };
      await new TransferService().createTransfer(addMoneyReq);
      await new BalanceService().updateBalances({});

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
      const transfer = await new TransferService().createTransfer(req);
      await new BalanceService().updateBalances({});
      const inactiveAdministrativeCost = await new InactiveAdministrativeCostService().createInactiveAdministrativeCost({ forId: user.id });
      await new BalanceService().updateBalances({});

      // Verify user has positive balance
      const finalBalance = await new BalanceService().getBalance(user.id);
      expect(finalBalance.amount.amount).to.be.greaterThan(0);

      const users = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification: false });

      const userIds = users.map(u => u.id);
      expect(userIds).to.include(user.id);
      expect(transfer.id).to.not.eq(inactiveAdministrativeCost.transfer.id);
    });
    it('should not return users which already had a notification send', async () => {
      const user = await User.findOne({ where: { id: ctx.users[0].id } });
      user.inactiveNotificationSend = true;
      await user.save();

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

      expect(users).not.contain(user);
    });
    it('should not return users with balance <= 0', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // Create an old transfer that gives user a negative balance and makes them eligible by date
        const oldTransferReq: TransferRequest = {
          amount: {
            amount: 100,
            precision: dinero.defaultPrecision,
            currency: dinero.defaultCurrency,
          },
          description: 'old transfer creating negative balance',
          fromId: user.id,
          toId: 0,
          createdAt: new Date(2020, 1).toString(),
        };
        await new TransferService().createTransfer(oldTransferReq);
        await new BalanceService().updateBalances({});

        // Verify user has balance <= 0
        const finalBalance = await new BalanceService().getBalance(user.id);
        expect(finalBalance.amount.amount).to.be.at.most(0);

        const users = await new InactiveAdministrativeCostService().checkInactiveUsers({ notification: true });

        const userIds = users.map(u => u.id);
        expect(userIds).to.not.include(user.id);
      });
    });
  });

  describe('handOutInactiveAdministrativeCost', async (): Promise<void> => {
    it('should mail all given users', async () => {
      const users = ctx.users.slice(8);
      const userIds = users.map((u) => u.id);

      const handoutRequest: HandoutInactiveAdministrativeCostsRequest = { userIds };

      await new InactiveAdministrativeCostService().handOutInactiveAdministrativeCost(handoutRequest);
      await User.find({ where: { id: In(userIds) } });

      expect(sendMailFake.callCount).to.equal(users.length);
    });
  });

  describe('sendInactiveNotification', async (): Promise<void> => {
    it('should notify all given users', async () => {
      const users = ctx.users.slice(8);
      const userIds = users.map((u) => u.id);

      const handoutRequest: HandoutInactiveAdministrativeCostsRequest = { userIds };

      await new InactiveAdministrativeCostService().sendInactiveNotification(handoutRequest);
      const updatedUsers = await User.find({ where: { id: In(userIds) } });

      expect(sendMailFake.callCount).to.equal(users.length);
      expect(updatedUsers[0].inactiveNotificationSend).to.be.eq(true);
    });
  });
  describe('getPaginatedInactiveAdministrativeCosts', async (): Promise<void> => {
    it('should paginate inactive administrative costs correctly', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await new InactiveAdministrativeCostService()
        .getPaginatedInactiveAdministrativeCosts({}, { take: 2, skip: 1 });

      expect(records).to.have.lengthOf.at.most(2);
      expect(_pagination).to.include.keys(['count', 'take', 'skip']);
      expect(_pagination.take).to.equal(2);
      expect(_pagination.skip).to.equal(1);
    });

  });
});
