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
 */

import { Connection, In } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { UserType } from '../../../src/entity/user/user';
import Invoice from '../../../src/entity/invoices/invoice';
import Database from '../../../src/database/database';
import {
  seedContainers,
  seedInvoices,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions,
  seedUsers,
  seedVatGroups,
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
import Transfer from '../../../src/entity/transactions/transfer';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import InvoiceUser from '../../../src/entity/user/invoice-user';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import wrapInManager from '../../../src/helpers/database';

chai.use(deepEqualInAnyOrder);

export async function createTransactionRequest(debtorId: number,
  creditorId: number, transactionCount: number) {
  const transactions: TransactionRequest[] = [];
  await Promise.all(Array(transactionCount).fill(0, 0).map(async () => {
    const t = await createValidTransactionRequest(
      debtorId, creditorId,
    );
    return transactions.push(t as TransactionRequest);
  }));
  return transactions;
}

export async function requestToTransaction(
  transactionRequests: TransactionRequest[],
) {
  const transactions: Array<{ tId: number; amount: number }> = [];
  let total = 0;
  await Promise.all(
    transactionRequests.map(async (t) => {
      const transactionResponse = await TransactionService.createTransaction(t);
      transactions.push({
        tId: transactionResponse.id,
        amount: transactionResponse.totalPriceInclVat.amount,
      });
      total += transactionResponse.totalPriceInclVat.amount;
    }),
  );
  return { transactions, total };
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
      priceInclVat:
        invoice instanceof Invoice
          ? (entry as InvoiceEntry).priceInclVat.getAmount()
          : (entry as InvoiceEntryResponse).priceInclVat.amount,
    })),
  };
}

export type T = InvoiceResponse | BaseInvoiceResponse | Invoice;

function returnsAll(response: T[], superset: Invoice[], mapping: any) {
  expect(response.map(mapping)).to.deep.equalInAnyOrder(superset.map(mapping));
}

export async function createTransactions(debtorId: number, creditorId: number, transactionCount: number) {
  const transactions: TransactionRequest[] = await createTransactionRequest(
    debtorId, creditorId, transactionCount,
  );
  return Promise.resolve(requestToTransaction(transactions));
}

export async function
createInvoiceWithTransfers(debtorId: number, creditorId: number,
  transactionCount: number) {
  const { transactions } = await createTransactions(debtorId, creditorId, transactionCount);

  const createInvoiceRequest: CreateInvoiceParams = {
    city: 'city',
    country: 'country',
    postalCode: 'postalCode',
    street: 'street',
    reference: 'BAC-41',
    byId: creditorId,
    addressee: 'Addressee',
    description: 'Description',
    forId: debtorId,
    date: new Date(),
    transactionIDs: transactions.map((t) => t.tId),
    isCreditInvoice: false,
  };

  const invoice = await wrapInManager(InvoiceService.createInvoice)(createInvoiceRequest);
  expect((await BalanceService.getBalance(debtorId)).amount.amount).is.equal(0);
  return invoice;
}

describe('InvoiceService', () => {
  let ctx: {
    connection: Connection;
    app: Application;
    specification: SwaggerSpecification;
    users: User[];
    invoices: Invoice[];
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(
      users,
      categories,
      vatGroups,
    );
    const { containerRevisions } = await seedContainers(
      users,
      productRevisions,
    );
    const { pointOfSaleRevisions } = await seedPointsOfSale(
      users,
      containerRevisions,
    );
    const { transactions } = await seedTransactions(
      users,
      pointOfSaleRevisions,
    );
    const { invoices } = await seedInvoices(users, transactions);

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
    await finishTestDB(ctx.connection);
  });

  describe('getInvoices function', () => {
    it('should return all invoices with no input specification', async () => {
      const res = (await InvoiceService.getInvoices());
      returnsAll(res, ctx.invoices, baseKeyMapping);
    });
    it('should return all invoices and their entries if specified', async () => {
      const res: Invoice[] = (
        await InvoiceService.getInvoices({ returnInvoiceEntries: true })
      );
      returnsAll(res, ctx.invoices, keyMapping);
    });
    it('should return a specific invoice if the ID is specified', async () => {
      const invoiceId = ctx.invoices[0].id;
      const res: Invoice[] = (
        await InvoiceService.getInvoices({ invoiceId })
      );
      returnsAll(res, [ctx.invoices[0]], baseKeyMapping);
    });
  });
  describe('getDefaultInvoiceParams function', () => {
    it('should return the default invoice parameters for an invoice user', async () => {
      const user = User.create({
        firstName: 'John',
        lastName: 'Doe',
        type: UserType.INVOICE,
      });
      await user.save();

      const invoiceUser = InvoiceUser.create({
        userId: user.id,
        street: 'Groene Loper 5',
        postalCode: '5612 AE',
        city: 'Eindhoven',
        country: 'Netherlands',
        automatic: true,
      });
      await invoiceUser.save();

      const defaults = await InvoiceService.getDefaultInvoiceParams(user.id);

      expect(defaults).to.not.be.undefined;
      expect(defaults.addressee).to.eq('John Doe');
      expect(defaults.street).to.eq('Groene Loper 5');
      expect(defaults.postalCode).to.eq('5612 AE');
      expect(defaults.city).to.eq('Eindhoven');
      expect(defaults.country).to.eq('Netherlands');
    });
  });
  describe('createTransferFromTransactions function', () => {
    it('should return a correct Transfer', async () => {
      const toId = (await User.findOne({ where: {} })).id;
      const transactions: BaseTransactionResponse[] = (
        await TransactionService.getTransactions({ fromId: toId })
      ).records;
      let value = 0;
      transactions.forEach((t) => {
        value += t.value.amount;
      });

      expect(transactions).to.not.be.empty;
      const transfer: TransferResponse = (
        await InvoiceService.createTransferFromTransactions(toId, transactions, false));
      expect(transfer.amountInclVat.amount).to.be.equal(value);
      expect(transfer.to.id).to.be.equal(toId);
    });
  });
  describe('createInvoice function', () => {
    it('should create Invoice from transaction', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
        },
      );
    });

    it('should create Invoice from multiple transactions', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          await createInvoiceWithTransfers(debtor.id, creditor.id, 20);
        },
      );
    });
    it('should create Invoice for all transactions since date', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // Spent more money.
          const transactionRequestsBeforeDate: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const transactionsBeforeDate = await requestToTransaction(
            transactionRequestsBeforeDate,
          );
          await new Promise((f) => setTimeout(f, 1000));

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            date: new Date(),
            fromDate: new Date().toISOString(),
            isCreditInvoice: false,
          };

          await new Promise((f) => setTimeout(f, 1000));
          // Spent more money.
          const transactionRequestsAfterDate: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const transactionsAfterDate = await requestToTransaction(
            transactionRequestsAfterDate,
          );
          const total = transactionsAfterDate.total;

          const invoice = await wrapInManager(InvoiceService.createInvoice)(
            createInvoiceRequest,
          );
          expect(invoice.transfer.amountInclVat.getAmount()).is.equal(total);
          expect(
            (await BalanceService.getBalance(debtor.id)).amount.amount,
          ).is.equal(-1 * transactionsBeforeDate.total);
        },
      );
    });
    it('should create an Invoice for specific transactions', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // Spent money
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 5);

          const { transactions } = await requestToTransaction(
            transactionRequests,
          );

          const chosenTransactions = transactions.slice(0, 2);

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            date: new Date(),
            transactionIDs: chosenTransactions.map(
              (transaction) => transaction.tId,
            ),
            isCreditInvoice: false,
          };

          const invoice = await wrapInManager(InvoiceService.createInvoice)(
            createInvoiceRequest,
          );
          expect(invoice.transfer.amountInclVat.getAmount()).is.equal(
            chosenTransactions.reduce(
              (sum, current) => sum + current.amount,
              0,
            ),
          );
        },
      );
    });
    it('should create Invoice since latest invoice if nothing specified', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // Spent money and create an invoice.
          await createInvoiceWithTransfers(debtor.id, creditor.id, 3);

          const createInvoiceRequest: CreateInvoiceParams = {
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            isCreditInvoice: false,
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            date: new Date(),
          };

          // Spent more money.
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);

          await new Promise((f) => setTimeout(f, 1000));

          const { total } = await requestToTransaction(
            transactionRequests,
          );

          await new Promise((f) => setTimeout(f, 1000));

          const invoice = await wrapInManager(InvoiceService.createInvoice)(
            createInvoiceRequest,
          );

          expect(invoice.transfer.amountInclVat.getAmount()).is.equal(total);
          expect(
            (await BalanceService.getBalance(debtor.id)).amount.amount,
            'balance after final invoice',
          ).is.equal(0);
        },
      );
    });
    it('should set a reference to Invoice for all SubTransactionRows', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const { transactions } = await requestToTransaction(
            transactionRequests,
          );

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            date: new Date(),
            isCreditInvoice: false,
            transactionIDs: transactions.map((t) => t.tId),
          };

          const invoice = await wrapInManager(InvoiceService.createInvoice)(
            createInvoiceRequest,
          );
          expect(
            (await BalanceService.getBalance(debtor.id)).amount.amount,
          ).is.equal(0);
          const linkedTransactions = await Transaction.find({
            where: {
              id: In(transactions.map((transaction) => transaction.tId)),
            },
            relations: [
              'subTransactions',
              'subTransactions.subTransactionRows',
              'subTransactions.subTransactionRows.invoice',
            ],
          });
          linkedTransactions.forEach((t) => {
            t.subTransactions.forEach((tSub) => {
              tSub.subTransactionRows.forEach((tSubRow) => {
                expect(tSubRow.invoice.id).to.equal(invoice.id);
              });
            });
          });
        },
      );
    });
    it('should create Credit Invoice from transactions', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const { transactions, total } = await createTransactions(debtor.id, creditor.id, 2);
        const createInvoiceRequest: CreateInvoiceParams = {
          city: 'city',
          country: 'country',
          postalCode: 'postalCode',
          street: 'street',
          reference: 'BAC-41',
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          forId: creditor.id,
          date: new Date(),
          transactionIDs: transactions.map((t) => t.tId),
          isCreditInvoice: true,
        };
        await wrapInManager(InvoiceService.createInvoice)(createInvoiceRequest);
        const debtorBalance = await BalanceService.getBalance(debtor.id);
        const creditorBalance = await BalanceService.getBalance(creditor.id);
        expect(debtorBalance.amount.amount).to.equal(-1 * total);
        expect(creditorBalance.amount.amount).to.equal(0);
      });
    });
    it('should create Credit Invoice only for transactions with relevant toId', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, creditor: User, otherCreditor: User) => {
        const transactionA: TransactionRequest = (await createTransactionRequest(
          debtor.id, creditor.id, 1,
        ))[0];
        const transactionB: TransactionRequest = (await createTransactionRequest(
          debtor.id, otherCreditor.id, 1,
        ))[0];
        const joinedTransaction: TransactionRequest = { ...transactionA,
          totalPriceInclVat: {
            ...transactionA.totalPriceInclVat,
            amount: transactionA.totalPriceInclVat.amount + transactionB.totalPriceInclVat.amount,
          },
          subTransactions: transactionA.subTransactions.concat(transactionB.subTransactions),
        };

        const { transactions, total } = await requestToTransaction([joinedTransaction]);
        expect(total).to.equal(transactionA.totalPriceInclVat.amount + transactionB.totalPriceInclVat.amount);
        const createInvoiceRequest: CreateInvoiceParams = {
          city: 'city',
          country: 'country',
          postalCode: 'postalCode',
          street: 'street',
          reference: 'BAC-41',
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          forId: creditor.id,
          date: new Date(),
          transactionIDs: transactions.map((t) => t.tId),
          isCreditInvoice: true,
        };
        const invoice = await wrapInManager(InvoiceService.createInvoice)(createInvoiceRequest);
        const debtorBalance = await BalanceService.getBalance(debtor.id);
        const creditorBalance = await BalanceService.getBalance(creditor.id);
        const otherCreditorBalance = await BalanceService.getBalance(otherCreditor.id);

        expect(debtorBalance.amount.amount).to.equal(-1 * total);
        expect(creditorBalance.amount.amount).to.equal(0);
        expect(otherCreditorBalance.amount.amount).to.equal(transactionB.totalPriceInclVat.amount);

        const subtrans = await SubTransaction.find({ where: { to: { id: otherCreditor.id } }, relations: ['subTransactionRows', 'subTransactionRows.invoice'] });
        const linkedInvoice = subtrans.map((st) => st.subTransactionRows.map((str) => str.invoice?.id)).flat(1);

        const entryValue = invoice.invoiceEntries.reduce((acc, curr) => acc + curr.priceInclVat.getAmount() * curr.amount, 0);
        expect(entryValue).to.equal(transactionA.totalPriceInclVat.amount);

        // Only relevant transactions should be linked.
        expect(linkedInvoice).to.not.include(invoice.id);
      });
    });
    it('should create a seller transfer when Invoice is created', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
        const creditorBalance = await BalanceService.getBalance(creditor.id);
        const transfer = await Transfer.findOne({ where: { from: { id: creditor.id } } });
        expect(transfer).to.not.be.null;
        expect(transfer.amountInclVat.getAmount()).to.eq(invoice.transfer.amountInclVat.getAmount());
        expect(creditorBalance.amount.amount).to.eq(0);
      });
    });
  });
  describe('updateInvoice function', () => {
    it('should update an invoice description and addressee', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // First create an Invoice.
          const invoice = await createInvoiceWithTransfers(
            debtor.id,
            creditor.id,
            1,
          );

          const validUpdateInvoiceParams: UpdateInvoiceParams = {
            addressee: 'Updated-addressee',
            byId: creditor.id,
            description: 'Updated-description',
            invoiceId: invoice.id,
          };

          // Test if attributes were updated
          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            validUpdateInvoiceParams,
          );
          expect(updatedInvoice.description).to.equal(
            validUpdateInvoiceParams.description,
          );
          expect(updatedInvoice.addressee).to.equal(
            validUpdateInvoiceParams.addressee,
          );

          // Sanity check
          const fromDB = await Invoice.findOne({ where: { id: invoice.id } });
          expect(fromDB.description).to.equal(
            validUpdateInvoiceParams.description,
          );
          expect(fromDB.addressee).to.equal(validUpdateInvoiceParams.addressee);
        },
      );
    });
    it('should update the postalCode if update.postalCode is provided', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
          const validUpdateInvoiceParams = {
            postalCode: '12345',
            byId: creditor.id,
            invoiceId: invoice.id,
          };

          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(validUpdateInvoiceParams);
          expect(updatedInvoice.postalCode).to.equal(validUpdateInvoiceParams.postalCode);

          const fromDB = await Invoice.findOne({ where: { id: invoice.id } });
          expect(fromDB.postalCode).to.equal(validUpdateInvoiceParams.postalCode);
        },
      );
    });
    it('should update the city to the city if update.city is provided', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
          const validUpdateInvoiceParams = {
            city: 'Weert',
            byId: creditor.id,
            invoiceId: invoice.id,
          };

          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(validUpdateInvoiceParams);
          expect(updatedInvoice.city).to.equal(validUpdateInvoiceParams.city);

          const fromDB = await Invoice.findOne({ where: { id: invoice.id } });
          expect(fromDB.city).to.equal(validUpdateInvoiceParams.city);
        },
      );
    });
    it('should update the country to the country if update.country is provided', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
          const validUpdateInvoiceParams = {
            country: 'Kazachstan',
            byId: creditor.id,
            invoiceId: invoice.id,
          };

          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(validUpdateInvoiceParams);
          expect(updatedInvoice.country).to.equal(validUpdateInvoiceParams.country);

          const fromDB = await Invoice.findOne({ where: { id: invoice.id } });
          expect(fromDB.country).to.equal(validUpdateInvoiceParams.country);
        },
      );
    });
    it('should update the reference if update.reference is provided', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
          const validUpdateInvoiceParams = {
            reference: 'BAC-123456',
            byId: creditor.id,
            invoiceId: invoice.id,
          };

          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(validUpdateInvoiceParams);
          expect(updatedInvoice.reference).to.equal(validUpdateInvoiceParams.reference);

          const fromDB = await Invoice.findOne({ where: { id: invoice.id } });
          expect(fromDB.reference).to.equal(validUpdateInvoiceParams.reference);
        },
      );
    });

    it('should update an Invoice state', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // First create an Invoice.
          const invoice = await createInvoiceWithTransfers(
            debtor.id,
            creditor.id,
            1,
          );

          const { addressee, description } = invoice;
          const validUpdateInvoiceParams: UpdateInvoiceParams = {
            addressee,
            byId: creditor.id,
            description,
            invoiceId: invoice.id,
            state: InvoiceState.SENT,
          };

          // Test if attributes were updated
          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            validUpdateInvoiceParams,
          );
          expect(InvoiceService.isState(updatedInvoice, InvoiceState.SENT)).to.be.true;
        },
      );
    });
    it('should update an Invoice state twice', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // First create an Invoice.
          const invoice = await createInvoiceWithTransfers(
            debtor.id,
            creditor.id,
            1,
          );

          const { addressee, description } = invoice;
          const makeParamsState = (state: InvoiceState) => ({
            addressee,
            byId: creditor.id,
            description,
            invoiceId: invoice.id,
            state,
          });

          // Test if attributes were updated
          let updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            makeParamsState(InvoiceState.SENT),
          );

          expect(InvoiceService.isState(updatedInvoice, InvoiceState.SENT)).to.be.true;

          updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            makeParamsState(InvoiceState.PAID),
          );

          expect(InvoiceService.isState(updatedInvoice, InvoiceState.PAID)).to.be.true;
        },
      );
    });
    const makeParamsState = (addressee: string, description: string, creditor: User, invoiceId: number, state: InvoiceState) => ({
      addressee,
      byId: creditor.id,
      description,
      invoiceId,
      state,
    });
    it('should delete an Invoice', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          // First create an Invoice.
          const invoice = await createInvoiceWithTransfers(
            debtor.id,
            creditor.id,
            1,
          );

          const { addressee, description } = invoice;

          // Test if attributes were updated
          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            makeParamsState(addressee, description, creditor, invoice.id, InvoiceState.DELETED),
          );
          expect(InvoiceService.isState(updatedInvoice, InvoiceState.DELETED)).to.be.true;

          // Check if the balance has been decreased
          expect(
            (await BalanceService.getBalance(debtor.id)).amount.amount,
          ).is.equal(-1 * invoice.transfer.amountInclVat.getAmount());
        },
      );
    });
    it('should return money to sellers if invoice is deleted', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
        let creditorBalance = await BalanceService.getBalance(creditor.id);
        let debtorBalance = await BalanceService.getBalance(debtor.id);
        expect(creditorBalance.amount.amount).to.eq(0);
        expect(debtorBalance.amount.amount).to.eq(0);

        await wrapInManager(InvoiceService.updateInvoice)(makeParamsState(invoice.addressee,
          invoice.description, creditor, invoice.id, InvoiceState.DELETED));
        expect((await BalanceService.getBalance(debtor.id)).amount.amount)
          .is.equal(-1 * invoice.transfer.amountInclVat.getAmount());
        expect((await BalanceService.getBalance(creditorBalance.id)).amount.amount)
          .is.equal(invoice.transfer.amountInclVat.getAmount());
      });
    });
    it('should delete invoice reference from subTransactions when Invoice is deleted', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const { transactions } = await requestToTransaction(
            transactionRequests,
          );

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            isCreditInvoice: false,
            date: new Date(),
            transactionIDs: transactions.map((t) => t.tId),
          };

          const invoice = await wrapInManager(InvoiceService.createInvoice)(
            createInvoiceRequest,
          );
          let invoiceTransactions = await Transaction.find({
            where: {
              id: In(transactions.map((transaction) => transaction.tId)),
            },
            relations: [
              'subTransactions',
              'subTransactions.subTransactionRows',
              'subTransactions.subTransactionRows.invoice',
            ],
          });
          invoiceTransactions.forEach((t) => {
            t.subTransactions.forEach((tSub) => {
              tSub.subTransactionRows.forEach((tSubRow) => {
                expect(tSubRow.invoice.id).to.equal(invoice.id);
              });
            });
          });

          const { addressee, description } = invoice;
          const updatedInvoice = await wrapInManager(InvoiceService.updateInvoice)(
            makeParamsState(addressee, description, creditor, invoice.id, InvoiceState.DELETED),
          );
          expect(InvoiceService.isState(updatedInvoice, InvoiceState.DELETED)).to.be.true;

          invoiceTransactions = await Transaction.find({
            where: {
              id: In(transactions.map((transaction) => transaction.tId)),
            },
            relations: [
              'subTransactions',
              'subTransactions.subTransactionRows',
              'subTransactions.subTransactionRows.invoice',
            ],
          });
          invoiceTransactions.forEach((t) => {
            t.subTransactions.forEach((tSub) => {
              tSub.subTransactionRows.forEach((tSubRow) => {
                expect(tSubRow.invoice).to.equal(null);
              });
            });
          });
        },
      );
    });
    it('should delete a credit invoice', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const { transactions } = await createTransactions(debtor.id, creditor.id, 5);
          const debtorBalance = await BalanceService.getBalance(debtor.id);
          const creditorBalance = await BalanceService.getBalance(creditor.id);

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            reference: 'BAC-41',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: creditor.id,
            date: new Date(),
            transactionIDs: transactions.map((t) => t.tId),
            isCreditInvoice: true,
          };

          const invoice = await wrapInManager(InvoiceService.createInvoice)(createInvoiceRequest);
          expect(invoice.transfer.from.id).to.equal(creditor.id);
          expect(invoice.transfer.amountInclVat.getAmount()).to.eq(creditorBalance.amount.amount);
          expect((await BalanceService.getBalance(debtor.id)).amount.amount).to.eq(debtorBalance.amount.amount);
          expect((await BalanceService.getBalance(creditor.id)).amount.amount).to.eq(0);

          await wrapInManager(InvoiceService.deleteInvoice)(invoice.id, creditor.id);
          const tr = await Transaction.find({ where: { id: In(transactions.map((transaction) => transaction.tId)) }, relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });

          // should have unlinked the invoice from the transactions
          tr.forEach((t) => {
            t.subTransactions.forEach((tSub) => {
              tSub.subTransactionRows.forEach((tSubRow) => {
                expect(tSubRow.invoice).to.equal(null);
              });
            });
          });

          expect((await BalanceService.getBalance(debtor.id)).amount.amount).to.eq(debtorBalance.amount.amount);
          expect((await BalanceService.getBalance(creditor.id)).amount.amount).to.eq(creditorBalance.amount.amount);
        });
    });
  });
  describe('createTransfersPaidInvoice function', () => {
    it('should subtract amount from sellers', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
        let creditorBalance = await BalanceService.getBalance(creditor.id);
        const debtorBalance = await BalanceService.getBalance(debtor.id);
        expect(creditorBalance.amount.amount).to.equal(0);
        expect(debtorBalance.amount.amount).to.equal(0);
      });
    });
    it('should subtract amount from multiple sellers', async () => {
      await inUserContext((await UserFactory()).clone(3), async (debtor: User, creditor: User, secondCreditor) => {
        const transactions = [];
        transactions.push(...(await createTransactions(debtor.id, creditor.id, 3)).transactions);
        transactions.push(...(await createTransactions(debtor.id, secondCreditor.id, 2)).transactions);

        const createInvoiceRequest: CreateInvoiceParams = {
          city: 'city',
          country: 'country',
          postalCode: 'postalCode',
          street: 'street',
          reference: 'BAC-41',
          byId: creditor.id,
          addressee: 'Addressee',
          description: 'Description',
          forId: debtor.id,
          date: new Date(),
          transactionIDs: transactions.map((t) => t.tId),
          isCreditInvoice: false,
        };

        await wrapInManager(InvoiceService.createInvoice)(createInvoiceRequest);
        let debtorBalance = await BalanceService.getBalance(debtor.id);
        const creditorBalance = await BalanceService.getBalance(creditor.id);
        const secondCreditorBalance = await BalanceService.getBalance(creditor.id);
        expect(creditorBalance.amount.amount).to.equal(0);
        expect(secondCreditorBalance.amount.amount).to.equal(0);
        expect(debtorBalance.amount.amount).to.equal(0);
      });
    });
  });
});
