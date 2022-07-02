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
import log4js, { Logger } from 'log4js';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import { expect } from 'chai';
import Database from '../../../src/database/database';
import User from '../../../src/entity/user/user';
import Swagger from '../../../src/start/swagger';
import seedDatabase from '../../seed';
import { POSProductOrderingRequest } from '../../../src/controller/request/pos-product-ordering-request';
import POSProductOrderingService from '../../../src/service/pos-product-ordering-service';
import ProductOrdering from '../../../src/entity/point-of-sale/product-ordering';

describe('POSProductOrderingService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    validOrderReq: POSProductOrderingRequest,
    spec: SwaggerSpecification,
    logger: Logger,
  };

  // eslint-disable-next-line func-names
  before(async () => {
    const logger: Logger = log4js.getLogger('POSProductOrderingServiceTest');
    logger.level = 'ALL';
    const connection = await Database.initialize();
    const app = express();
    const database = await seedDatabase();
    const validOrderReq = {
      pointOfSaleId: 1,
      ordering: [
        2,
        5,
        1,
      ],
    } as POSProductOrderingRequest;
    ctx = {
      logger,
      connection,
      app,
      validOrderReq,
      spec: undefined,
      specification: undefined,
      ...database,
    };

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.spec = await Swagger.importSpecification();
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('Verify ordering', () => {
    it('should return true if the ordering is valid', async () => {
      expect(await POSProductOrderingService.verifyOrdering(ctx.validOrderReq)).to.be.true;
    });
    it('should return false if the ordering has duplicates', async () => {
      expect(await POSProductOrderingService.verifyOrdering({
        ...ctx.validOrderReq,
        ordering: [1, 2, 1, 5, 3],
      })).to.be.false;
    });
    it('should return false if the point of sale doesnt exist', async () => {
      expect(await POSProductOrderingService.verifyOrdering({
        ...ctx.validOrderReq,
        pointOfSaleId: 0,
      })).to.be.false;
    });
    it('should return false if the ordering contains ids which are not present on the point of sale', async () => {
      expect(await POSProductOrderingService.verifyOrdering({
        ...ctx.validOrderReq,
        ordering: [3],
      })).to.be.false;
    });
  });

  describe('Create an ordering', () => {
    it('should return an ordering response corresponding to the saved ordering', async () => {
      const savedOrdering = await POSProductOrderingService
        .createPOSProductOrdering(ctx.validOrderReq);
      const correctResponse = await POSProductOrderingService.getPOSProductOrdering(1);
      expect(savedOrdering, 'ordering not saved correctly').to.eql(correctResponse);
    });
  });

  describe('Get an ordering', () => {
    it('should return an ordering response corresponding to the requested ordering', async () => {
      const savedOrdering = await POSProductOrderingService
        .createPOSProductOrdering(ctx.validOrderReq);
      const correctResponse = await POSProductOrderingService.getPOSProductOrdering(1);
      expect(savedOrdering, 'correct ordering not found').to.eql(correctResponse);
    });
  });

  describe('Delete an ordering', () => {
    it('should return an ordering response corresponding to the deleted ordering', async () => {
      const savedOrdering = await POSProductOrderingService
        .createPOSProductOrdering(ctx.validOrderReq);
      const deletedOrdering = await POSProductOrderingService
        .deletePOSProductOrdering(1);
      expect(deletedOrdering, 'return value incorrect').to.eql(savedOrdering);

      // check deletion of ordering
      expect(await ProductOrdering.findOne(1), 'ordering not deleted').to.be.undefined;
    });
  });

  describe('Update an ordering', () => {
    it('should return an ordering response corresponding to the patched ordering', async () => {
      const savedOrdering = await POSProductOrderingService
        .createPOSProductOrdering(ctx.validOrderReq);

      // update created transaction
      const updateOrdering = {
        ...ctx.validOrderReq,
        ordering: [1, 2, 3, 4, 5, 6],
      } as POSProductOrderingRequest;
      const updatedOrdering = await POSProductOrderingService
        .createPOSProductOrdering(updateOrdering);

      expect(savedOrdering, 'ordering not updated').to.not.eql(await POSProductOrderingService.getPOSProductOrdering(1));
      expect(updatedOrdering, 'ordering not updated').to.eql(await POSProductOrderingService.getPOSProductOrdering(1));
    });
  });
});
