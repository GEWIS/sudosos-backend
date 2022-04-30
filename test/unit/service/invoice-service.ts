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
  seedProductCategories,
  seedTransactions,
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
import { CreateInvoiceParams, UpdateInvoiceParams } from '../../../src/controller/request/invoice-request';
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import TransactionService from '../../../src/service/transaction-service';
import { BaseTransactionResponse } from '../../../src/controller/response/transaction-response';
import BalanceService from '../../../src/service/balance-service';
import { createValidTransactionRequest } from '../../helpers/transaction-factory';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { InvoiceState } from '../../../src/entity/invoices/invoice-status';
import Transaction from '../../../src/entity/transactions/transaction';

chai.use(deepEqualInAnyOrder);

export async function createTransactionRequest(debtorId: number,
  creditorId:number, transactionCount: number) {
  const transactions: TransactionRequest[] = [];
  await Promise.all(Array(transactionCount).fill(0, 0).map(async () => {
    const t = await createValidTransactionRequest(
      debtorId, creditorId,
    );
    return transactions.push(t as TransactionRequest);
  }));
  return transactions;
}

export async function requestToTransaction(transactions: TransactionRequest[]) {
  const tIds: number[] = [];
  let cost = 0;
  await Promise.all(transactions.map(async (t) => {
    const transactionResponse = await TransactionService.createTransaction(t);
    cost += transactionResponse.price.amount;
    tIds.push(transactionResponse.id);
  }));
  return { tIds, cost };
}

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

export async function createInvoiceWithTransfers(debtorId: number, creditorId: number,
  transactionCount: number) {
  const transactions: TransactionRequest[] = await createTransactionRequest(
    debtorId, creditorId, transactionCount,
  );
  expect(await BalanceService.getBalance(debtorId)).is.equal(0);
  await new Promise((f) => setTimeout(f, 500));
  const { tIds, cost } = await requestToTransaction(transactions);
  expect(await BalanceService.getBalance(debtorId)).is.equal(-1 * cost);

  const createInvoiceRequest: CreateInvoiceParams = {
    byId: creditorId,
    addressee: 'Addressee',
    description: 'Description',
    toId: debtorId,
    transactionIDs: tIds,
  };

  const invoice = await InvoiceService.createInvoice(createInvoiceRequest);
  await new Promise((f) => setTimeout(f, 100));
  expect(await BalanceService.getBalance(debtorId)).is.equal(0);
  return invoice;
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
      const res: BaseInvoiceResponse[] = (await InvoiceService.getInvoices()).records;
      returnsAll(res, ctx.invoices, baseKeyMapping);
    });
    it('should return all invoices and their entries if specified', async () => {
      const res: InvoiceResponse[] = (
        await InvoiceService.getInvoices({ returnInvoiceEntries: true }))
        .records as InvoiceResponse[];
      returnsAll(res, ctx.invoices, keyMapping);
    });
    it('should return a specific invoice if the ID is specified', async () => {
      const invoiceId = ctx.invoices[0].id;
      const res: BaseInvoiceResponse[] = (await InvoiceService.getInvoices({ invoiceId })).records;
      returnsAll(res, [ctx.invoices[0]], baseKeyMapping);
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
        await new Promise((f) => setTimeout(f, 1000));
        await createInvoiceWithTransfers(debtor.id, creditor.id, 5);

        const invoice = (await InvoiceService.getInvoices({ toId: debtor.id })).records[0];
        expect(invoice).to.not.be.undefined;

        const createInvoiceRequest: CreateInvoiceParams = {
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
          fromDate: new Date().toISOString(),
        };

        await new Promise((f) => setTimeout(f, 1000));
        // Spent more money.
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
        const first = await requestToTransaction(transactions);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * first.cost);

        await InvoiceService.createInvoice(createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
      });
    });
    it('should create an Invoice for transactions without prior invoice', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // If we don't wait then the user created at and transactions will be the same.
        await new Promise((f) => setTimeout(f, 1000));

        // Spent money
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        const createInvoiceRequest: CreateInvoiceParams = {
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
        };

        const first = await requestToTransaction(transactions);

        await new Promise((f) => setTimeout(f, 500));
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * first.cost);

        await new Promise((f) => setTimeout(f, 1000));

        await InvoiceService.createInvoice(createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
      });
    });
    it('should create Invoice since latest invoice if nothing specified', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // Spent money and create an invoice.
        await createInvoiceWithTransfers(debtor.id, creditor.id, 3);
        await new Promise((f) => setTimeout(f, 1000));
        await createInvoiceWithTransfers(debtor.id, creditor.id, 5);
        await new Promise((f) => setTimeout(f, 1000));

        const invoice = (await InvoiceService.getInvoices({ toId: debtor.id })).records[0];
        expect(invoice).to.not.be.undefined;

        const createInvoiceRequest: CreateInvoiceParams = {
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
        };

        // Spent more money.
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        const first = await requestToTransaction(transactions);
        await new Promise((f) => setTimeout(f, 500));
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * first.cost);

        await new Promise((f) => setTimeout(f, 1000));

        await InvoiceService.createInvoice(createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
      });
    });
    it('should set a reference to Invoice for all SubTransactionRows', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        const transactionRequests: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );
        const { tIds } = await requestToTransaction(transactionRequests);

        const createInvoiceRequest: CreateInvoiceParams = {
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
          transactionIDs: tIds,
        };

        const invoice = await InvoiceService.createInvoice(createInvoiceRequest);
        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
        const transactions = await Transaction.findByIds(tIds, { relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
        transactions.forEach((t) => {
          t.subTransactions.forEach((tSub) => {
            tSub.subTransactionRows.forEach((tSubRow) => {
              expect(tSubRow.invoice.id).to.equal(invoice.id);
            });
          });
        });
      });
    });
  });
  describe('updateInvoice function', () => {
    it('should update an invoice description and addressee', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // First create an Invoice.
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);

        const validUpdateInvoiceParams: UpdateInvoiceParams = {
          addressee: 'Updated-addressee',
          byId: creditor.id,
          description: 'Updated-description',
          invoiceId: invoice.id,
        };

        // Test if attributes were updated
        const updatedInvoice = await InvoiceService.updateInvoice(validUpdateInvoiceParams);
        expect(updatedInvoice.description).to.equal(validUpdateInvoiceParams.description);
        expect(updatedInvoice.addressee).to.equal(validUpdateInvoiceParams.addressee);

        // Sanity check
        const fromDB = await Invoice.findOne(invoice.id);
        expect(fromDB.description).to.equal(validUpdateInvoiceParams.description);
        expect(fromDB.addressee).to.equal(validUpdateInvoiceParams.addressee);
      });
    });
    it('should update an Invoice state', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // First create an Invoice.
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);

        const { addressee, description } = invoice;
        const validUpdateInvoiceParams: UpdateInvoiceParams = {
          addressee,
          byId: creditor.id,
          description,
          invoiceId: invoice.id,
          state: InvoiceState.SENT,
        };

        // Test if attributes were updated
        const updatedInvoice = await InvoiceService.updateInvoice(validUpdateInvoiceParams);
        expect(updatedInvoice.currentState.state).to.be.equal(InvoiceState[InvoiceState.SENT]);
      });
    });
    it('should update an Invoice state twice', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // First create an Invoice.
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);

        const { addressee, description } = invoice;
        const makeParamsState = (state: InvoiceState) => ({
          addressee,
          byId: creditor.id,
          description,
          invoiceId: invoice.id,
          state,
        });

        // Test if attributes were updated
        let updatedInvoice = await InvoiceService
          .updateInvoice(makeParamsState(InvoiceState.SENT));
        expect(updatedInvoice.currentState.state).to.be.equal(InvoiceState[InvoiceState.SENT]);

        updatedInvoice = await InvoiceService
          .updateInvoice(makeParamsState(InvoiceState.PAID));
        expect(updatedInvoice.currentState.state).to.be.equal(InvoiceState[InvoiceState.PAID]);
      });
    });
    it('should delete an Invoice', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // First create an Invoice.
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);

        const { addressee, description } = invoice;
        const makeParamsState = (state: InvoiceState) => ({
          addressee,
          byId: creditor.id,
          description,
          invoiceId: invoice.id,
          state,
        });

        // Test if attributes were updated
        const updatedInvoice = await InvoiceService
          .updateInvoice(makeParamsState(InvoiceState.DELETED));
        expect(updatedInvoice.currentState.state).to.be.equal(InvoiceState[InvoiceState.DELETED]);

        // Check if the balance has been decreased
        expect(await BalanceService.getBalance(debtor.id))
          .is.equal(-1 * invoice.transfer.amount.amount);
      });
    });
    it('should delete invoice reference from subTransactions when Invoice is deleted', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        const transactionRequests: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );
        const { tIds } = await requestToTransaction(transactionRequests);

        const createInvoiceRequest: CreateInvoiceParams = {
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          toId: debtor.id,
          transactionIDs: tIds,
        };

        const invoice = await InvoiceService.createInvoice(createInvoiceRequest);
        let transactions = await Transaction.findByIds(tIds, { relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
        transactions.forEach((t) => {
          t.subTransactions.forEach((tSub) => {
            tSub.subTransactionRows.forEach((tSubRow) => {
              expect(tSubRow.invoice.id).to.equal(invoice.id);
            });
          });
        });

        const { addressee, description } = invoice;
        const makeParamsState = (state: InvoiceState) => ({
          addressee,
          byId: creditor.id,
          description,
          invoiceId: invoice.id,
          state,
        });
        const updatedInvoice = await InvoiceService
          .updateInvoice(makeParamsState(InvoiceState.DELETED));
        expect(updatedInvoice.currentState.state).to.be.equal(InvoiceState[InvoiceState.DELETED]);

        transactions = await Transaction.findByIds(tIds, { relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
        transactions.forEach((t) => {
          t.subTransactions.forEach((tSub) => {
            tSub.subTransactionRows.forEach((tSubRow) => {
              expect(tSubRow.invoice).to.equal(null);
            });
          });
        });
      });
    });
  });
});
