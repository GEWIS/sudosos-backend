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
import { json } from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User from '../../../src/entity/user/user';
import Invoice from '../../../src/entity/invoices/invoice';
import Database from '../../../src/database/database';
import {
  seedAllContainers,
  seedAllProducts,
  seedInvoices,
  seedPointsOfSale,
  seedProductCategories, seedTransactions,
  seedUsers,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import {
  BaseInvoiceResponse,
  InvoiceEntryResponse,
  InvoiceResponse,
} from '../../../src/controller/response/invoice-response';
import InvoiceService from '../../../src/service/invoice-service';
import InvoiceEntry from '../../../src/entity/invoices/invoice-entry';
import CreateInvoiceRequest from '../../../src/controller/request/create-invoice-request';
import Transaction from '../../../src/entity/transactions/transaction';
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import TransactionService from '../../../src/service/transaction-service';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';
import BalanceService from '../../../src/service/balance-service';
import { createValidTransactionRequest } from '../../helpers/transaction-factory';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';

chai.use(deepEqualInAnyOrder);

function baseKeyMapping(invoice: BaseInvoiceResponse | Invoice) {
  return {
    id: invoice.id,
    toId: invoice.to.id,
  };
}

function keyMapping(invoice: InvoiceResponse | Invoice) {
  return {
    ...baseKeyMapping(invoice),
    entries: invoice.invoiceEntries.map((entry) => ({
      amount: entry.amount,
      description: entry.description,
      price: invoice instanceof Invoice
        ? (entry as InvoiceEntry).price.getAmount() : (entry as InvoiceEntryResponse).price.amount,
    })),
  };
}
export type T = InvoiceResponse | BaseInvoiceResponse;
function returnsAll(response: T[], supeset: Invoice[], mapping: any) {
  expect(response.map(mapping))
    .to.deep.equalInAnyOrder(supeset.map(mapping));
}

describe('InvoiceService', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    invoices: Invoice[],
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const {
      products,
      productRevisions,
    } = await seedAllProducts(users, categories);
    const {
      containerRevisions,
    } = await seedAllContainers(users, productRevisions, products);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions);
    const invoices = await seedInvoices(users, transactions);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      invoices,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  describe('getInvoices function', () => {
    it('should return all invoices with no input specification', async () => {
      const res: BaseInvoiceResponse[] = await InvoiceService.getInvoices();
      returnsAll(res, ctx.invoices, baseKeyMapping);
    });
    it('should return all invoices and their entries if specified', async () => {
      const res: InvoiceResponse[] = (
        await InvoiceService.getInvoices({ returnInvoiceEntries: true })) as InvoiceResponse[];
      returnsAll(res, ctx.invoices, keyMapping);
    });
    it('should return a specific invoice if the ID is specified', async () => {
      const invoiceId = ctx.invoices[0].id;
      const res: BaseInvoiceResponse[] = await InvoiceService.getInvoices({ invoiceId });
      returnsAll(res, [ctx.invoices[0]], baseKeyMapping);
    });
  });
  describe('verifyInvoiceRequest function', () => {
    it('should return true if the CreateInvoiceRequest is valid with defined transactions', async () => {
      const toId = 5;
      expect(await User.findOne({ id: toId })).to.not.be.undefined;

      const transactions: Transaction[] = await Transaction.find({ where: { from: toId } });
      const transactionIDs = transactions.map((t) => t.id);

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'addressee',
        description: 'description',
        toId,
        transactionIDs,
      };

      const valid = await InvoiceService.verifyInvoiceRequest(createInvoiceRequest);
      expect(valid).to.be.true;
    });
    it('should return true if the CreateInvoiceRequest is valid without defined transactions', async () => {
      const toId = 5;
      expect(await User.findOne({ id: toId })).to.not.be.undefined;

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'addressee',
        description: 'description',
        toId,
      };

      const valid = await InvoiceService.verifyInvoiceRequest(createInvoiceRequest);
      expect(valid).to.be.true;
    });
    it('should return false if the id is invalid', async () => {
      const toId = 0;
      expect(await User.findOne({ id: toId })).to.be.undefined;

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'addressee',
        description: 'description',
        toId,
      };

      const valid = await InvoiceService.verifyInvoiceRequest(createInvoiceRequest);
      expect(valid).to.be.false;
    });
    it('should return false if the transaction ids are invalid', async () => {
      const toId = 5;
      expect(await User.findOne({ id: toId })).to.be.not.undefined;

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'addressee',
        description: 'description',
        toId,
        transactionIDs: [0],
      };

      const valid = await InvoiceService.verifyInvoiceRequest(createInvoiceRequest);
      expect(valid).to.be.false;
    });
    it('should return false if the transactions are not owned by the user', async () => {
      const toId = 5;
      expect(await User.findOne({ id: toId })).to.be.not.undefined;

      const transactions: Transaction[] = await Transaction.find({ where: { from: toId } });
      let transactionIDs = transactions.map((t) => t.id);
      transactionIDs = [Math.max(...transactionIDs) + 1];

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'addressee',
        description: 'description',
        toId,
        transactionIDs,
      };

      const valid = await InvoiceService.verifyInvoiceRequest(createInvoiceRequest);
      expect(valid).to.be.false;
    });
  });
  describe('createTransferFromTransactions function', () => {
    it('should return a correct Transfer', async () => {
      const toId = (await User.findOne()).id;
      const transactions: BaseTransactionResponse[] = (
        await TransactionService.getTransactions({ fromId: toId })).records;
      let value = 0;
      transactions.forEach((t) => { value += t.value.amount; });

      expect(transactions).to.not.be.empty;
      const transfer: TransferResponse = (
        await InvoiceService.createTransferFromTransactions(toId, transactions));
      expect(transfer.amount.amount).to.be.equal(value);
      expect(transfer.to.id).to.be.equal(toId);
    });
  });
  describe('createInvoice function', () => {
    async function createTransactionRequest(debtorId: number, creditorId:number, transactionCount: number) {
      const transactions: TransactionRequest[] = [];
      await Promise.all(Array(transactionCount).fill(0, 0).map(async () => {
        const t = await createValidTransactionRequest(
          debtorId, creditorId,
        );
        return transactions.push(t as TransactionRequest);
      }));
      return transactions;
    }

    async function requestToTransaction(transactions: TransactionRequest[]) {
      const tIds: number[] = [];
      let cost = 0;
      await Promise.all(transactions.map(async (t) => {
        const transactionResponse = await TransactionService.createTransaction(t);
        cost += transactionResponse.price.amount;
        tIds.push(transactionResponse.id);
      }));
      return { tIds, cost };
    }

    async function createInvoiceWithTransfers(debtorId: number, creditorId: number,
      transactionCount: number) {
      const transactions: TransactionRequest[] = await createTransactionRequest(
        debtorId, creditorId, transactionCount,
      );
      expect(await BalanceService.getBalance(debtorId)).is.equal(0);

      const { tIds, cost } = await requestToTransaction(transactions);
      expect(await BalanceService.getBalance(debtorId)).is.equal(-1 * cost);

      const createInvoiceRequest: CreateInvoiceRequest = {
        addressee: 'Addressee',
        description: 'Description',
        toId: debtorId,
        transactionIDs: tIds,
      };

      const invoice = await InvoiceService.createInvoice(debtorId,
        createInvoiceRequest);
      expect(await BalanceService.getBalance(debtorId)).is.equal(0);
      return invoice;
    }
    it('should create Invoice from transactions', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
      });
    });
    it('should create Invoice from multiple transactions', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        await createInvoiceWithTransfers(debtor.id, creditor.id, 20);
      });
    });
    it('should create Invoice for all transactions since date', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // Spent money and create an invoice.
        await createInvoiceWithTransfers(debtor.id, creditor.id, 3);

        // Wait a bit before creating a new Invoice.
        await new Promise((f) => setTimeout(f, 500));
        await createInvoiceWithTransfers(debtor.id, creditor.id, 5);

        const invoice = (await InvoiceService.getInvoices({ toId: debtor.id }))[0];
        expect(invoice).to.not.be.undefined;

        const createInvoiceRequest: CreateInvoiceRequest = {
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
          fromDate: new Date(),
        };

        await new Promise((f) => setTimeout(f, 1000));
        // Spent more money.
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        const first = await requestToTransaction(transactions);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * first.cost);

        await InvoiceService.createInvoice(debtor.id, createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
      });
    });
    it('should create Invoice since latest invoice if nothing specified', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // Spent money and create an invoice.
        await createInvoiceWithTransfers(debtor.id, creditor.id, 3);

        // Wait a bit before creating a new Invoice.
        await new Promise((f) => setTimeout(f, 500));
        await createInvoiceWithTransfers(debtor.id, creditor.id, 5);

        const invoice = (await InvoiceService.getInvoices({ toId: debtor.id }))[0];
        expect(invoice).to.not.be.undefined;

        const createInvoiceRequest: CreateInvoiceRequest = {
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
        };

        await new Promise((f) => setTimeout(f, 1000));
        // Spent more money.
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        const first = await requestToTransaction(transactions);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * first.cost);

        await InvoiceService.createInvoice(debtor.id, createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
      });
    });
  });
});
