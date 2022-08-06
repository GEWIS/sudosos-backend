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
import { seedTransfers, seedUsers } from '../../seed';

describe('TransferService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    transfers: Transfer[],
  };
  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const transfers = await seedTransfers(users,
      new Date('1950-02-12T01:57:45.271Z'), new Date('2001-02-12T01:57:45.271Z'));

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      transfers,
    };
  });
  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });
  describe('getTransfers function', async (): Promise<void> => {
    it('should return all transfers', async () => {
      const res: PaginatedTransferResponse = await TransferService.getTransfers();
      expect(res.records.length).to.equal(ctx.transfers.length);
      const ids = new Set(ctx.transfers.map((obj) => obj.id));
      res.records.forEach((element) => ids.delete(element.id));
      expect(ids.size).to.equal(0);
    });

    it('should return a single transfer if id is specified', async () => {
      const res: PaginatedTransferResponse = await TransferService
        .getTransfers({ id: ctx.transfers[0].id });
      expect(res.records.length).to.equal(1);
      expect(res.records[0].id).to.equal(ctx.transfers[0].id);
    });
    it('should return nothing if a wrong id is specified', async () => {
      const res: PaginatedTransferResponse = await TransferService
        .getTransfers({ id: ctx.transfers.length + 1 });
      expect(res.records).to.be.empty;
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
      const resPost = await TransferService.postTransfer(req);
      expect(resPost).to.not.be.null;

      const res: PaginatedTransferResponse = await TransferService.getTransfers();
      const transfers = res.records;
      const lastEntry = transfers.reduce((prev, curr) => (prev.id < curr.id ? curr : prev));
      expect(lastEntry.amount.amount).to.equal(req.amount.amount);
      expect(lastEntry.amount.currency).to.equal(req.amount.currency);
      expect(lastEntry.amount.precision).to.equal(req.amount.precision);
      expect(lastEntry.description).to.equal(req.description);
      expect(lastEntry.from.id).to.equal(req.fromId);
      expect(lastEntry.to).to.be.undefined;
    });
  });
});
