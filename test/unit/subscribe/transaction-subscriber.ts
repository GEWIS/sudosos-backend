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

import { DataSource, Not } from 'typeorm';
import User, {
  NotifyDebtUserTypes,
  TermsOfServiceStatus,
  UserType,
} from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import Database from '../../../src/database/database';
import { calculateBalance } from '../../helpers/balance';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import Mailer from '../../../src/mailer';
import sinon, { SinonSandbox } from 'sinon';
import { expect } from 'chai';
import TransactionService from '../../../src/service/transaction-service';
import { SubTransactionRequest, TransactionRequest } from '../../../src/controller/request/transaction-request';
import BalanceService from '../../../src/service/balance-service';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import {
  ContainerSeeder,
  PointOfSaleSeeder,
  ProductSeeder,
  TransactionSeeder,
  TransferSeeder,
  UserNotificationSeeder,
  UserSeeder,
} from '../../seed';
import { rootStubs } from '../../root-hooks';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import UserDebtNotification from '../../../src/mailer/messages/user-debt-notification';
import { DineroObjectRequest } from '../../../src/controller/request/dinero-request';
import UserNotificationPreference from '../../../src/entity/notifications/user-notification-preference';
import UserNotificationPreferenceService from '../../../src/service/user-notification-preference-service';
import { NotificationTypes } from '../../../src/notifications/notification-types';
import {
  UserNotificationPreferenceUpdateParams,
} from '../../../src/controller/request/user-notification-preference-request';
import { createValidTransactionRequest } from '../../helpers/transaction-factory';

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
    notificationPreferences: UserNotificationPreference[];
  };

  let sandbox: SinonSandbox;

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
    const notificationPreferences = await new UserNotificationSeeder().seed(users);
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
      notificationPreferences,
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
      
      // Disable transaction notifications for this test
      const transactionNotificationPrefs = ctx.notificationPreferences.filter((pref) =>
        pref.userId === user.id &&
        (pref.type === NotificationTypes.TransactionNotificationSelf ||
         pref.type === NotificationTypes.TransactionNotificationChargedByOther),
      );
      for (const pref of transactionNotificationPrefs) {
        await new UserNotificationPreferenceService().updateUserNotificationPreference({
          userNotificationPreferenceId: pref.id,
          enabled: false,
        });
      }
      
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
      const transactionService = new TransactionService();
      const transactionRequest = {
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
      } as TransactionRequest;
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error('Invalid transaction in test');
      }
      await transactionService.createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.be.calledOnce;
    });
    it('should not send email if someone does not go into debt', async () => {
      const user = ctx.usersNotInDebt[2];
      
      // Disable transaction notifications for this test
      const transactionNotificationPrefs = ctx.notificationPreferences.filter((pref) =>
        pref.userId === user.id &&
        (pref.type === NotificationTypes.TransactionNotificationSelf ||
         pref.type === NotificationTypes.TransactionNotificationChargedByOther),
      );
      for (const pref of transactionNotificationPrefs) {
        await new UserNotificationPreferenceService().updateUserNotificationPreference({
          userNotificationPreferenceId: pref.id,
          enabled: false,
        });
      }
      
      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.least(0);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales[0];
      const container = ctx.containers[0];
      const product = ctx.products[0];


      const amount = Math.floor(currentBalance.getAmount() / product.priceInclVat.getAmount());
      expect(amount).to.be.at.least(1);
      const totalPriceInclVat = product.priceInclVat.multiply(amount).toObject();
      const transactionService = new TransactionService();
      const transactionRequest = {
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
      } as TransactionRequest;
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error('Invalid transaction in test');
      }
      await transactionService.createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.not.be.called;
    });
    it('should not send email if someone is already in debt', async () => {
      const user = ctx.usersInDebt[0];
      
      // Disable transaction notifications for this test
      const transactionNotificationPrefs = ctx.notificationPreferences.filter((pref) =>
        pref.userId === user.id &&
        (pref.type === NotificationTypes.TransactionNotificationSelf ||
         pref.type === NotificationTypes.TransactionNotificationChargedByOther),
      );
      for (const pref of transactionNotificationPrefs) {
        await new UserNotificationPreferenceService().updateUserNotificationPreference({
          userNotificationPreferenceId: pref.id,
          enabled: false,
        });
      }
      
      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.most(-1);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales[0];
      const container = ctx.containers[0];
      const product = ctx.products[0];

      const amount = 1;
      const totalPriceInclVat = product.priceInclVat.toObject();

      const transactionService = new TransactionService();
      const transactionRequest = {
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
      } as TransactionRequest;
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error('Invalid transaction in test');
      }
      await transactionService.createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.not.be.called;
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

        const transactionService3 = new TransactionService();
        const transactionRequest3 = {
          from: u.id,
          pointOfSale: {
            id: pos.pointOfSaleId,
            revision: pos.revision,
          },
          createdBy: u.id,
          totalPriceInclVat,
          subTransactions: [subTransaction],
        } as TransactionRequest;
        const verification3 = await transactionService3.verifyTransaction(transactionRequest3);
        if (!verification3.valid || !verification3.context) {
          throw new Error('Invalid transaction in test');
        }
        await transactionService3.createTransaction(transactionRequest3, verification3.context);

        // restore getBalance so we can query the true current balance
        getBalanceStub.restore();

        // Query user balance after transaction
        const newBalance = await new BalanceService().getBalance(u.id);

        expect(newBalance.amount.amount).to.be.below(0);
        expect(rootStubs.queueAdd).to.be.called;
      });
    });
    it('should send a notification email if the user wants from itself', async () => {
      // Find a user that is not in debt and has the notification preference
      let user: User | undefined;
      let notificationPreference: UserNotificationPreference | undefined;
      
      for (const candidateUser of ctx.usersNotInDebt) {
        const pref = ctx.notificationPreferences.find((p) =>
          p.userId === candidateUser.id && p.type === NotificationTypes.TransactionNotificationSelf,
        );
        if (pref && candidateUser.active && candidateUser.acceptedToS !== TermsOfServiceStatus.NOT_ACCEPTED) {
          user = candidateUser;
          notificationPreference = pref;
          break;
        }
      }
      
      expect(user).to.not.be.undefined;
      expect(notificationPreference).to.not.be.undefined;
      
      if (!user || !notificationPreference) {
        throw new Error('Could not find a suitable user with notification preference for this test');
      }

      const updateParams: UserNotificationPreferenceUpdateParams = {
        userNotificationPreferenceId: notificationPreference.id,
        enabled: true,
      };
      await new UserNotificationPreferenceService().updateUserNotificationPreference(updateParams);

      const balanceService = new BalanceService();
      const balance = await balanceService.getBalance(user.id);
      const currentBalance = balance.amount;

      expect(currentBalance.amount).to.be.at.least(0);

      // Find another user to be the seller (product owner)
      // The transaction is "from itself" meaning user initiated it, but they're buying from someone else
      const seller = ctx.users.find((u) => u.id !== user.id && u.active);
      expect(seller).to.not.be.undefined;
      
      if (!seller) {
        throw new Error('Could not find a seller for the transaction');
      }

      // Use the transaction factory helper to create a valid transaction request
      // This ensures we have a POS with containers and products
      // byId = user.id (buyer and creator), toId = seller.id (product owner/seller)
      const transactionRequest = await createValidTransactionRequest(user.id, seller.id);

      const transactionService = new TransactionService();
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error(`Invalid transaction in test. User: ${user.id}, active: ${user.active}, acceptedToS: ${user.acceptedToS}`);
      }

      await (new TransactionService()).createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.be.calledOnce;
    });
    it('should send a notification email when charged by others', async () => {
      const user = ctx.usersNotInDebt[4];
      const notificationPreference = ctx.notificationPreferences.find((pref) =>
        pref.userId === user.id && pref.type === NotificationTypes.TransactionNotificationChargedByOther,
      );

      const updateParams: UserNotificationPreferenceUpdateParams = {
        userNotificationPreferenceId: notificationPreference.id,
        enabled: true,
      };
      await new UserNotificationPreferenceService().updateUserNotificationPreference(updateParams);

      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.least(0);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales.find((p) => p.pointOfSale.owner.id !== user.id);
      const container = ctx.containers.find((c) => c.container.owner.id !== user.id);
      const product = ctx.products.find((p) => p.product.owner.id !== user.id);

      expect(pos).to.not.be.undefined;
      expect(container).to.not.be.undefined;
      expect(product).to.not.be.undefined;

      const amount = 1;
      const totalPriceInclVat = product.priceInclVat.multiply(amount).toObject();
      const creator = await User.findOne({ where: { id: Not(user.id) } });

      const transactionRequest: TransactionRequest = {
        from: user.id,
        pointOfSale: {
          id: pos.pointOfSaleId,
          revision: pos.revision,
        },
        createdBy: creator.id,
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
      };

      const transactionService = new TransactionService();
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error('Invalid transaction in test');
      }

      await (new TransactionService()).createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.be.calledOnce;
    });
    it('should not send a notification email', async () => {
      const user = ctx.usersNotInDebt[5];

      const notificationPreferenceSelf = ctx.notificationPreferences.find((pref) =>
        pref.userId === user.id && pref.type === NotificationTypes.TransactionNotificationSelf,
      );
      const notificationPreferenceOther = ctx.notificationPreferences.find((pref) =>
        pref.userId === user.id && pref.type === NotificationTypes.TransactionNotificationChargedByOther,
      );

      const updateParamsSelf: UserNotificationPreferenceUpdateParams = {
        userNotificationPreferenceId: notificationPreferenceSelf.id,
        enabled: false,
      };
      const updateParamsOther: UserNotificationPreferenceUpdateParams = {
        userNotificationPreferenceId: notificationPreferenceOther.id,
        enabled: false,
      };
      await new UserNotificationPreferenceService().updateUserNotificationPreference(updateParamsSelf);
      await new UserNotificationPreferenceService().updateUserNotificationPreference(updateParamsOther);

      const currentBalance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount;
      expect(currentBalance.getAmount()).to.be.at.least(0);
      expect((await new BalanceService().getBalance(user.id)).amount.amount).to.equal(currentBalance.getAmount());

      const pos = ctx.pointOfSales.find((p) => p.pointOfSale.owner.id !== user.id);
      const container = ctx.containers.find((c) => c.container.owner.id !== user.id);
      const product = ctx.products.find((p) => p.product.owner.id !== user.id);

      expect(pos).to.not.be.undefined;
      expect(container).to.not.be.undefined;
      expect(product).to.not.be.undefined;

      const amount = 1;
      const totalPriceInclVat = product.priceInclVat.multiply(amount).toObject();
      const transactionRequest: TransactionRequest = {
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
      };

      const transactionService = new TransactionService();
      const verification = await transactionService.verifyTransaction(transactionRequest);
      if (!verification.valid || !verification.context) {
        throw new Error('Invalid transaction in test');
      }

      await (new TransactionService()).createTransaction(transactionRequest, verification.context);

      expect(rootStubs.queueAdd).to.not.be.called;
    });
  });
});