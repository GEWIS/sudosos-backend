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
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import Database from '../../../src/database/database';
import Transfer, { TransferType } from '../../../src/entity/transactions/transfer';
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
    const transfers = await seedTransfers(users);

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
    await ctx.connection.close();
  });
  describe('getTransfers function', async (): Promise<void> => {
    it('should return all transfers', async () => {
      const res: TransferResponse[] = await TransferService.getTransfers();
      expect(res.length).to.equal(ctx.transfers.length);
    });

    it('should return a single transfer if id is specified', async () => {
      const res: TransferResponse[] = await TransferService
        .getTransfers({ id: ctx.transfers[0].id });
      expect(res.length).to.equal(1);
      expect(res[0].id).to.equal(ctx.transfers[0].id);
    });
    it('should return nothing if a wrong id is specified', async () => {
      const res: TransferResponse[] = await TransferService
        .getTransfers({ id: ctx.transfers.length + 1 });
      expect(res).to.be.empty;
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
        type: TransferType.CUSTOM,
        description: 'cool',
        fromId: ctx.users[0].id,
        toId: null,
      };
      const res = await TransferService.postTransfer(req);
      expect(res).to.not.be.null;
    });

    it('should not be able to post an invalid transfer', async () => {
      const req: TransferRequest = {
        amount: {
          amount: 10,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        type: null, // invalid type
        description: 'cool',
        fromId: ctx.users[0].id,
        toId: null,
      };
      const promise = TransferService.postTransfer(req);
      await expect(promise).to.eventually.be.rejected;
    });
  });
});
