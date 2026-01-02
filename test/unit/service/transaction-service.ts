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

import express, { Application } from 'express';
import chai, { expect } from 'chai';
import { DataSource } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import log4js, { Logger } from 'log4js';
import dinero from 'dinero.js';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import Transaction from '../../../src/entity/transactions/transaction';
import Database, { AppDataSource } from '../../../src/database/database';
import TransactionService, { TransactionFilterParameters } from '../../../src/service/transaction-service';
import { verifyBaseTransactionEntity } from '../validators';
import Swagger from '../../../src/start/swagger';
import {
  SubTransactionRequest,
  SubTransactionRowRequest,
  TransactionRequest,
} from '../../../src/controller/request/transaction-request';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import { createTransactions, createValidTransactionRequest } from '../../helpers/transaction-factory';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import generateBalance, { finishTestDB } from '../../helpers/test-helpers';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { createInvoiceWithTransfers } from './invoice-service';
import { truncateAllTables } from '../../setup';
import ProductRevision from '../../../src/entity/product/product-revision';
import { calculateBalance } from '../../helpers/balance';
import { ContainerSeeder, PointOfSaleSeeder, ProductSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';

chai.use(deepEqualInAnyOrder);

describe('TransactionService', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    transactions: Transaction[],
    users: User[],
    validTransReq: TransactionRequest,
    pointsOfSale: PointOfSaleRevision[],
    containers: ContainerRevision[],
    products: ProductRevision[],
    spec: SwaggerSpecification,
    logger: Logger,
  };

  // eslint-disable-next-line func-names
  before(async () => {
    const logger: Logger = log4js.getLogger('TransactionServiceTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const app = express();
    const users = await new UserSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed(users);
    const { containerRevisions } = await new ContainerSeeder().seed(users, productRevisions);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions);

    await generateBalance(1000, 7);

    const pos = pointOfSaleRevisions.filter((p) => p.pointOfSale.deletedAt == null)[0];
    const conts = pos.containers.filter((c) => c.container.deletedAt == null).slice(0, 2);
    const products = conts.map((c) => c.products.filter((p) => p.product.deletedAt == null).slice(0, 2));
    const validTransReq: TransactionRequest = {
      from: users[6].id,
      createdBy: users[6].id,
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
    };

    ctx = {
      connection,
      app,
      validTransReq,
      transactions,
      users,
      pointsOfSale: pointOfSaleRevisions,
      containers: containerRevisions,
      products: productRevisions,
      spec: await Swagger.importSpecification(),
      logger,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('Get total cost of a transaction', () => {
    it('should return the total cost of a transaction', async () => {
      const rows: SubTransactionRowRequest[] = [];
      ctx.validTransReq.subTransactions.forEach(
        (sub) => sub.subTransactionRows.forEach((row) => rows.push(row)),
      );
      expect((await new TransactionService().getTotalCost(rows)).toObject()).to.eql(ctx.validTransReq.totalPriceInclVat);
    });
  });

  describe('Verifiy balance', () => {
    it('should return true if the balance is sufficient', async () => {
      const transactionValue = ctx.validTransReq.totalPriceInclVat.amount;
      const userWithSufficientBalance = ctx.users.find((u) => calculateBalance(
        u, ctx.transactions, ctx.transactions.map((t) => t.subTransactions).flat(), [],
      ).amount.getAmount() > transactionValue);
      expect(await new TransactionService().verifyBalance({
        ...ctx.validTransReq,
        from: userWithSufficientBalance.id,
      })).to.be.true;
    });
    it('should return false if the balance is insuficient', async () => {
      expect(await new TransactionService().verifyBalance({
        ...ctx.validTransReq,
        from: 1,
      })).to.be.false;
    });
  });

  describe('Verify transaction', () => {
    it('should return true if the transaction request is valid', async () => {
      expect(await new TransactionService().verifyTransaction(ctx.validTransReq)).to.be.true;
    });
    it('should return false if the point of sale does not exist', async () => {
      // undefined pos
      const badPOSReq = {
        ...ctx.validTransReq,
        pointOfSale: undefined,
      } as TransactionRequest;
      expect(await new TransactionService().verifyTransaction(badPOSReq), 'undefined accepted').to.be.false;

      // non existent pos
      badPOSReq.pointOfSale = {
        revision: 1,
        id: 12345,
      };
      expect(await new TransactionService().verifyTransaction(badPOSReq), 'non existent accepted').to.be.false;
    });
    it('should return false if the point of sale is soft deleted', async () => {
      const pointOfSale = ctx.pointsOfSale.find((p) => p.pointOfSale.deletedAt != null && p.revision === p.pointOfSale.currentRevision);
      // undefined pos
      const badPOSReq = {
        ...ctx.validTransReq,
        pointOfSale: {
          id: pointOfSale.pointOfSaleId,
          revision: pointOfSale.revision,
        },
      } as TransactionRequest;
      expect(await new TransactionService().verifyTransaction(badPOSReq), 'soft deleted point of sale accepted').to.be.false;
    });
    it('should return false if a specified top level user is invalid', async () => {
      // undefined from
      const badFromReq = {
        ...ctx.validTransReq,
        from: undefined,
      } as TransactionRequest;
      expect(await new TransactionService().verifyTransaction(badFromReq), 'undefined from accepted').to.be.false;

      // non existent from user
      badFromReq.from = 0;
      expect(await new TransactionService().verifyTransaction(badFromReq), 'non existent from accepted').to.be.false;

      // inactive from user
      badFromReq.from = 5;
      expect(await new TransactionService().verifyTransaction(badFromReq), 'inactive from accepted').to.be.false;

      // undefined createdBy
      const badCreatedByReq = {
        ...ctx.validTransReq,
        createdBy: undefined,
      } as TransactionRequest;
      expect(await new TransactionService().verifyTransaction(badCreatedByReq), 'undefined createdBy accepted').to.be.false;

      // non existent createdBy user
      badCreatedByReq.createdBy = 0;
      expect(await new TransactionService().verifyTransaction(badCreatedByReq), 'nonexistent createdBy accepted').to.be.false;

      // inactive createdBy user
      badCreatedByReq.createdBy = 5;
      expect(await new TransactionService().verifyTransaction(badCreatedByReq), 'inactive createdBy accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq,
        totalPriceInclVat: undefined,
      } as TransactionRequest;
      expect(await new TransactionService().verifyTransaction(badPriceReq), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await new TransactionService().verifyTransaction(badPriceReq), 'incorrect accepted').to.be.false;
    });
    it('should return false if from user is an organ', async () => {
      const organ = ctx.users[ctx.users.findIndex((u) => u.type === UserType.ORGAN)];
      const badFromReq: TransactionRequest = {
        ...ctx.validTransReq,
        from: organ.id,
      };
      expect(await new TransactionService().verifyTransaction(badFromReq), 'organ accepted as from-user').to.be.false;
    });
    it('should return false if an involved user has not accepted TOS', async () => {
      const user = Object.assign(new User(), {
        firstName: 'Bart-jan',
        lastName: 'van de CBC',
        type: UserType.LOCAL_USER,
        active: true,
        ofAge: true,
        acceptedToS: TermsOfServiceStatus.NOT_ACCEPTED,
      }) as User;
      await User.save(user);

      const badFromReq: TransactionRequest = {
        ...ctx.validTransReq,
        from: user.id,
      };
      expect(await new TransactionService().verifyTransaction(badFromReq)).to.be.false;

      const badCreatedByReq: TransactionRequest = {
        ...ctx.validTransReq,
        createdBy: user.id,
      };
      expect(await new TransactionService().verifyTransaction(badCreatedByReq)).to.be.false;

      const badToReq: TransactionRequest = {
        ...ctx.validTransReq,
        subTransactions: [
          {
            ...ctx.validTransReq.subTransactions[0],
            to: user.id,
          },
        ],
      };
      expect(await new TransactionService().verifyTransaction(badToReq)).to.be.false;
    });
  });

  describe('Verifiy sub transaction', () => {
    it('should return true if the sub transaction request is valid', async () => {
      expect(await new TransactionService().verifySubTransaction(
        ctx.validTransReq.subTransactions[0], ctx.pointsOfSale[0],
      )).to.be.true;
    });
    it('should return false if the container is invalid', async () => {
      // undefined container
      const badContainerReq = {
        ...ctx.validTransReq.subTransactions[0],
        container: undefined,
      } as SubTransactionRequest;
      expect(await new TransactionService().verifySubTransaction(badContainerReq, ctx.pointsOfSale[0]), 'undefined accepted')
        .to.be.false;

      // non existent container
      badContainerReq.container = {
        revision: 1,
        id: 12345,
      };
      expect(await new TransactionService().verifySubTransaction(badContainerReq, ctx.pointsOfSale[0]), 'non existent accepted')
        .to.be.false;

      // container not in point of sale
      const badContainer = ctx.containers.find((c1) => !ctx.pointsOfSale[0].containers.some((c2) => c2.containerId === c1.containerId));
      expect(badContainer).to.not.be.undefined;
      badContainerReq.container = {
        revision: badContainer.revision,
        id: badContainer.containerId,
      };
      expect(await new TransactionService().verifySubTransaction(badContainerReq, ctx.pointsOfSale[0]), 'container not in point of sale accepted')
        .to.be.false;
    });
    it('should return false if the container is soft deleted', async () => {
      const container = ctx.containers.find((c) => c.container.deletedAt != null && c.revision === c.container.currentRevision);
      const badContainerReq = {
        ...ctx.validTransReq.subTransactions[0],
        container: {
          id: container.containerId,
          revision: container.revision,
        },
      } as SubTransactionRequest;
      expect(await new TransactionService().verifySubTransaction(badContainerReq, ctx.pointsOfSale[0]), 'soft deleted container accepted')
        .to.be.false;
    });
    it('should return false if the to user is invalid', async () => {
      // undefined to
      const badToReq = {
        ...ctx.validTransReq.subTransactions[0],
        to: undefined,
      } as SubTransactionRequest;
      expect(await new TransactionService().verifySubTransaction(badToReq, ctx.pointsOfSale[0]), 'undefined to accepted').to.be.false;

      // non existent to user
      badToReq.to = 0;
      expect(await new TransactionService().verifySubTransaction(badToReq, ctx.pointsOfSale[0]), 'non existent to accepted').to.be.false;

      // inactive to user
      badToReq.to = 5;
      expect(await new TransactionService().verifySubTransaction(badToReq, ctx.pointsOfSale[0]), 'inactive to accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq.subTransactions[0],
        totalPriceInclVat: undefined,
      } as SubTransactionRequest;
      expect(await new TransactionService().verifySubTransaction(badPriceReq, ctx.pointsOfSale[0]), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await new TransactionService().verifySubTransaction(badPriceReq, ctx.pointsOfSale[0]), 'incorrect accepted').to.be.false;
    });
  });

  describe('Verifiy sub transaction row', () => {
    it('should return true if the sub transaction row request is valid', async () => {
      expect(await new TransactionService().verifySubTransactionRow(
        ctx.validTransReq.subTransactions[0].subTransactionRows[0], ctx.containers[0],
      )).to.be.true;
    });
    it('should return false if the product is invalid', async () => {
      // undefined product
      const badProductReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        product: undefined,
      } as SubTransactionRowRequest;
      expect(await new TransactionService().verifySubTransactionRow(badProductReq, ctx.containers[0]), 'undefined product accepted').to.be.false;

      // non existent product
      badProductReq.product = {
        revision: 1,
        id: 12345,
      };
      expect(await new TransactionService().verifySubTransactionRow(badProductReq, ctx.containers[0]), 'non existent product accepted').to.be.false;

      // product not in container
      const badProduct = ctx.products.find((p1) => !ctx.pointsOfSale[0].containers
        .some((c) => c.products
          .some((p2) => p1.productId === p2.productId)));
      badProductReq.product = {
        revision: badProduct.revision,
        id: badProduct.productId,
      };
      expect(await new TransactionService().verifySubTransactionRow(badProductReq, ctx.containers[0]), 'product not in container accepted').to.be.false;
    });
    it('should return false if the product is soft deleted', async () => {
      const product = ctx.products.find((p) => p.product.deletedAt != null && p.revision === p.product.currentRevision);
      const badProductReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        product: {
          id: product.productId,
          revision: product.revision,
        },
      } as SubTransactionRowRequest;
      expect(await new TransactionService().verifySubTransactionRow(badProductReq, ctx.containers[0]), 'soft deleted product accepted').to.be.false;
    });
    it('should return false if the specified amount of the product is invalid', async () => {
      // undefined amount
      const badAmountReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        amount: undefined,
      } as SubTransactionRowRequest;
      expect(await new TransactionService().verifySubTransactionRow(badAmountReq, ctx.containers[0]), 'undefined amount accepted').to.be.false;

      // amount not greater than 0
      badAmountReq.amount = 0;
      expect(await new TransactionService().verifySubTransactionRow(badAmountReq, ctx.containers[0]), 'amount not greater than 0 accepted').to.be.false;

      // amount not an integer
      badAmountReq.amount = 1.1;
      expect(await new TransactionService().verifySubTransactionRow(badAmountReq, ctx.containers[0]), 'non integer amount accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        totalPriceInclVat: undefined,
      } as SubTransactionRowRequest;
      expect(await new TransactionService().verifySubTransactionRow(badPriceReq, ctx.containers[0]), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await new TransactionService().verifySubTransactionRow(badPriceReq, ctx.containers[0]), 'incorrect accepted').to.be.false;
    });
  });

  describe('Get all transactions', () => {
    it('should return all transactions', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await new TransactionService().getTransactions({});

      expect(records.length).to.equal(ctx.transactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.transactions.length);
    });

    it('should return a paginated list when take is set', async () => {
      const take = 69;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await new TransactionService().getTransactions({}, { take });

      const total = await Transaction.count();

      expect(records.length).to.equal(take);
      expect(_pagination.count).to.equal(total);
    });

    it('should not return a paginated list when skip is set', async () => {
      const skip = 69;
      const take = 999999999999;
      const { records } = await new TransactionService().getTransactions({}, { take, skip });

      expect(records.length).to.equal(ctx.transactions.length - 69);
    });

    it('should return a paginated list when take and skip are set', async () => {
      const skip = 120;
      const take = 50;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await new TransactionService().getTransactions({}, { take, skip });

      const total = await Transaction.count();

      expect(_pagination.count).to.equal(total);
      expect(records.length).to.equal(
        Math.min(take, ctx.transactions.length - skip),
      );
    });

    it('should filter on fromId', async () => {
      const fromId = 1;
      const { records } = await new TransactionService().getTransactions({
        fromId,
      });

      const actualTransactions = ctx.transactions.filter(
        (transaction) => transaction.from.id === fromId,
      );

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(t.from.id).to.be.equal(fromId));
    });

    it('should filter on createdById', async () => {
      const createdById = 1;
      const { records } = await new TransactionService().getTransactions({
        createdById,
      });

      const actualTransactions = ctx.transactions.filter(
        (transaction) => transaction.createdBy.id === createdById,
      );

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(t.createdBy.id).to.be.equal(createdById));
    });

    it('should filter on toId', async () => {
      const toId = 7;
      const { records } = await new TransactionService().getTransactions({
        toId,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.to.id === toId)) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.to.id === toId));

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should filter on point of sale', async () => {
      const pointOfSale = { id: 14 };
      const { records } = await new TransactionService().getTransactions({
        pointOfSaleId: pointOfSale.id,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.pointOfSale.pointOfSale.id === pointOfSale.id);

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(t.pointOfSale.id).to.be.equal(pointOfSale.id));
    });

    it('should filter on point of sale with revision', async () => {
      const pointOfSale = { id: 14, revision: 2 };
      const { records } = await new TransactionService().getTransactions({
        pointOfSaleId: pointOfSale.id,
        pointOfSaleRevision: pointOfSale.revision,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.pointOfSale.pointOfSale.id === pointOfSale.id
          && transaction.pointOfSale.revision === pointOfSale.revision);

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(t.pointOfSale.id).to.be.equal(pointOfSale.id));
    });

    it('should filter on container', async () => {
      const container = { id: 11 };
      const { records } = await new TransactionService().getTransactions({
        containerId: container.id,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.container.container.id === container.id));

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(actualTransactions.map((at) => at.id)).to.include(t.id));
    });

    it('should filter on container with revision', async () => {
      const container = { id: 11, revision: 2 };
      const { records } = await new TransactionService().getTransactions({
        containerId: container.id,
        containerRevision: container.revision,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.container.container.id === container.id
            && subTransaction.container.revision === container.revision));

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(actualTransactions.map((at) => at.id)).to.include(t.id));
    });

    it('should filter on product', async () => {
      const product = { id: 44 };
      const { records } = await new TransactionService().getTransactions({
        productId: product.id,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.subTransactionRows
            .some((subTransactionRow) => subTransactionRow.product.product.id === product.id)));

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(actualTransactions.map((at) => at.id)).to.include(t.id));
    });

    it('should filter on product with revision', async () => {
      const product = { id: 44, revision: 2 };
      const { records } = await new TransactionService().getTransactions({
        productId: product.id,
        productRevision: product.revision,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.subTransactions
          .some((subTransaction) => subTransaction.subTransactionRows
            .some((subTransactionRow) => subTransactionRow.product.product.id === product.id
              && subTransactionRow.product.revision === product.revision)));

      expect(records.length).to.equal(actualTransactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      records.map((t) => expect(actualTransactions.map((at) => at.id)).to.include(t.id));
    });

    it('should return transactions newer than date', async () => {
      let fromDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      let { records } = await new TransactionService().getTransactions({
        fromDate,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.createdAt.getTime() >= fromDate.getTime());

      const nrOfTransactions = actualTransactions.length;

      expect(records.length).to.equal(nrOfTransactions);
      records.map((t: BaseTransactionResponse): undefined => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.greaterThan(fromDate);
        return undefined;
      });

      fromDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      records = (await new TransactionService().getTransactions({
        fromDate,
      })).records;

      expect(records.length).to.equal(0);
    });

    it('should return transactions older than date', async () => {
      let tillDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      let { records } = await new TransactionService().getTransactions({
        tillDate,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.createdAt.getTime() <= tillDate.getTime());

      const nrOfTransactions = actualTransactions.length;

      expect(records.length).to.equal(nrOfTransactions);
      records.map((t: BaseTransactionResponse): undefined => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
        return undefined;
      });

      tillDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      records = (await new TransactionService().getTransactions({
        tillDate,
      })).records;

      expect(records.length).to.equal(0);
    });

    it('should not return transactions createdBy given user', async () => {
      const transaction = ctx.transactions[0];

      const records = (await new TransactionService().getTransactions({ excludeById: transaction.createdBy.id })).records;
      records.forEach((r) => {
        expect(r.createdBy).to.not.eq(transaction.createdBy.id);
      });
    });
  });

  describe('Get all transactions involving a user', () => {
    it('should return a paginated list', async () => {
      const user = ctx.users[0];
      const { records } = await new TransactionService().getTransactions({}, {}, user);

      const actualTransactions = await AppDataSource.createQueryBuilder(Transaction, 'transaction')
        .leftJoinAndSelect('transaction.from', 'from')
        .leftJoinAndSelect('transaction.createdBy', 'createdBy')
        .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
        .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
        .leftJoin('transaction.subTransactions', 'subTransaction')
        .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
        .where('transaction.fromId = :userId OR transaction.createdById = :userId OR subTransaction.toId = :userId', { userId: user.id })
        .distinct(true)
        .getRawMany();

      expect(records.length).to.equal(Math.min(23, actualTransactions.length));
      expect(records.map((r) => r.id)).to.deep.equalInAnyOrder(
        actualTransactions.map((t) => t.transaction_id),
      );
    });
  });

  describe('Create a transaction', () => {
    it('should return a transaction response corresponding to the saved transaction', async () => {
      // check response without prices
      const savedTransaction = await new TransactionService().createTransaction(ctx.validTransReq);
      const correctResponse = await new TransactionService().getSingleTransaction(savedTransaction.id);
      expect(savedTransaction, 'request not saved correctly').to.eql(correctResponse);

      // check transaction response prices
      expect(correctResponse.totalPriceInclVat, 'top level price incorrect').to.eql(ctx.validTransReq.totalPriceInclVat);

      // check sub transaction response prices
      for (let i = 0; i < correctResponse.subTransactions.length; i += 1) {
        expect(correctResponse.subTransactions[i].totalPriceInclVat, 'sub transaction price incorrect')
          .to.eql(ctx.validTransReq.subTransactions[i].totalPriceInclVat);

        // check sub transaction row response prices
        for (let j = 0; j < correctResponse.subTransactions[i].subTransactionRows.length; j += 1) {
          expect(correctResponse.subTransactions[i].subTransactionRows[j].totalPriceInclVat, 'sub transaction row price incorrect')
            .to.eql(ctx.validTransReq.subTransactions[i].subTransactionRows[j].totalPriceInclVat);
        }
      }
    });
    it('should reset a users inactive notification send to false', async () => {
      const user = await User.findOne({ where: { id: ctx.validTransReq.from } });
      user.inactiveNotificationSend = true;
      await user.save();

      await new TransactionService().createTransaction(ctx.validTransReq);

      const updatedUser = await User.findOne({ where: { id: ctx.validTransReq.from } });
      expect(updatedUser.inactiveNotificationSend).to.be.eq(false);
    });
  });

  describe('Delete a transaction', () => {
    it('should return a transaction response corresponding to the deleted transaction', async () => {
      const savedTransaction = await new TransactionService().createTransaction(ctx.validTransReq);
      const deletedTransaction = await new TransactionService().deleteTransaction(savedTransaction.id);
      expect(deletedTransaction, 'return value incorrect').to.eql(savedTransaction);

      // check deletion of transaction
      expect(await Transaction.findOne({ where: { id: deletedTransaction.id } }), 'transaction not deleted').to.be.null;

      // check deletion of sub transactions
      await Promise.all(deletedTransaction.subTransactions.map(async (sub) => {
        expect(await SubTransaction.findOne({ where: { id: sub.id } }), 'sub transaction not deleted').to.be.null;

        // check deletion of sub transaction rows
        await Promise.all(sub.subTransactionRows.map(async (row) => {
          expect(await SubTransactionRow.findOne({ where: { id: row.id } }), 'sub transaction row not deleted').to.be.null;
        }));
      }));

      // check transaction response prices
      expect(deletedTransaction.totalPriceInclVat, 'top level price incorrect').to.eql(ctx.validTransReq.totalPriceInclVat);

      // check sub transaction response prices
      for (let i = 0; i < deletedTransaction.subTransactions.length; i += 1) {
        expect(deletedTransaction.subTransactions[i].totalPriceInclVat, 'sub transaction price incorrect')
          .to.eql(ctx.validTransReq.subTransactions[i].totalPriceInclVat);

        // check sub transaction row response prices
        for (let j = 0;
          j < deletedTransaction.subTransactions[i].subTransactionRows.length;
          j += 1) {
          expect(deletedTransaction.subTransactions[i].subTransactionRows[j].totalPriceInclVat, 'sub transaction row price incorrect')
            .to.eql(ctx.validTransReq.subTransactions[i].subTransactionRows[j].totalPriceInclVat);
        }
      }
    });
  });

  describe('Update a transaction', () => {
    it('should return a transaction response corresponding to the updated transaction', async () => {
      // create a transaction
      const savedTransaction = await new TransactionService().createTransaction(ctx.validTransReq);

      const updateReq = { ...ctx.validTransReq };
      const price = Math.round(updateReq.subTransactions[0].subTransactionRows[0].totalPriceInclVat.amount / updateReq.subTransactions[0].subTransactionRows[0].amount);
      updateReq.subTransactions[0].subTransactionRows[0].amount += 1;
      updateReq.subTransactions[0].subTransactionRows[0].totalPriceInclVat.amount += price;
      updateReq.subTransactions[0].totalPriceInclVat.amount += price;
      updateReq.totalPriceInclVat.amount += price;

      const updatedTransaction = await new TransactionService().updateTransaction(
        savedTransaction.id, updateReq,
      );

      // check if currently saved transaction is updated
      expect(savedTransaction, 'transaction not updated').to.not.eql(await new TransactionService().getSingleTransaction(
        savedTransaction.id,
      ));
      expect(updatedTransaction, 'transaction updated incorrectly').to.eql(await new TransactionService().getSingleTransaction(
        savedTransaction.id,
      ));

      // check deletion of sub transactions
      await Promise.all(savedTransaction.subTransactions.map(async (sub) => {
        expect(await SubTransaction.findOne({ where: { id: sub.id } }), 'sub transaction not deleted').to.be.null;

        // check deletion of sub transaction rows
        await Promise.all(sub.subTransactionRows.map(async (row) => {
          expect(await SubTransactionRow.findOne({ where: { id: row.id } }), 'sub transaction row not deleted').to.be.null;
        }));
      }));

      // check transaction response prices
      expect(updatedTransaction.totalPriceInclVat, 'top level price incorrect').to.eql(updateReq.totalPriceInclVat);

      // check sub transaction response prices
      for (let i = 0; i < updatedTransaction.subTransactions.length; i += 1) {
        expect(updatedTransaction.subTransactions[i].totalPriceInclVat, 'sub transaction price incorrect')
          .to.eql(updateReq.subTransactions[i].totalPriceInclVat);

        // sort on subtransactionrow id for comparing
        updatedTransaction.subTransactions[i].subTransactionRows.sort((a, b) => {
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        });

        // check sub transaction row response prices
        for (let j = 0;
          j < updatedTransaction.subTransactions[i].subTransactionRows.length;
          j += 1) {
          expect(updatedTransaction.subTransactions[i].subTransactionRows[j].totalPriceInclVat, 'sub transaction row price incorrect')
            .to.eql(updateReq.subTransactions[i].subTransactionRows[j].totalPriceInclVat);
        }
      }
    });
  });

  describe('createValidTransactionRequest function', () => {
    it('should return a valid TransactionRequest', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transaction = await createValidTransactionRequest(
            debtor.id, creditor.id,
          );
          expect(await new TransactionService().verifyTransaction(transaction)).to.be.true;
        });
    });
  });

  describe('getTransactionReportData function', () => {
    it('should get all data for the transaction report', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };
        const report = await new TransactionService().getTransactionReportResponse(parameters);
        expect(report.totalInclVat.amount).to.eq(transactions.total);

        const dataValue = report.data.entries.reduce((sum, current) => {
          return sum += current.count * current.product.priceInclVat.amount;
        }, 0);
        const categoryValue = report.data.categories.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const vatValue = report.data.vat.reduce((sum, current) => {
          return sum += current.totalInclVat.amount;
        }, 0);
        const value = transactions.total;
        expect(dataValue).to.equal(value);
        expect(categoryValue).to.equal(value);
        expect(vatValue).to.equal(value);
      });
    });
  });

  describe('getTransactionReportResponse', () => {
    it('should create a transaction report response', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transactions = await createTransactions(debtor.id, creditor.id, 3);

        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };

        const report = await new TransactionService().getTransactionReportResponse(parameters);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should ignore invoiced transactions', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createInvoiceWithTransfers(debtor.id, creditor.id, 5);
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };
        const report = await new TransactionService().getTransactionReportResponse(parameters);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should ignore transactions made by invoice accounts', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, invoiceAccount: User, creditor: User) => {
        invoiceAccount.type = UserType.INVOICE;
        await User.save(invoiceAccount);
        await createInvoiceWithTransfers(invoiceAccount.id, creditor.id, 5);
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };
        const report = await new TransactionService().getTransactionReportResponse(parameters);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
    it('should ignore transactions made by invoice accounts and invoiced transactions', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, invoiceAccount: User, creditor: User) => {
        invoiceAccount.type = UserType.INVOICE;
        await User.save(invoiceAccount);
        await createInvoiceWithTransfers(invoiceAccount.id, creditor.id, 5);
        await createInvoiceWithTransfers(debtor.id, creditor.id, 3);
        const transactions = await createTransactions(debtor.id, creditor.id, 3);
        const parameters: TransactionFilterParameters = {
          fromDate: new Date(2000, 0, 0),
          tillDate: new Date(2050, 0, 0),
          toId: creditor.id,
        };
        const report = await new TransactionService().getTransactionReportResponse(parameters);
        expect(report.totalInclVat.amount).to.eq(transactions.total);
      });
    });
  });
});
