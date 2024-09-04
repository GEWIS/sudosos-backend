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
import dinero from 'dinero.js';
import bodyParser from 'body-parser';
import { expect } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import TransferRequest from '../../../src/controller/request/transfer-request';
import { PaginatedTransferResponse } from '../../../src/controller/response/transfer-response';
import Database from '../../../src/database/database';
import Transfer from '../../../src/entity/transactions/transfer';
import User from '../../../src/entity/user/user';
import TransferService from '../../../src/service/transfer-service';
import Swagger from '../../../src/start/swagger';
import {
  seedContainers, seedFines,
  seedInvoices, seedPayoutRequests, seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedStripeDeposits,
  seedTransactions,
  seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import VatGroup from '../../../src/entity/vat-group';

xdescribe('TransferService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    transfers: Transfer[],
    vatGroups: VatGroup[],
  };
  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const begin = new Date('1950-02-12T01:57:45.271Z');
    const end = new Date('2001-02-12T01:57:45.271Z');

    const users = await seedUsers();
    const vatGroups = await seedVatGroups();
    const categories = await seedProductCategories();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const transfers = await seedTransfers(users, begin, end);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, begin, end);
    const { invoiceTransfers } = await seedInvoices(users, transactions);
    const { payoutRequestTransfers } = await seedPayoutRequests(users);
    const { stripeDepositTransfers } = await seedStripeDeposits(users);

    const transfers2 = transfers.concat(invoiceTransfers).concat(payoutRequestTransfers).concat(stripeDepositTransfers);

    const { users: users2, fineTransfers } = await seedFines(users, transactions, transfers, true);

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
      vatGroups,
      transfers: transfers2.concat(fineTransfers),
    };
  });
  after(async () => {
    await finishTestDB(ctx.connection);
  });
  describe('getTransfers function', async (): Promise<void> => {
    it('should return all transfers', async () => {
      const res: PaginatedTransferResponse = await new TransferService().getTransfers();
      expect(res.records.length).to.equal(ctx.transfers.length);
      const ids = new Set(ctx.transfers.map((obj) => obj.id));
      res.records.forEach((element) => ids.delete(element.id));
      expect(ids.size).to.equal(0);
    });

    it('should return all transfers involving a single user', async () => {
      const user = ctx.users[0];
      const res: PaginatedTransferResponse = await new TransferService().getTransfers({}, {}, user);
      const actualTransfers = ctx.transfers
        .filter((t) => (t.from && t.from.id === user.id) || (t.to && t.to.id === user.id));
      expect(res.records.length).to.equal(actualTransfers.length);
      res.records.forEach((t) => expect(
        (t.from && t.from.id === user.id) || (t.to && t.to.id === user.id),
      ).to.be.true);
    });

    it('should return a single transfer if id is specified', async () => {
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: ctx.transfers[0].id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].id).to.equal(ctx.transfers[0].id);
    });

    it('should return nothing if a wrong id is specified', async () => {
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: ctx.transfers.length + 1 });
      expect(res.records).to.be.empty;
    });

    it('should return all transfer after a given date', async () => {
      const transfer = ctx.transfers[2];
      const fromDate = transfer.createdAt;

      const actualTransfers = ctx.transfers.filter((t) => t.createdAt.getTime() >= fromDate.getTime());
      // Sanity check
      expect(actualTransfers.length).to.be.at.most(ctx.transfers.length - 2);
      expect(actualTransfers.length).to.be.at.least(1);

      const res = await new TransferService().getTransfers({ fromDate });
      expect(res.records).to.be.lengthOf(actualTransfers.length);
      res.records.forEach((t) => {
        expect(new Date(t.createdAt)).to.be.greaterThanOrEqual(fromDate);
      });
    });

    it('should return all transfer before a given date', async () => {
      const transfer = ctx.transfers[2];
      const tillDate = transfer.createdAt;

      const actualTransfers = ctx.transfers.filter((t) => t.createdAt.getTime() < tillDate.getTime());
      // Sanity check
      expect(actualTransfers.length).to.be.at.most(ctx.transfers.length - 2);
      expect(actualTransfers.length).to.be.at.least(1);

      const res = await new TransferService().getTransfers({ tillDate });
      expect(res.records).to.be.lengthOf(actualTransfers.length);
      res.records.forEach((t) => {
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
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

      const res = await new TransferService().getTransfers({ fromDate, tillDate });
      expect(res.records).to.be.lengthOf(actualTransfers.length);
      res.records.forEach((t) => {
        expect(new Date(t.createdAt)).to.be.greaterThanOrEqual(fromDate);
        expect(new Date(t.createdAt)).to.be.lessThan(tillDate);
      });
    });

    it('should return corresponding invoice if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.invoice != null)[0];
      expect(transfer).to.not.be.undefined;
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].invoice).to.not.be.null;
    });

    it('should return corresponding deposit if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.deposit != null)[0];
      expect(transfer).to.not.be.undefined;
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].deposit).to.not.be.null;
    });

    it('should return corresponding payoutRequest if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.payoutRequest != null)[0];
      expect(transfer).to.not.be.undefined;
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].payoutRequest).to.not.be.null;
    });

    it('should return corresponding fine if transfer has any', async () => {
      const transfer = ctx.transfers.filter((t) => t.fine != null)[0];
      expect(transfer).to.not.be.undefined;
      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: transfer.id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].fine).to.not.be.null;
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

      const res: PaginatedTransferResponse = await new TransferService()
        .getTransfers({ id: t.id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].waivedFines).to.not.be.null;

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

      const res: PaginatedTransferResponse = await new TransferService().getTransfers();
      const transfers = res.records;
      const lastEntry = transfers.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));
      expect(lastEntry.amountInclVat.amount).to.equal(req.amount.amount);
      expect(lastEntry.amountInclVat.currency).to.equal(req.amount.currency);
      expect(lastEntry.amountInclVat.precision).to.equal(req.amount.precision);
      expect(lastEntry.description).to.equal(req.description);
      expect(lastEntry.from.id).to.equal(req.fromId);
      expect(lastEntry.to).to.be.undefined;
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

      const res: PaginatedTransferResponse = await new TransferService().getTransfers();
      const transfers = res.records;
      const lastEntry = transfers.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));
      expect(lastEntry.amountInclVat.amount).to.equal(req.amount.amount);
      expect(lastEntry.amountInclVat.currency).to.equal(req.amount.currency);
      expect(lastEntry.amountInclVat.precision).to.equal(req.amount.precision);
      expect(lastEntry.description).to.equal(req.description);
      expect(lastEntry.from.id).to.equal(req.fromId);
      expect(lastEntry.to).to.be.undefined;
      expect(lastEntry.vat.id).to.equal(req.vatId);
    });
  });
});
