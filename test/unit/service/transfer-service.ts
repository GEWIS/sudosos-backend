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

import dinero from 'dinero.js';
import bodyParser from 'body-parser';
import { expect } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { DataSource } from 'typeorm';
import TransferRequest from '../../../src/controller/request/transfer-request';
import Database from '../../../src/database/database';
import Transfer from '../../../src/entity/transactions/transfer';
import User from '../../../src/entity/user/user';
import TransferService, { TransferCategory } from '../../../src/service/transfer-service';
import Invoice from '../../../src/entity/invoices/invoice';
import Swagger from '../../../src/start/swagger';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import VatGroup from '../../../src/entity/vat-group';
import {
  ContainerSeeder, DepositSeeder, FineSeeder, InvoiceSeeder, PayoutRequestSeeder,
  PointOfSaleSeeder,
  ProductSeeder,
  SellerPayoutSeeder,
  TransactionSeeder, TransferSeeder,
  UserSeeder,
  VatGroupSeeder,
} from '../../seed';
import sinon from 'sinon';
import SellerPayout from '../../../src/entity/transactions/payout/seller-payout';

describe('TransferService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    transfers: Transfer[],
    sellerPayouts: SellerPayout[],
    vatGroups: VatGroup[],
  };
  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date('1950-02-12T01:57:45.271Z');
    const end = new Date('2001-02-12T01:57:45.271Z');

    const users = await new UserSeeder().seed();
    const vatGroups = await new VatGroupSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed(users, undefined, vatGroups);
    const { containerRevisions } = await new ContainerSeeder().seed(users, productRevisions);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const transfers = await new TransferSeeder().seed(users, begin, end);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions, begin, end);
    const subTransactions = transactions.map((t) => t.subTransactions).flat();
    const { invoiceTransfers } = await new InvoiceSeeder().seed(users, transactions);
    const { payoutRequestTransfers } = await new PayoutRequestSeeder().seed(users);
    const { stripeDepositTransfers } = await new DepositSeeder().seed(users);
    const { sellerPayouts, transfers: sellerPayoutTransfers } = await new SellerPayoutSeeder()
      .seed(users, transactions, subTransactions, transfers);

    const transfers2 = transfers.concat(invoiceTransfers).concat(payoutRequestTransfers).concat(stripeDepositTransfers).concat(sellerPayoutTransfers);

    const { users: users2, fineTransfers } = await new FineSeeder().seed(users, transactions, transfers, true);

    // Sanity check: seeder must produce at least one seller payout
    if (sellerPayouts.length === 0) throw new Error('SellerPayoutSeeder produced no payouts — check seed data');

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users: users2,
      sellerPayouts,
      vatGroups,
      transfers: transfers2.concat(fineTransfers),
    };
  });
  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });
  describe('getTransfers function', async (): Promise<void> => {
    it('should return all transfers', async () => {
      const [records] = await new TransferService().getTransfers();
      expect(records.length).to.equal(ctx.transfers.length);
      const ids = new Set(ctx.transfers.map((obj) => obj.id));
      records.forEach((element) => ids.delete(element.id));
      expect(ids.size).to.equal(0);
    });

    it('should return all transfers involving a single user', async () => {
      const user = ctx.users[0];
      const [records] = await new TransferService().getTransfers({}, {}, user);
      const actualTransfers = ctx.transfers
        .filter((t) => (t.from && t.from.id === user.id) || (t.to && t.to.id === user.id));
      expect(records.length).to.equal(actualTransfers.length);
      records.forEach((t) => expect(
        (t.from && t.from.id === user.id) || (t.to && t.to.id === user.id),
      ).to.be.true);
    });

    it('should return a single transfer if id is specified', async () => {
      const [records] = await new TransferService()
        .getTransfers({ id: ctx.transfers[0].id });
      expect(records.length).to.equal(1);
      expect(records[0].id).to.equal(ctx.transfers[0].id);
    });

    it('should return nothing if a wrong id is specified', async () => {
      const [records] = await new TransferService()
        .getTransfers({ id: ctx.transfers.length + 1 });
      expect(records).to.be.empty;
    });

    it('should return all transfer after a given date', async () => {
      const transfer = ctx.transfers[2];
      const fromDate = transfer.createdAt;

      const actualTransfers = ctx.transfers.filter((t) => t.createdAt.getTime() >= fromDate.getTime());
      // Sanity check
      expect(actualTransfers.length).to.be.at.most(ctx.transfers.length - 2);
      expect(actualTransfers.length).to.be.at.least(1);

      const [records] = await new TransferService().getTransfers({ fromDate });
      expect(records).to.be.lengthOf(actualTransfers.length);
      records.forEach((t) => {
        expect(t.createdAt).to.be.greaterThanOrEqual(fromDate);
      });
    });

    it('should return all transfer before a given date', async () => {
      const transfer = ctx.transfers[2];
      const tillDate = transfer.createdAt;

      const actualTransfers = ctx.transfers.filter((t) => t.createdAt.getTime() < tillDate.getTime());
      // Sanity check
      expect(actualTransfers.length).to.be.at.most(ctx.transfers.length - 2);
      expect(actualTransfers.length).to.be.at.least(1);

      const [records] = await new TransferService().getTransfers({ tillDate });
      expect(records).to.be.lengthOf(actualTransfers.length);
      records.forEach((t) => {
        expect(t.createdAt).to.be.lessThan(tillDate);
      });
    });

    it('should return all transfer between a two dates', async () => {
      const firstTransfer = ctx.transfers[2];
      const fromDate = firstTransfer.createdAt;
      const lastTransfer = ctx.transfers.filter((t) => t.createdAt.getTime() > fromDate.getTime())[2];
      const tillDate = lastTransfer.createdAt;

      const actualTransfers = ctx.transfers
        .filter((t) => t.createdAt.getTime() >= fromDate.getTime()
          && t.createdAt.getTime() < tillDate.getTime());
      // Sanity check
      expect(actualTransfers.length).to.be.at.most(ctx.transfers.length - 2);
      expect(actualTransfers.length).to.be.at.least(1);

      const [records] = await new TransferService().getTransfers({ fromDate, tillDate });
      expect(records).to.be.lengthOf(actualTransfers.length);
      records.forEach((t) => {
        expect(t.createdAt).to.be.greaterThanOrEqual(fromDate);
        expect(t.createdAt).to.be.lessThan(tillDate);
      });
    });

    it('should return corresponding invoice if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.invoice != null)[0];
      expect(transfer).to.not.be.undefined;
      const [records] = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(records.length).to.equal(1);
      expect(records[0].invoice).to.not.be.null;
    });

    it('should return corresponding deposit if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.deposit != null)[0];
      expect(transfer).to.not.be.undefined;
      const [records] = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(records.length).to.equal(1);
      expect(records[0].deposit).to.not.be.null;
    });

    it('should return corresponding payoutRequest if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.payoutRequest != null)[0];
      expect(transfer).to.not.be.undefined;
      const [records] = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(records.length).to.equal(1);
      expect(records[0].payoutRequest).to.not.be.null;
    });

    it('should return corresponding sellerPayout if transfer has any', async () => {
      const sellerPayoutTransfer = ctx.sellerPayouts[0].transfer;
      expect(sellerPayoutTransfer).to.not.be.undefined;
      const [records] = await new TransferService()
        .getTransfers({ id: sellerPayoutTransfer.id });
      expect(records.length).to.equal(1);
      expect(records[0].sellerPayout).to.not.be.null;
      expect(records[0].sellerPayout.id).to.equal(ctx.sellerPayouts[0].id);
    });

    it('should return corresponding fine if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.fine != null)[0];
      expect(transfer).to.not.be.undefined;
      const [records] = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(records.length).to.equal(1);
      expect(records[0].fine).to.not.be.null;
    });

    describe('category filter', async () => {
      it('should return only invoice transfers for INVOICE category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.invoice', 'invoice')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.INVOICE });
        expect(count).to.equal(expected.length);
        const expectedIds = new Set(expected.map((t) => t.id));
        records.forEach((r) => expect(expectedIds.has(r.id)).to.be.true);
      });

      it('should return only deposit transfers for DEPOSIT category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.deposit', 'deposit')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.DEPOSIT });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => expect(r.deposit).to.not.be.null);
      });

      it('should return only payout request transfers for PAYOUT_REQUEST category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.payoutRequest', 'payoutRequest')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.PAYOUT_REQUEST });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => expect(r.payoutRequest).to.not.be.null);
      });

      it('should return only seller payout transfers for SELLER_PAYOUT category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.sellerPayout', 'sellerPayout')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.SELLER_PAYOUT });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => expect(r.sellerPayout).to.not.be.null);
      });

      it('should return only fine transfers for FINE category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.fine', 'fine')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.FINE });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => expect(r.fine).to.not.be.null);
      });

      it('should return only manual creation transfers for MANUAL_CREATION category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .leftJoin('transfer.deposit', 'deposit')
          .leftJoin('transfer.payoutRequest', 'payoutRequest')
          .leftJoin('transfer.sellerPayout', 'sellerPayout')
          .leftJoin('transfer.invoice', 'invoice')
          .leftJoin('transfer.creditInvoice', 'creditInvoice')
          .leftJoin('transfer.fine', 'fine')
          .leftJoin('transfer.waivedFines', 'waivedFines')
          .leftJoin('transfer.writeOff', 'writeOff')
          .leftJoin('transfer.inactiveAdministrativeCost', 'inactiveAdministrativeCost')
          .where('deposit.id IS NULL')
          .andWhere('payoutRequest.id IS NULL')
          .andWhere('sellerPayout.id IS NULL')
          .andWhere('invoice.id IS NULL')
          .andWhere('creditInvoice.id IS NULL')
          .andWhere('fine.id IS NULL')
          .andWhere('waivedFines.id IS NULL')
          .andWhere('writeOff.id IS NULL')
          .andWhere('inactiveAdministrativeCost.id IS NULL')
          .andWhere('transfer.fromId IS NULL')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.MANUAL_CREATION });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => {
          expect(r.invoice).to.be.null;
          expect(r.deposit).to.be.null;
          expect(r.from).to.be.null;
        });
      });

      it('should return only manual deletion transfers for MANUAL_DELETION category', async () => {
        const expected = await Transfer.createQueryBuilder('transfer')
          .leftJoin('transfer.deposit', 'deposit')
          .leftJoin('transfer.payoutRequest', 'payoutRequest')
          .leftJoin('transfer.sellerPayout', 'sellerPayout')
          .leftJoin('transfer.invoice', 'invoice')
          .leftJoin('transfer.creditInvoice', 'creditInvoice')
          .leftJoin('transfer.fine', 'fine')
          .leftJoin('transfer.waivedFines', 'waivedFines')
          .leftJoin('transfer.writeOff', 'writeOff')
          .leftJoin('transfer.inactiveAdministrativeCost', 'inactiveAdministrativeCost')
          .where('deposit.id IS NULL')
          .andWhere('payoutRequest.id IS NULL')
          .andWhere('sellerPayout.id IS NULL')
          .andWhere('invoice.id IS NULL')
          .andWhere('creditInvoice.id IS NULL')
          .andWhere('fine.id IS NULL')
          .andWhere('waivedFines.id IS NULL')
          .andWhere('writeOff.id IS NULL')
          .andWhere('inactiveAdministrativeCost.id IS NULL')
          .andWhere('transfer.toId IS NULL')
          .getMany();
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.MANUAL_DELETION });
        expect(count).to.equal(expected.length);
        expect(count).to.be.greaterThan(0);
        records.forEach((r) => {
          expect(r.invoice).to.be.null;
          expect(r.deposit).to.be.null;
          expect(r.to).to.be.null;
        });
      });

      it('should combine category filter with toId filter', async () => {
        const invoiceTransfers = await Transfer.createQueryBuilder('transfer')
          .innerJoin('transfer.invoice', 'invoice')
          .getMany();
        const toId = invoiceTransfers.find((t) => t.toId != null)?.toId;
        expect(toId).to.not.be.undefined;
        const expected = invoiceTransfers.filter((t) => t.toId === toId);
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.INVOICE, toId });
        expect(count).to.equal(expected.length);
        records.forEach((r) => {
          expect(r.invoice).to.not.be.null;
          expect(r.to?.id).to.equal(toId);
        });
      });

      it('should return empty list for category with no matching transfers', async () => {
        // Use INACTIVE_ADMINISTRATIVE_COST which seeder never creates
        const [records, count] = await new TransferService().getTransfers({ category: TransferCategory.INACTIVE_ADMINISTRATIVE_COST });
        expect(count).to.equal(0);
        expect(records).to.be.empty;
      });
    });

    it('should return corresponding waived fines if transfer has any', async () => {
      const user = ctx.users.find((u) => u.currentFines != null);
      const userFineGroup = user.currentFines;
      const amountInclVat = userFineGroup.fines.reduce((sum, f) => sum.add(f.amount), DineroTransformer.Instance.from(0));

      const t = await Transfer.save({
        toId: user.id,
        version: 1,
        description: '',
        amountInclVat,
        waivedFines: userFineGroup,
      } as Transfer);

      const [records] = await new TransferService()
        .getTransfers({ id: t.id });
      expect(records.length).to.equal(1);
      expect(records[0].waivedFines).to.not.be.null;

      // Cleanup
      await Transfer.delete(t.id);
    });
  });
  describe('postTransfer function', () => {
    it('should be able to post a new transfer', async () => {
      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'cool',
        fromId: ctx.users[0].id,
        toId: undefined,
      };
      const resPost = await new TransferService().postTransfer(req);
      expect(resPost).to.not.be.null;

      const [transfers] = await new TransferService().getTransfers();
      const records = transfers.map((t) => TransferService.asTransferResponse(t));
      const lastEntry = records.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));
      expect(lastEntry.amountInclVat.amount).to.equal(req.amount.amount);
      expect(lastEntry.amountInclVat.currency).to.equal(req.amount.currency);
      expect(lastEntry.amountInclVat.precision).to.equal(req.amount.precision);
      expect(lastEntry.description).to.equal(req.description);
      expect(lastEntry.from.id).to.equal(req.fromId);
      expect(lastEntry.to).to.be.undefined;
    });
    it('should reset user inactive notification send to false', async () => {
      const user = await User.findOne({ where: { inactiveNotificationSend: true } });

      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'cool',
        fromId: user.id,
        toId: undefined,
        vatId: ctx.vatGroups[0].id,
      };
      await new TransferService().postTransfer(req);

      const updatedUser = await User.findOne({ where: { id: user.id } });

      expect(updatedUser.inactiveNotificationSend).to.be.eq(false);
    });
  });
  describe('createTransfer function', () => {
    it('should be able to create a new transfer', async () => {
      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description: 'cool',
        fromId: ctx.users[0].id,
        toId: undefined,
        vatId: ctx.vatGroups[0].id,
      };
      const resPost = await new TransferService().createTransfer(req);
      expect(resPost).to.not.be.null;

      const [transfers] = await new TransferService().getTransfers();
      const records = transfers.map((t) => TransferService.asTransferResponse(t));
      const lastEntry = records.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));
      expect(lastEntry.amountInclVat.amount).to.equal(req.amount.amount);
      expect(lastEntry.amountInclVat.currency).to.equal(req.amount.currency);
      expect(lastEntry.amountInclVat.precision).to.equal(req.amount.precision);
      expect(lastEntry.description).to.equal(req.description);
      expect(lastEntry.from.id).to.equal(req.fromId);
      expect(lastEntry.to).to.be.undefined;
      expect(lastEntry.vat.id).to.equal(req.vatId);
    });
  });
  describe('deleteTransfer function', () => {
    it('should successfully delete a transfer with no relations', async () => {
      // Find a transfer that has no relations
      const transfer = ctx.transfers.find((t) => !t.invoice && !t.deposit && !t.payoutRequest && !t.sellerPayout && !t.fine && !t.writeOff && !t.waivedFines && !t.inactiveAdministrativeCost);
      expect(transfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      await new TransferService().deleteTransfer(transfer.id);

      expect(await Transfer.count()).to.equal(transferCount - 1);
      expect(await Transfer.findOne({ where: { id: transfer.id } })).to.be.null;
    });

    it('should throw error when trying to delete a transfer with invoice relation', async () => {
      const transfer = ctx.transfers.find((t) => t.invoice != null);
      expect(transfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      try {
        await new TransferService().deleteTransfer(transfer.id);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Cannot delete transfer because it is referenced by another entity');
      }

      expect(await Transfer.count()).to.equal(transferCount);
      expect(await Transfer.findOne({ where: { id: transfer.id } })).to.not.be.null;
    });

    it('should throw error when trying to delete a transfer with payoutRequest relation', async () => {
      const transfer = ctx.transfers.find((t) => t.payoutRequest != null);
      expect(transfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      try {
        await new TransferService().deleteTransfer(transfer.id);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Cannot delete transfer because it is referenced by another entity');
      }

      expect(await Transfer.count()).to.equal(transferCount);
      expect(await Transfer.findOne({ where: { id: transfer.id } })).to.not.be.null;
    });

    it('should throw error when trying to delete a transfer with sellerPayout relation', async () => {
      const sellerPayoutTransfer = ctx.sellerPayouts[0].transfer;
      expect(sellerPayoutTransfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      try {
        await new TransferService().deleteTransfer(sellerPayoutTransfer.id);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Cannot delete transfer because it is referenced by another entity');
      }

      expect(await Transfer.count()).to.equal(transferCount);
      expect(await Transfer.findOne({ where: { id: sellerPayoutTransfer.id } })).to.not.be.null;
    });

    it('should throw error when trying to delete a transfer with deposit relation', async () => {
      const transfer = ctx.transfers.find((t) => t.deposit != null);
      expect(transfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      try {
        await new TransferService().deleteTransfer(transfer.id);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Cannot delete transfer because it is referenced by another entity');
      }

      expect(await Transfer.count()).to.equal(transferCount);
      expect(await Transfer.findOne({ where: { id: transfer.id } })).to.not.be.null;
    });

    it('should throw error when trying to delete a transfer with fine relation', async () => {
      const transfer = ctx.transfers.find((t) => t.fine != null);
      expect(transfer).to.not.be.undefined;

      const transferCount = await Transfer.count();
      try {
        await new TransferService().deleteTransfer(transfer.id);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Cannot delete transfer because it is referenced by another entity');
      }

      expect(await Transfer.count()).to.equal(transferCount);
      expect(await Transfer.findOne({ where: { id: transfer.id } })).to.not.be.null;
    });

    it('should throw error when trying to delete a non-existent transfer', async () => {
      const maxId = ctx.transfers.reduce((max, t) => Math.max(max, t.id), 0);
      const nonExistentId = maxId + 100;

      try {
        await new TransferService().deleteTransfer(nonExistentId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Transfer not found');
      }
    });
  });

  describe('getTransferAggregate function', async () => {
    let creditInvoiceTransfer: Transfer;
    let originalInvoiceTransfer: Transfer;

    beforeAll(async () => {
      const user = ctx.users[0];

      originalInvoiceTransfer = await Transfer.save(Object.assign(new Transfer(), {
        to: user,
        amountInclVat: DineroTransformer.Instance.from(1000),
        description: 'Invoice transfer for aggregate test',
      }));

      creditInvoiceTransfer = await Transfer.save(Object.assign(new Transfer(), {
        from: user,
        amountInclVat: DineroTransformer.Instance.from(1000),
        description: 'Credit invoice transfer for aggregate test',
      }));

      const invoice = Object.assign(new Invoice(), {
        to: user,
        addressee: user.firstName,
        reference: 'SVC-AGG-CREDIT-001',
        city: 'Eindhoven',
        country: 'Netherlands',
        postalCode: '5612 AE',
        street: 'Test Street 1',
        description: 'Aggregate test credited invoice',
        transfer: originalInvoiceTransfer,
        creditTransfer: creditInvoiceTransfer,
        date: new Date(),
        subTransactionRows: [],
        invoiceStatus: [],
      });
      const savedInvoice = await Invoice.save(invoice);
      originalInvoiceTransfer.invoice = savedInvoice;
      await Transfer.save(originalInvoiceTransfer);
    });

    it('should return the total and count for all transfers', async () => {
      const allTransfers = await Transfer.find();
      const result = await new TransferService().getTransferAggregate();
      expect(result.count).to.equal(allTransfers.length);
      const expectedTotal = allTransfers.reduce((sum, t) => sum + t.amountInclVat.getAmount(), 0);
      expect(result.total.getAmount()).to.equal(expectedTotal);
    });

    it('should return all invoice transfers for the INVOICE category', async () => {
      const invoiceTransfers = await Transfer.createQueryBuilder('transfer')
        .innerJoin('transfer.invoice', 'invoice')
        .getMany();

      const result = await new TransferService().getTransferAggregate({ category: TransferCategory.INVOICE });
      expect(result.count).to.equal(invoiceTransfers.length);
      expect(result.total.getAmount()).to.equal(
        invoiceTransfers.reduce((sum, t) => sum + t.amountInclVat.getAmount(), 0),
      );
    });

    it('should return only credit invoice transfers for the CREDIT_INVOICE category', async () => {
      const creditTransfers = await Transfer.createQueryBuilder('transfer')
        .innerJoin('transfer.creditInvoice', 'creditInvoice')
        .getMany();

      const result = await new TransferService().getTransferAggregate({ category: TransferCategory.CREDIT_INVOICE });
      expect(result.count).to.equal(creditTransfers.length);
      expect(result.count).to.be.greaterThan(0);
      expect(result.total.getAmount()).to.equal(
        creditTransfers.reduce((sum, t) => sum + t.amountInclVat.getAmount(), 0),
      );
    });

    it('should not count the credited invoice original transfer under CREDIT_INVOICE', async () => {
      const creditInvoiceIds = (await Transfer.createQueryBuilder('transfer')
        .innerJoin('transfer.creditInvoice', 'creditInvoice')
        .select('transfer.id')
        .getMany()).map((t) => t.id);

      // The credit transfer itself should be listed; the original invoice transfer should not
      expect(creditInvoiceIds).to.include(creditInvoiceTransfer.id);
      expect(creditInvoiceIds).to.not.include(originalInvoiceTransfer.id);
    });

    it('should return all transfers with null fromId for the MANUAL_CREATION category', async () => {
      const manualCreations = await Transfer.createQueryBuilder('transfer')
        .leftJoin('transfer.deposit', 'deposit')
        .leftJoin('transfer.payoutRequest', 'payoutRequest')
        .leftJoin('transfer.sellerPayout', 'sellerPayout')
        .leftJoin('transfer.invoice', 'invoice')
        .leftJoin('transfer.creditInvoice', 'creditInvoice')
        .leftJoin('transfer.fine', 'fine')
        .leftJoin('transfer.waivedFines', 'waivedFines')
        .leftJoin('transfer.writeOff', 'writeOff')
        .leftJoin('transfer.inactiveAdministrativeCost', 'inactiveAdministrativeCost')
        .where('deposit.id IS NULL')
        .andWhere('payoutRequest.id IS NULL')
        .andWhere('sellerPayout.id IS NULL')
        .andWhere('invoice.id IS NULL')
        .andWhere('creditInvoice.id IS NULL')
        .andWhere('fine.id IS NULL')
        .andWhere('waivedFines.id IS NULL')
        .andWhere('writeOff.id IS NULL')
        .andWhere('inactiveAdministrativeCost.id IS NULL')
        .andWhere('transfer.fromId IS NULL')
        .getMany();

      const result = await new TransferService().getTransferAggregate({ category: TransferCategory.MANUAL_CREATION });
      expect(result.count).to.equal(manualCreations.length);
      expect(result.count).to.be.greaterThan(0);
      expect(result.total.getAmount()).to.equal(
        manualCreations.reduce((sum, t) => sum + t.amountInclVat.getAmount(), 0),
      );
    });

    it('should return all transfers with null toId for the MANUAL_DELETION category', async () => {
      const manualDeletions = await Transfer.createQueryBuilder('transfer')
        .leftJoin('transfer.deposit', 'deposit')
        .leftJoin('transfer.payoutRequest', 'payoutRequest')
        .leftJoin('transfer.sellerPayout', 'sellerPayout')
        .leftJoin('transfer.invoice', 'invoice')
        .leftJoin('transfer.creditInvoice', 'creditInvoice')
        .leftJoin('transfer.fine', 'fine')
        .leftJoin('transfer.waivedFines', 'waivedFines')
        .leftJoin('transfer.writeOff', 'writeOff')
        .leftJoin('transfer.inactiveAdministrativeCost', 'inactiveAdministrativeCost')
        .where('deposit.id IS NULL')
        .andWhere('payoutRequest.id IS NULL')
        .andWhere('sellerPayout.id IS NULL')
        .andWhere('invoice.id IS NULL')
        .andWhere('creditInvoice.id IS NULL')
        .andWhere('fine.id IS NULL')
        .andWhere('waivedFines.id IS NULL')
        .andWhere('writeOff.id IS NULL')
        .andWhere('inactiveAdministrativeCost.id IS NULL')
        .andWhere('transfer.toId IS NULL')
        .getMany();

      const result = await new TransferService().getTransferAggregate({ category: TransferCategory.MANUAL_DELETION });
      expect(result.count).to.equal(manualDeletions.length);
      expect(result.count).to.be.greaterThan(0);
      expect(result.total.getAmount()).to.equal(
        manualDeletions.reduce((sum, t) => sum + t.amountInclVat.getAmount(), 0),
      );
    });
  });

  describe('getTransferSummary function', async () => {
    it('should contain all expected category keys', async () => {
      const summary = await new TransferService().getTransferSummary();
      expect(summary).to.have.all.keys([
        'total', 'deposits', 'payoutRequests', 'sellerPayouts',
        'invoices', 'creditInvoices', 'fines', 'waivedFines',
        'writeOffs', 'inactiveAdministrativeCosts', 'manualCreations', 'manualDeletions',
      ]);
    });

    it('should match the unfiltered aggregate for the overall total', async () => {
      const [aggregate, summary] = await Promise.all([
        new TransferService().getTransferAggregate(),
        new TransferService().getTransferSummary(),
      ]);
      expect(summary.total.count).to.equal(aggregate.count);
      expect(summary.total.total.getAmount()).to.equal(aggregate.total.getAmount());
    });

    it('should match per-category aggregates for invoices and creditInvoices', async () => {
      const [invoiceAggregate, creditInvoiceAggregate, summary] = await Promise.all([
        new TransferService().getTransferAggregate({ category: TransferCategory.INVOICE }),
        new TransferService().getTransferAggregate({ category: TransferCategory.CREDIT_INVOICE }),
        new TransferService().getTransferSummary(),
      ]);
      expect(summary.invoices.count).to.equal(invoiceAggregate.count);
      expect(summary.invoices.total.getAmount()).to.equal(invoiceAggregate.total.getAmount());
      expect(summary.creditInvoices.count).to.equal(creditInvoiceAggregate.count);
      expect(summary.creditInvoices.total.getAmount()).to.equal(creditInvoiceAggregate.total.getAmount());
    });

    it('should apply filters across all categories', async () => {
      const user = ctx.users[0];
      const [aggregate, summary] = await Promise.all([
        new TransferService().getTransferAggregate({ fromId: user.id }),
        new TransferService().getTransferSummary({ fromId: user.id }),
      ]);
      expect(summary.total.count).to.equal(aggregate.count);
      expect(summary.total.total.getAmount()).to.equal(aggregate.total.getAmount());
    });
  });

  describe('invalidateBalanceCaches function', async () => {
    let clearStub: sinon.SinonStub;

    beforeEach(async () => {
      const BalanceModule = await import('../../../src/service/balance-service');
      const BalanceService = BalanceModule.default;
      // Stub the prototype method directly and make it return a resolved promise
      clearStub = sinon.stub(BalanceService.prototype, 'clearBalanceCache').resolves();
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should invalidate balance caches for both from and to users', async () => {
      const transfer = await Transfer.save({
        from: ctx.users[0],
        to: ctx.users[1],
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer for deletion',
        version: 1,
      } as Transfer);

      await TransferService.invalidateBalanceCaches(transfer as Transfer);

      expect(clearStub).to.have.been.calledOnce;
      const calledWith = clearStub.getCall(0).args[0];
      expect(calledWith).to.include(transfer.from.id);
      expect(calledWith).to.include(transfer.to.id);
    });

    it('should invalidate balance cache for only to user if from is null', async () => {
      const user = ctx.users[0];
      const transfer = new Transfer();
      transfer.from = null;
      transfer.to = user;

      await TransferService.invalidateBalanceCaches(transfer);

      expect(clearStub).to.have.been.calledOnce;
      const calledWith = clearStub.getCall(0).args[0];
      expect(calledWith).to.include(user.id);
    });

    it('should invalidate balance cache for only from user if to is null', async () => {
      const user = ctx.users[1];
      const transfer = new Transfer();
      transfer.from = user;
      transfer.to = null;

      await TransferService.invalidateBalanceCaches(transfer);

      expect(clearStub).to.have.been.calledOnce;
      const calledWith = clearStub.getCall(0).args[0];
      expect(calledWith).to.include(user.id);
    });

    it('should do nothing if both from and to are null', async () => {
      const transfer = new Transfer();
      transfer.from = null as any;
      transfer.to = null as any;

      await TransferService.invalidateBalanceCaches(transfer);

      expect(clearStub).to.not.have.been.called;
    });
  });
});
