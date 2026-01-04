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

import { DataSource } from 'typeorm';
import User, { NotifyDebtUserTypes, TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import { calculateBalance } from '../../helpers/balance';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Mailer from '../../../src/mailer';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import nodemailer, { Transporter } from 'nodemailer';
import { expect } from 'chai';
import TransactionService from '../../../src/service/transaction-service';
import BalanceService from '../../../src/service/balance-service';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import {
  ContainerSeeder,
  PointOfSaleSeeder,
  ProductSeeder,
  TransactionSeeder,
  TransferSeeder,
  UserSeeder,
} from '../../seed';
import { rootStubs } from '../../root-hooks';
import { SubTransactionRequest } from '../../../src/controller/request/transaction-request';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import UserDebtNotification from '../../../src/mailer/messages/user-debt-notification';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';

describe('TransactionSubscriber', () => {
  let ctx: {
    connection: DataSource,
    adminUser: User,
    users: User[],
    usersNotInDebt: User[],
    usersInDebt: User[],
    products: ProductRevision[];
    containers: ContainerRevision[];
    pointOfSales: PointOfSaleRevision[];
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[];
  };

  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;

  let env: string;

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const users = await new UserSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed([adminUser]);
    const { containerRevisions } = await new ContainerSeeder().seed([adminUser], productRevisions);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed([adminUser], containerRevisions);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'), 10);
    const transfers = await new TransferSeeder().seed(users, new Date('2020-02-12'), new Date('2021-11-30'));
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    ctx = {
      connection,
      adminUser,
      users,
      usersNotInDebt: users.filter((u) => calculateBalance(u, transactions, subTransactions, transfers).amount.getAmount() >= 0 && NotifyDebtUserTypes.includes(u.type)),
      usersInDebt: users.filter((u) => calculateBalance(u, transactions, subTransactions, transfers).amount.getAmount() < 0 && NotifyDebtUserTypes.includes(u.type)),
      products: productRevisions,
      containers: containerRevisions,
      pointOfSales: pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
    };

    env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test-transactions';

    // Sanity check
    expect(ctx.usersInDebt.length).to.be.at.least(3);
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

  after(async () => {
    await finishTestDB(ctx.connection);
    sandbox.restore();

    process.env.NODE_ENV = env;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('afterInsert', () => {
    it('should send an email if someone gets into debt', async () => {
      const user = ctx.usersNotInDebt[1];
      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.least(0);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales.find((p) => p.pointOfSale.owner.id !== user.id);
      const container = ctx.containers.find((c) => c.container.owner.id !== user.id);
      const product = ctx.products.find((p) => p.product.owner.id !== user.id);

      expect(pos).to.not.be.undefined;
      expect(container).to.not.be.undefined;
      expect(product).to.not.be.undefined;

      const amount = Math.ceil(currentBalance.getAmount() / product.priceInclVat.getAmount()) + 1 ;
      const totalPriceInclVat = product.priceInclVat.multiply(amount).toObject();
      await (new TransactionService()).createTransaction({
        from: user.id,
        pointOfSale: {
          id: pos.pointOfSaleId,
          revision: pos.revision,
        },
        createdBy: user.id,
        totalPriceInclVat,
        subTransactions: [{
          container: {
            id: container.containerId,
            revision: container.revision,
          },
          to: product.product.owner.id,
          totalPriceInclVat,
          subTransactionRows: [{
            product: {
              id: product.productId,
              revision: product.revision,
            },
            amount,
            totalPriceInclVat,
          }],
        }],
      });

      expect(sendMailFake).to.be.calledOnce;
    });
    it('should not send email if someone does not go into debt', async () => {
      const user = ctx.usersNotInDebt[2];
      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.least(0);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales[0];
      const container = ctx.containers[0];
      const product = ctx.products[0];


      const amount = Math.floor(currentBalance.getAmount() / product.priceInclVat.getAmount());
      expect(amount).to.be.at.least(1);
      const totalPriceInclVat = product.priceInclVat.multiply(amount).toObject();
      await (new TransactionService()).createTransaction({
        from: user.id,
        pointOfSale: {
          id: pos.pointOfSaleId,
          revision: pos.revision,
        },
        createdBy: user.id,
        totalPriceInclVat,
        subTransactions: [{
          container: {
            id: container.containerId,
            revision: container.revision,
          },
          to: product.product.owner.id,
          totalPriceInclVat,
          subTransactionRows: [{
            product: {
              id: product.productId,
              revision: product.revision,
            },
            amount,
            totalPriceInclVat,
          }],
        }],
      });

      expect(sendMailFake).to.not.be.called;
    });
    it('should not send email if someone is already in debt', async () => {
      const user = ctx.usersInDebt[0];
      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.most(-1);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales[0];
      const container = ctx.containers[0];
      const product = ctx.products[0];

      const amount = 1;
      const totalPriceInclVat = product.priceInclVat.toObject();

      await (new TransactionService()).createTransaction({
        from: user.id,
        pointOfSale: {
          id: pos.pointOfSaleId,
          revision: pos.revision,
        },
        createdBy: user.id,
        totalPriceInclVat,
        subTransactions: [{
          container: {
            id: container.containerId,
            revision: container.revision,
          },
          to: product.product.owner.id,
          totalPriceInclVat,
          subTransactionRows: [{
            product: {
              id: product.productId,
              revision: product.revision,
            },
            amount,
            totalPriceInclVat,
          }],
        }],
      });

      expect(sendMailFake).to.not.be.called;
    });

    it('should send an email if someone goes in debt after a multi-item transaction', async () => {

      const pos = ctx.pointOfSales[0];
      const container = ctx.containers[0];
      const product = ctx.products[0];
      const pricePerItemDinero = product.priceInclVat;

      const notificationConstructorSpy = sandbox.spy();
      const origGetOptions = UserDebtNotification.prototype.getOptions;
      sandbox.stub(UserDebtNotification.prototype, 'getOptions').callsFake(function (to, language) {
        // record the constructor options passed when the message was created
        notificationConstructorSpy((this as any).contentOptions);
        // return the original getOptions result so sendMail receives a proper options object
        return origGetOptions.apply(this, [to, language]);
      });


      const builder = await (await UserFactory()).addBalance(pricePerItemDinero.getAmount()); // ensure enough balance to buy one item
      const newUser = await builder.get();
      // Ensure user has an email so the mailer receives a valid recipient
      newUser.email = 'test@example.com';
      await User.save(newUser);
      await inUserContext([newUser], async function (u: User) {
        
        // test case goes here
        const balance = await new BalanceService().getBalance(u.id);
        const balanceCents = balance.amount.amount;

        expect(balanceCents).to.be.at.least(0);        

        const amount = 1;

        const pricePerItem: DineroObjectRequest = pricePerItemDinero.toObject();
        const totalPriceInclVat: DineroObjectRequest = pricePerItemDinero.multiply(2).toObject();


        // Stub BalanceService.getBalance so the subscriber sees the pre-transaction snapshot
        // This exploits the poor transaction-subscriber logic which only checks the first row
        const origGetBalance = BalanceService.prototype.getBalance;
        const getBalanceStub = sandbox.stub(BalanceService.prototype, 'getBalance').callsFake(async function (id: number, date?: Date) {
          if (id === u.id) {
            // Return the pre-transaction balance for any call (current or snapshot)
            return balance;
          }
          // For other calls use the original
          return origGetBalance.apply(this, [id, date]);
        });

        let subTransactionRow = {
          product: {
            id: product.productId,
            revision: product.revision,
          },
          amount,
          totalPriceInclVat: pricePerItem,
        };

        let subTransaction : SubTransactionRequest;
        subTransaction = {
          container: {
            id: container.containerId,
            revision: container.revision,
          },
          to: product.product.owner.id,
          totalPriceInclVat,
          subTransactionRows: [ subTransactionRow, subTransactionRow ], // buy two items
          // User should go into debt after second item
        };

        await (new TransactionService()).createTransaction({
          from: u.id,
          pointOfSale: {
            id: pos.pointOfSaleId,
            revision: pos.revision,
          },
          createdBy: u.id,
          totalPriceInclVat,
          subTransactions: [subTransaction],
        });

        // restore getBalance so we can query the true current balance
        getBalanceStub.restore();

        // Query user balance after transaction
        const newBalance = await new BalanceService().getBalance(u.id);

        expect(newBalance.amount.amount).to.be.below(0);
        expect(sendMailFake).to.be.called;
      });
    });
  });
});