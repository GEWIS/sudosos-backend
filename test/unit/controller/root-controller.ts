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
import { json } from 'body-parser';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect, request } from 'chai';
import RootController from '../../../src/controller/root-controller';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import Database from '../../../src/database/database';

describe('RootController', async (): Promise<void> => {
  let ctx: {
    app: Application,
    specification: SwaggerSpecification,
    controller: RootController,
  };

  before(async () => {
    const app = express();
    const specification = await Swagger.initialize(app);
    const roleManager = new RoleManager();

    const controller = new RootController({ specification, roleManager });
    app.use(json());
    app.use('', controller.getRouter());

    ctx = {
      app,
      specification,
      controller,
    };
  });

  describe('GET /ping', () => {
    it('should return an HTTP 200 if nothing is wrong', async () => {
      const connection = await Database.initialize();
      const res = await request(ctx.app)
        .get('/ping');

      expect(res.status).to.equal(200);
      expect(res.body).to.equal('Pong!');

      await connection.close();
    });
    it('should return an HTTP 500 if something is wrong', async () => {
      const res = await request(ctx.app)
        .get('/ping');

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');
    });
  });
});
