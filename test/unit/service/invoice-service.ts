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
import Database, { AppDataSource } from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import {
  BaseInvoiceResponse,
  InvoiceResponse,
} from '../../../src/controller/response/invoice-response';
import InvoiceService from '../../../src/service/invoice-service';
import { CreateInvoiceParams, UpdateInvoiceParams } from '../../../src/controller/request/invoice-request';
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import TransactionService from '../../../src/service/transaction-service';
import { BaseTransactionResponse, TransactionResponse } from '../../../src/controller/response/transaction-response';
import BalanceService from '../../../src/service/balance-service';
import { createTransactionRequest, createTransactions, requestToTransaction } from '../../helpers/transaction-factory';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { InvoiceState } from '../../../src/entity/invoices/invoice-status';
import Transaction from '../../../src/entity/transactions/transaction';
import InvoiceUser from '../../../src/entity/user/invoice-user';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { InvoiceSeeder, TransactionSeeder, UserSeeder } from '../../seed';

chai.use(deepEqualInAnyOrder);

function keyMapping(invoice: BaseInvoiceResponse | Invoice) {
  return {
    id: invoice.id,
    toId: invoice.to.id,
  };
}

export type T = InvoiceResponse | BaseInvoiceResponse | Invoice;

function returnsAll(response: T[], superset: Invoice[], mapping: any) {
  expect(response.map(mapping)).to.deep.equalInAnyOrder(superset.map(mapping));
}

export async function
createInvoiceWithTransfers(debtorId: number, creditorId: number,
  transactionCount: number) {
  const { transactions, total } = await createTransactions(debtorId, creditorId, transactionCount);

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
    amount: {
      amount: total,
      currency: 'EUR',
      precision: 2,
    },
  };

  const creditorBalance = await new BalanceService().getBalance(creditorId);

  const invoice = await AppDataSource.manager.transaction(async (manager) => {
    return new InvoiceService(manager).createInvoice(createInvoiceRequest);
  });
  expect((await new BalanceService().getBalance(debtorId)).amount.amount).is.equal(0);
  expect((await new BalanceService().getBalance(creditorId)).amount.amount).is.equal(creditorBalance.amount.amount);
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

    const users = await new UserSeeder().seed();
    const { transactions } = await new TransactionSeeder().seed(users);
    const { invoices } = await new InvoiceSeeder().seed(users, transactions);

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
      const res = (await new InvoiceService().getInvoices());
      returnsAll(res, ctx.invoices, keyMapping);
    });
    it('should return all invoices and their entries if specified', async () => {
      const res: Invoice[] = (
        await new InvoiceService().getInvoices({ returnInvoiceEntries: true })
      );
      returnsAll(res, ctx.invoices, keyMapping);
    });
    it('should return a specific invoice if the ID is specified', async () => {
      const invoiceId = ctx.invoices[0].id;
      const res: Invoice[] = (
        await new InvoiceService().getInvoices({ invoiceId })
      );
      returnsAll(res, [ctx.invoices[0]], keyMapping);
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

      const defaults = await AppDataSource.manager.transaction(async (manager) => {
        return new InvoiceService(manager).getDefaultInvoiceParams(user.id);
      });

      expect(defaults).to.not.be.undefined;
      expect(defaults.addressee).to.eq('John Doe');
      expect(defaults.street).to.eq('Groene Loper 5');
      expect(defaults.postalCode).to.eq('5612 AE');
      expect(defaults.city).to.eq('Eindhoven');
      expect(defaults.country).to.eq('Netherlands');
    });
  });
  describe('createTransfer function', () => {
    it('should return a correct Transfer', async () => {
      const toId = (await User.findOne({ where: {} })).id;
      const transactions: BaseTransactionResponse[] = (
        await new TransactionService().getTransactions({ fromId: toId })
      ).records;
      let value = 0;
      transactions.forEach((t) => {
        value += t.value.amount;
      });

      expect(transactions).to.not.be.empty;
      const transfer: TransferResponse = (
        await new InvoiceService().createTransfer(toId,
          await AppDataSource.manager.find(Transaction, { where: { id: In(transactions.map((t) => t.id)) } }),
          { amount: value, currency: 'EUR', precision: 2 }));
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

          const fromDate = new Date();

          await new Promise((f) => setTimeout(f, 1000));

          // Spent more money.
          const transactionRequestsAfterDate: TransactionRequest[] =
            await createTransactionRequest(debtor.id, creditor.id, 2);
          const transactionsAfterDate = await requestToTransaction(
            transactionRequestsAfterDate,
          );
          const total = transactionsAfterDate.total;

          const transactions = await new InvoiceService().getTransactionsForInvoice({
            forId: debtor.id,
            fromDate,
          });

          expect(transactions).to.not.eq(false);
          expect(transactions).length.to.be.greaterThan(0);

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
            transactionIDs: (transactions as TransactionResponse[]).map((t) => t.id),
            amount: {
              amount: total,
              currency: 'EUR',
              precision: 2,
            },
          };

          const invoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).createInvoice(createInvoiceRequest);
          });
          expect(invoice.transfer.amountInclVat.getAmount()).is.equal(total);
          expect(
            (await new BalanceService().getBalance(debtor.id)).amount.amount,
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
            amount: {
              amount: chosenTransactions.reduce(
                (acc, curr) => acc + curr.amount,
                0,
              ),
              currency: 'EUR',
              precision: 2,
            },
          };

          const invoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).createInvoice(createInvoiceRequest);
          });
          expect(invoice.transfer.amountInclVat.getAmount()).is.equal(
            chosenTransactions.reduce(
              (sum, current) => sum + current.amount,
              0,
            ),
          );
        },
      );
    });
    it('should set a reference to Invoice for all SubTransactionRows', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const { transactions, total } = await requestToTransaction(
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
            transactionIDs: transactions.map((t) => t.tId),
            amount: {
              amount: total,
              currency: 'EUR',
              precision: 2,
            },
          };

          const invoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).createInvoice(createInvoiceRequest);
          });
          expect(
            (await new BalanceService().getBalance(debtor.id)).amount.amount,
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
          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
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

          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
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

          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
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

          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
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

          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
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
          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              validUpdateInvoiceParams,
            );
          });
          console.error(updatedInvoice);
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
          let updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              makeParamsState(InvoiceState.SENT),
            );
          });

          expect(InvoiceService.isState(updatedInvoice, InvoiceState.SENT)).to.be.true;

          updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              makeParamsState(InvoiceState.PAID),
            );
          });

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
          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              makeParamsState(addressee, description, creditor, invoice.id, InvoiceState.DELETED),
            );
          });
          expect(InvoiceService.isState(updatedInvoice, InvoiceState.DELETED)).to.be.true;

          // Check if the balance has been decreased
          expect(
            (await new BalanceService().getBalance(debtor.id)).amount.amount,
          ).is.equal(-1 * invoice.transfer.amountInclVat.getAmount());
        },
      );
    });
    it('should delete invoice reference from subTransactions when Invoice is deleted', async () => {
      await inUserContext(
        await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transactionRequests: TransactionRequest[] =
                        await createTransactionRequest(debtor.id, creditor.id, 2);
          const { transactions, total } = await requestToTransaction(
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
            transactionIDs: transactions.map((t) => t.tId),
            amount: {
              amount: total,
              currency: 'EUR',
              precision: 2,
            },
          };

          const invoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).createInvoice(createInvoiceRequest);
          });
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
          const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
            return new InvoiceService(manager).updateInvoice(
              makeParamsState(addressee, description, creditor, invoice.id, InvoiceState.DELETED),
            );
          });
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
  });
});
