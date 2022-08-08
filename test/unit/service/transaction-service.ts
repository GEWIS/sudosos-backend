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

import express, { Application } from 'express';
import { expect } from 'chai';
import { Connection, createQueryBuilder } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import log4js, { Logger } from 'log4js';
import { DineroObject } from 'dinero.js';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import TransactionService from '../../../src/service/transaction-service';
import { verifyBaseTransactionEntity } from '../validators';
import Swagger from '../../../src/start/swagger';
import { SubTransactionRequest, SubTransactionRowRequest, TransactionRequest } from '../../../src/controller/request/transaction-request';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';
import User from '../../../src/entity/user/user';
import { createValidTransactionRequest } from '../../helpers/transaction-factory';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import generateBalance from '../../helpers/test-helpers';
import { inUserContext, UserFactory } from '../../helpers/user-factory';

describe('TransactionService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    transactions: Transaction[],
    users: User[],
    validTransReq: TransactionRequest,
    pointOfSale: PointOfSaleRevision,
    container: ContainerRevision,
    spec: SwaggerSpecification,
    logger: Logger,
  };

  // eslint-disable-next-line func-names
  before(async () => {
    const logger: Logger = log4js.getLogger('TransactionServiceTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    const app = express();
    const { transactions, users } = await seedDatabase();

    await generateBalance(1000, 7);
    const validTransReq = {
      from: 7,
      createdBy: 7,
      subTransactions: [
        {
          to: 8,
          container: {
            id: 1,
            revision: 2,
          },
          subTransactionRows: [
            {
              product: {
                id: 1,
                revision: 2,
              },
              amount: 1,
              totalPriceInclVat: {
                amount: 72,
                currency: 'EUR',
                precision: 2,
              },
            },
            {
              product: {
                id: 2,
                revision: 2,
              },
              amount: 2,
              totalPriceInclVat: {
                amount: 146,
                currency: 'EUR',
                precision: 2,
              },
            },
          ],
          totalPriceInclVat: {
            amount: 218,
            currency: 'EUR',
            precision: 2,
          },
        },
        {
          to: 9,
          container: {
            id: 2,
            revision: 2,
          },
          subTransactionRows: [
            {
              product: {
                id: 5,
                revision: 2,
              },
              amount: 4,
              totalPriceInclVat: {
                amount: 304,
                currency: 'EUR',
                precision: 2,
              },
            },
          ],
          totalPriceInclVat: {
            amount: 304,
            currency: 'EUR',
            precision: 2,
          },
        },
      ],
      pointOfSale: {
        id: 1,
        revision: 2,
      },
      totalPriceInclVat: {
        amount: 522,
        currency: 'EUR',
        precision: 2,
      },
    } as TransactionRequest;

    const pointOfSale = await PointOfSaleRevision.findOne({
      where: {
        revision: validTransReq.pointOfSale.revision,
        pointOfSale: { id: validTransReq.pointOfSale.id },
      },
      relations: ['pointOfSale', 'containers'],
    });

    const container = await ContainerRevision.findOne({
      where: {
        revision: validTransReq.subTransactions[0].container.revision,
        container: { id: validTransReq.subTransactions[0].container.id },
      },
      relations: ['container', 'products'],
    });

    ctx = {
      connection,
      app,
      validTransReq,
      pointOfSale,
      transactions,
      users,
      container,
      spec: await Swagger.importSpecification(),
      logger,
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('Get total cost of a transaction', () => {
    it('should return the total cost of a transaction', async () => {
      const total = {
        amount: 522,
        currency: 'EUR',
        precision: 2,
      } as DineroObject;

      const rows: SubTransactionRowRequest[] = [];
      ctx.validTransReq.subTransactions.forEach(
        (sub) => sub.subTransactionRows.forEach((row) => rows.push(row)),
      );
      expect((await TransactionService.getTotalCost(rows)).toObject()).to.eql(total);
    });
  });

  describe('Verifiy balance', () => {
    it('should return true if the balance is sufficient', async () => {
      expect(await TransactionService.verifyBalance(ctx.validTransReq)).to.be.true;
    });
    it('should return false if the balance is insuficient', async () => {
      expect(await TransactionService.verifyBalance({
        ...ctx.validTransReq,
        from: 1,
      })).to.be.false;
    });
  });

  describe('Verify transaction', () => {
    it('should return true if the transaction request is valid', async () => {
      expect(await TransactionService.verifyTransaction(ctx.validTransReq)).to.be.true;
    });
    it('should return false if the point of sale is invalid', async () => {
      // undefined pos
      const badPOSReq = {
        ...ctx.validTransReq,
        pointOfSale: undefined,
      } as TransactionRequest;
      expect(await TransactionService.verifyTransaction(badPOSReq), 'undefined accepted').to.be.false;

      // non existent pos
      badPOSReq.pointOfSale = {
        revision: 1,
        id: 12345,
      };
      expect(await TransactionService.verifyTransaction(badPOSReq), 'non existent accepted').to.be.false;
    });
    it('should return false if a specified top level user is invalid', async () => {
      // undefined from
      const badFromReq = {
        ...ctx.validTransReq,
        from: undefined,
      } as TransactionRequest;
      expect(await TransactionService.verifyTransaction(badFromReq), 'undefined from accepted').to.be.false;

      // non existent from user
      badFromReq.from = 0;
      expect(await TransactionService.verifyTransaction(badFromReq), 'non existent from accepted').to.be.false;

      // inactive from user
      badFromReq.from = 5;
      expect(await TransactionService.verifyTransaction(badFromReq), 'inactive from accepted').to.be.false;

      // undefined createdBy
      const badCreatedByReq = {
        ...ctx.validTransReq,
        createdBy: undefined,
      } as TransactionRequest;
      expect(await TransactionService.verifyTransaction(badCreatedByReq), 'undefined createdBy accepted').to.be.false;

      // non existent createdBy user
      badCreatedByReq.createdBy = 0;
      expect(await TransactionService.verifyTransaction(badCreatedByReq), 'nonexistent createdBy accepted').to.be.false;

      // inactive createdBy user
      badCreatedByReq.createdBy = 5;
      expect(await TransactionService.verifyTransaction(badCreatedByReq), 'inactive createdBy accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq,
        totalPriceInclVat: undefined,
      } as TransactionRequest;
      expect(await TransactionService.verifyTransaction(badPriceReq), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await TransactionService.verifyTransaction(badPriceReq), 'incorrect accepted').to.be.false;
    });
  });

  describe('Verifiy sub transaction', () => {
    it('should return true if the sub transaction request is valid', async () => {
      expect(await TransactionService.verifySubTransaction(
        ctx.validTransReq.subTransactions[0], ctx.pointOfSale,
      )).to.be.true;
    });
    it('should return false if the container is invalid', async () => {
      // undefined container
      const badContainerReq = {
        ...ctx.validTransReq.subTransactions[0],
        container: undefined,
      } as SubTransactionRequest;
      expect(await TransactionService.verifySubTransaction(badContainerReq, ctx.pointOfSale), 'undefined accepted')
        .to.be.false;

      // non existent container
      badContainerReq.container = {
        revision: 1,
        id: 12345,
      };
      expect(await TransactionService.verifySubTransaction(badContainerReq, ctx.pointOfSale), 'non existent accepted')
        .to.be.false;

      // container not in point of sale
      badContainerReq.container = {
        revision: 1,
        id: 1,
      };
      expect(await TransactionService.verifySubTransaction(badContainerReq, ctx.pointOfSale), 'container not in point of sale accepted')
        .to.be.false;
    });
    it('should return false if the to user is invalid', async () => {
      // undefined to
      const badToReq = {
        ...ctx.validTransReq.subTransactions[0],
        to: undefined,
      } as SubTransactionRequest;
      expect(await TransactionService.verifySubTransaction(badToReq, ctx.pointOfSale), 'undefined to accepted').to.be.false;

      // non existent to user
      badToReq.to = 0;
      expect(await TransactionService.verifySubTransaction(badToReq, ctx.pointOfSale), 'non existent to accepted').to.be.false;

      // inactive to user
      badToReq.to = 5;
      expect(await TransactionService.verifySubTransaction(badToReq, ctx.pointOfSale), 'inactive to accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq.subTransactions[0],
        totalPriceInclVat: undefined,
      } as SubTransactionRequest;
      expect(await TransactionService.verifySubTransaction(badPriceReq, ctx.pointOfSale), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await TransactionService.verifySubTransaction(badPriceReq, ctx.pointOfSale), 'incorrect accepted').to.be.false;
    });
  });

  describe('Verifiy sub transaction row', () => {
    it('should return true if the sub transaction row request is valid', async () => {
      expect(await TransactionService.verifySubTransactionRow(
        ctx.validTransReq.subTransactions[0].subTransactionRows[0], ctx.container,
      )).to.be.true;
    });
    it('should return false if the product is invalid', async () => {
      // undefined product
      const badProductReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        product: undefined,
      } as SubTransactionRowRequest;
      expect(await TransactionService.verifySubTransactionRow(badProductReq, ctx.container), 'undefined product accepted').to.be.false;

      // non existent product
      badProductReq.product = {
        revision: 1,
        id: 12345,
      };
      expect(await TransactionService.verifySubTransactionRow(badProductReq, ctx.container), 'non existent product accepted').to.be.false;

      // product not in container
      badProductReq.product = {
        revision: 1,
        id: 1,
      };
      expect(await TransactionService.verifySubTransactionRow(badProductReq, ctx.container), 'product not in container accepted').to.be.false;
    });
    it('should return false if the specified amount of the product is invalid', async () => {
      // undefined amount
      const badAmountReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        amount: undefined,
      } as SubTransactionRowRequest;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq, ctx.container), 'undefined amount accepted').to.be.false;

      // amount not greater than 0
      badAmountReq.amount = 0;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq, ctx.container), 'amount not greater than 0 accepted').to.be.false;

      // amount not an integer
      badAmountReq.amount = 1.1;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq, ctx.container), 'non integer amount accepted').to.be.false;
    });
    it('should return false if the price is set incorrectly', async () => {
      // undefined price
      const badPriceReq = {
        ...ctx.validTransReq.subTransactions[0].subTransactionRows[0],
        totalPriceInclVat: undefined,
      } as SubTransactionRowRequest;
      expect(await TransactionService.verifySubTransactionRow(badPriceReq, ctx.container), 'undefined accepted').to.be.false;

      // incorrect price
      badPriceReq.totalPriceInclVat = {
        amount: 1,
        currency: 'EUR',
        precision: 2,
      };
      expect(await TransactionService.verifySubTransactionRow(badPriceReq, ctx.container), 'incorrect accepted').to.be.false;
    });
  });

  describe('Get all transactions', () => {
    it('should return all transactions', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await TransactionService.getTransactions({});

      expect(records.length).to.equal(ctx.transactions.length);
      records.map((t) => verifyBaseTransactionEntity(ctx.spec, t));

      expect(_pagination.take).to.be.undefined;
      expect(_pagination.skip).to.be.undefined;
      expect(_pagination.count).to.equal(ctx.transactions.length);
    });

    it('should return a paginated list when take is set', async () => {
      const take = 69;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await TransactionService.getTransactions({}, { take });

      const total = await Transaction.count();

      expect(records.length).to.equal(take);
      expect(_pagination.count).to.equal(total);
    });

    it('should not return a paginated list when skip is set', async () => {
      const skip = 69;
      const { records } = await TransactionService.getTransactions({}, { skip });

      expect(records.length).to.equal(ctx.transactions.length - 69);
    });

    it('should return a paginated list when take and skip are set', async () => {
      const skip = 150;
      const take = 50;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { records, _pagination } = await TransactionService.getTransactions({}, { take, skip });

      const total = await Transaction.count();

      expect(_pagination.count).to.equal(total);
      expect(records.length).to.equal(
        Math.min(take, ctx.transactions.length - skip),
      );
    });

    it('should filter on fromId', async () => {
      const fromId = 1;
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      const { records } = await TransactionService.getTransactions({
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
      let { records } = await TransactionService.getTransactions({
        fromDate,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.createdAt.getTime() >= fromDate.getTime());

      const nrOfTransactions = actualTransactions.length;

      expect(records.length).to.equal(nrOfTransactions);
      records.map((t) => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.greaterThan(fromDate);
        return undefined;
      });

      fromDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      records = (await TransactionService.getTransactions({
        fromDate,
      })).records;

      expect(records.length).to.equal(0);
    });

    it('should return transactions older than date', async () => {
      let tillDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      let { records } = await TransactionService.getTransactions({
        tillDate,
      });

      const actualTransactions = ctx.transactions
        .filter((transaction) => transaction.createdAt.getTime() <= tillDate.getTime());

      const nrOfTransactions = actualTransactions.length;

      expect(records.length).to.equal(nrOfTransactions);
      records.map((t) => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
        return undefined;
      });

      tillDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      records = (await TransactionService.getTransactions({
        tillDate,
      })).records;

      expect(records.length).to.equal(0);
    });
  });

  describe('Get all transactions involving a user', () => {
    it('should return a paginated list', async () => {
      const user = ctx.users[0];
      const { records } = await TransactionService.getTransactions({}, {}, user);

      const actualTransactions = await createQueryBuilder(Transaction, 'transaction')
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
      const savedTransaction = await TransactionService.createTransaction(ctx.validTransReq);
      const correctResponse = await TransactionService.getSingleTransaction(savedTransaction.id);
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
  });

  describe('Delete a transaction', () => {
    it('should return a transaction response corresponding to the deleted transaction', async () => {
      const savedTransaction = await TransactionService.createTransaction(ctx.validTransReq);
      const deletedTransaction = await TransactionService.deleteTransaction(savedTransaction.id);
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
      const savedTransaction = await TransactionService.createTransaction(ctx.validTransReq);

      // update previously created transaction
      const updateReq = {
        from: 12,
        createdBy: 11,
        subTransactions: [
          {
            to: 10,
            container: {
              id: 1,
              revision: 2,
            },
            subTransactionRows: [
              {
                product: {
                  id: 1,
                  revision: 2,
                },
                amount: 2,
                totalPriceInclVat: {
                  amount: 144,
                  currency: 'EUR',
                  precision: 2,
                },
              },
              {
                product: {
                  id: 2,
                  revision: 2,
                },
                amount: 1,
                totalPriceInclVat: {
                  amount: 73,
                  currency: 'EUR',
                  precision: 2,
                },
              },
            ],
            totalPriceInclVat: {
              amount: 217,
              currency: 'EUR',
              precision: 2,
            },
          },
          {
            to: 9,
            container: {
              id: 2,
              revision: 2,
            },
            subTransactionRows: [
              {
                product: {
                  id: 5,
                  revision: 2,
                },
                amount: 4,
                totalPriceInclVat: {
                  amount: 304,
                  currency: 'EUR',
                  precision: 2,
                },
              },
            ],
            totalPriceInclVat: {
              amount: 304,
              currency: 'EUR',
              precision: 2,
            },
          },
        ],
        pointOfSale: {
          id: 1,
          revision: 2,
        },
        totalPriceInclVat: {
          amount: 521,
          currency: 'EUR',
          precision: 2,
        },
      } as TransactionRequest;
      const updatedTransaction = await TransactionService.updateTransaction(
        savedTransaction.id, updateReq,
      );

      // check if currently saved transaction is updated
      expect(savedTransaction, 'transaction not updated').to.not.eql(await TransactionService.getSingleTransaction(
        savedTransaction.id,
      ));
      expect(updatedTransaction, 'transaction updated incorrectly').to.eql(await TransactionService.getSingleTransaction(
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
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        const transaction = await createValidTransactionRequest(
          debtor.id, creditor.id,
        );
        expect(await TransactionService.verifyTransaction(transaction)).to.be.true;
      });
    });
  });
});
