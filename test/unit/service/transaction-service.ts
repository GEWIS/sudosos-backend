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
import { Connection } from 'typeorm';
import { SwaggerSpecification } from 'swagger-model-validator';
import Transaction from '../../../src/entity/transactions/transaction';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import TransactionService from '../../../src/service/transaction-service';
import { verifyBaseTransactionEntity } from '../validators';
import Swagger from '../../../src/start/swagger';
import { SubTransactionRequest, SubTransactionRowRequest, TransactionRequest } from '../../../src/controller/request/transaction-request';

describe('TransactionService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    transactions: Transaction[],
    req: RequestWithToken,
    validTransReq: TransactionRequest
    spec: SwaggerSpecification,
  };

  // eslint-disable-next-line func-names
  before(async function (): Promise<void> {
    this.timeout(5000);
    const connection = await Database.initialize();
    const app = express();
    const { transactions } = await seedDatabase();
    const req = {
      token: '',
      query: {
        take: 23,
        skip: 0,
      },
    } as any as RequestWithToken;
    const validTransReq = {
      from: 1,
      createdBy: 1,
      subtransactions: [
        {
          to: 2,
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
            },
          ],
        },
      ],
      pointOfSale: {
        id: 1,
        revision: 2,
      },
    } as TransactionRequest;
    ctx = {
      connection,
      app,
      req,
      validTransReq,
      transactions,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('verify transaction', () => {
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

      // incorrect revision
      badPOSReq.pointOfSale = {
        revision: 1,
        id: 1,
      };
      expect(await TransactionService.verifyTransaction(badPOSReq), 'incorrect current revision accepted').to.be.false;
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

      // undefined createdBy
      const badCreatedByReq = {
        ...ctx.validTransReq,
        createdBy: undefined,
      } as TransactionRequest;
      expect(await TransactionService.verifyTransaction(badCreatedByReq), 'undefined createdBy accepted').to.be.false;

      // non existent createdBy user
      badCreatedByReq.createdBy = 0;
      expect(await TransactionService.verifyTransaction(badCreatedByReq), 'nonexistent createdBy accepted').to.be.false;
    });
  });

  describe('verifiy sub transaction', () => {
    it('should return true if the sub transaction request is valid', async () => {
      expect(await TransactionService.verifySubTransaction(ctx.validTransReq.subtransactions[0]))
        .to.be.true;
    });
    it('should return false if the container is invalid', async () => {
      // undefined container
      const badContainerReq = {
        ...ctx.validTransReq.subtransactions[0],
        container: undefined,
      } as SubTransactionRequest;
      expect(await TransactionService.verifySubTransaction(badContainerReq), 'undefined accepted')
        .to.be.false;

      // non existent container
      badContainerReq.container = {
        revision: 1,
        id: 12345,
      };
      expect(await TransactionService.verifySubTransaction(badContainerReq), 'non existent accepted')
        .to.be.false;

      // incorrect revision
      badContainerReq.container = {
        revision: 1,
        id: 1,
      };
      expect(await TransactionService.verifySubTransaction(badContainerReq), 'incorrect current revision accepted')
        .to.be.false;
    });
    it('should return false if the to user is invalid', async () => {
      // undefined to
      const badToReq = {
        ...ctx.validTransReq.subtransactions[0],
        to: undefined,
      } as SubTransactionRequest;
      expect(await TransactionService.verifySubTransaction(badToReq), 'undefined to accepted').to.be.false;

      // non existent to user
      badToReq.to = 0;
      expect(await TransactionService.verifySubTransaction(badToReq), 'non existent to accepted').to.be.false;
    });
  });

  describe('verifiy sub transaction row', () => {
    it('should return true if the sub transaction row request is valid', async () => {
      expect(await TransactionService.verifySubTransactionRow(
        ctx.validTransReq.subtransactions[0].subTransactionRows[0],
      )).to.be.true;
    });
    it('should return false if the product is invalid', async () => {
      // undefined product
      const badProductReq = {
        ...ctx.validTransReq.subtransactions[0].subTransactionRows[0],
        product: undefined,
      } as SubTransactionRowRequest;
      expect(await TransactionService.verifySubTransactionRow(badProductReq), 'undefined product accepted').to.be.false;

      // non existent product
      badProductReq.product = {
        revision: 1,
        id: 12345,
      };
      expect(await TransactionService.verifySubTransactionRow(badProductReq), 'non existent product accepted').to.be.false;

      // incorrect revision
      badProductReq.product = {
        revision: 1,
        id: 1,
      };
      expect(await TransactionService.verifySubTransactionRow(badProductReq), 'incorrect current revision accepted').to.be.false;
    });
    it('should return false if the specified amount of products is invalid', async () => {
      // undefined amount
      const badAmountReq = {
        ...ctx.validTransReq.subtransactions[0].subTransactionRows[0],
        amount: undefined,
      } as SubTransactionRowRequest;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq), 'undefined amount accepted').to.be.false;

      // amount not greater than 0
      badAmountReq.amount = 0;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq), 'amount not greater than 0 accepted').to.be.false;

      // amount not an integer
      badAmountReq.amount = 1.1;
      expect(await TransactionService.verifySubTransactionRow(badAmountReq), 'non integer amount accepted').to.be.false;
    });
  });

  describe('verifiy balance', () => {
    it('should return true if the balance is sufficient');
    it('should return false if the balance is insuficient');
  });

  describe('Get all transactions', () => {
    it('should return a paginated list', async () => {
      const transactions = await TransactionService.getTransactions(ctx.req, {});

      expect(transactions.length).to.equal(23);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
    });

    it('should filter on fromId', async () => {
      const fromId = 1;
      const transactions = await TransactionService.getTransactions(ctx.req, {
        fromId,
      });

      expect(transactions.length).to.equal(9);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(t.from.id).to.be.equal(fromId));
    });

    it('should filter on createdById', async () => {
      const createdById = 1;
      const transactions = await TransactionService.getTransactions(ctx.req, {
        createdById,
      });

      expect(transactions.length).to.equal(14);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(t.createdBy.id).to.be.equal(createdById));
    });

    it('should filter on toId', async () => {
      const toId = 7;
      const transactions = await TransactionService.getTransactions(ctx.req, {
        toId,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.to.id === toId)) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      expect(transactions.length).to.equal(17);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should filter on point of sale', async () => {
      const pointOfSale = { id: 14 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        pointOfSaleId: pointOfSale.id,
      });

      expect(transactions.length).to.equal(6);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(t.pointOfSale.id).to.be.equal(pointOfSale.id));
    });

    it('should filter on point of sale with revision', async () => {
      const pointOfSale = { id: 14, revision: 2 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        pointOfSaleId: pointOfSale.id,
        pointOfSaleRevision: pointOfSale.revision,
      });

      expect(transactions.length).to.equal(2);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(t.pointOfSale.id).to.be.equal(pointOfSale.id));
    });

    it('should filter on container', async () => {
      const container = { id: 11 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        containerId: container.id,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.container.container.id === container.id)) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      expect(transactions.length).to.equal(7);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should filter on container with revision', async () => {
      const container = { id: 11, revision: 2 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        containerId: container.id,
        containerRevision: container.revision,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.container.container.id === container.id
          && s.container.revision === container.revision)) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      expect(transactions.length).to.equal(3);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should filter on product', async () => {
      const product = { id: 44 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        productId: product.id,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.subTransactionRows
          .some((r) => r.product.product.id === product.id))
        ) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      expect(transactions.length).to.equal(5);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should filter on product with revision', async () => {
      const product = { id: 44, revision: 2 };
      const transactions = await TransactionService.getTransactions(ctx.req, {
        productId: product.id,
        productRevision: product.revision,
      });
      const transactionIds = ctx.transactions.map((t) => {
        if (t.subTransactions.some((s) => s.subTransactionRows
          .some((r) => r.product.product.id === product.id
            && r.product.revision === product.revision))
        ) {
          return t.id;
        }
        return undefined;
      }).filter((i) => i !== undefined);

      expect(transactions.length).to.equal(2);
      transactions.map((t) => verifyBaseTransactionEntity(ctx.spec, t));
      transactions.map((t) => expect(transactionIds).to.include(t.id));
    });

    it('should return transactions newer than date', async () => {
      let fromDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      let transactions = await TransactionService.getTransactions(ctx.req, {
        fromDate,
      });

      expect(transactions.length).to.equal(23);
      transactions.map((t) => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.greaterThan(fromDate);
        return undefined;
      });

      fromDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      transactions = await TransactionService.getTransactions(ctx.req, {
        fromDate,
      });

      expect(transactions.length).to.equal(0);
    });

    it('should return transactions older than date', async () => {
      let tillDate = new Date(ctx.transactions[0].createdAt.getTime() + 1000 * 60 * 60 * 24);
      console.log(ctx.transactions[0].createdAt.getTime() < tillDate.getTime());
      let transactions = await TransactionService.getTransactions(ctx.req, {
        tillDate,
      });

      expect(transactions.length).to.equal(23);
      transactions.map((t) => {
        verifyBaseTransactionEntity(ctx.spec, t);
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
        return undefined;
      });

      tillDate = new Date(ctx.transactions[0].createdAt.getTime() - 1000 * 60 * 60 * 24);
      transactions = await TransactionService.getTransactions(ctx.req, {
        tillDate,
      });

      expect(transactions.length).to.equal(0);
    });
  });
});
