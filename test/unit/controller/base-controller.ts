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
 *
 *  @license
 */

import express, { Application, Request } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { Connection } from 'typeorm';
import BaseController from '../../../src/controller/base-controller';
import Policy from '../../../src/controller/policy';
import { getSpecification } from '../entity/transformer/test-model';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import TokenHandler from '../../../src/authentication/token-handler';
import { UserFactory } from '../../helpers/user-factory';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

class TestController extends BaseController {
  // eslint-disable-next-line class-methods-use-this
  public getPolicy(): Policy {
    return {
      '/get/:id(\\d+)': {
        GET: {
          policy: async (req: Request) => Number(req.params.id) === 1,
          handler: (req, res) => res.json('test'),
        },
      },
      '/get/:id(\\d+)/list': {
        POST: {
          policy: async () => true,
          handler: (req, res) => res.json('list'),
        },
      },
      '/test': {
        GET: {
          policy: async () => true,
          handler: (req, res) => res.json('test-1'),
        },
        POST: {
          policy: async () => true,
          handler: (req, res) => res.json('test-2'),
        },
        PATCH: {
          policy: async () => true,
          handler: (req, res) => res.json('test-3'),
        },
        DELETE: {
          policy: async () => true,
          handler: (req, res) => res.json('test-4'),
        },
      },
      '/model': {
        POST: {
          body: { modelName: 'TestModel' },
          policy: async () => true,
          handler: (req, res) => res.json('test-model'),
        },
      },
      '/restrictions': {
        GET: {
          policy: async () => true,
          handler: (req, res) => res.json('restrictions'),
          restrictions: {
            lesser: true,
            acceptedTOS: false,
          },
        },
      },
    };
  }
}

describe('BaseController', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BaseController,
    userToken: string,
    userTokenRestricted: string,
  };

  before(async () => {
    // Initialize context
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    ctx = {
      connection,
      app: express(),
      specification: undefined,
      controller: undefined,
      userToken: '',
      userTokenRestricted: '',
    };
    ctx.specification = await getSpecification(ctx.app);
    ctx.controller = new TestController({
      specification: ctx.specification,
      roleManager: new RoleManager(),
    });

    const userAccepted = await (await UserFactory({
      firstName: 'TestUser1',
      lastName: 'TestUser1',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User)).get();
    const userNotAccepted = await (await UserFactory({
      firstName: 'TestUser1',
      lastName: 'TestUser1',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_ACCEPTED,
    } as User)).get();
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    ctx.app.use(json());
    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use(ctx.controller.getRouter());

    ctx.userToken = await tokenHandler.signToken({ user: userAccepted, roles: [], lesser: false }, '39');
    ctx.userTokenRestricted = await tokenHandler.signToken({ user: userNotAccepted, roles: [], lesser: true }, '39');
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#handle', () => {
    it('should give an HTTP 403 when policy implementation returns false', async () => {
      const res = await request(ctx.app)
        .get('/get/2')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 405 when requested method is not supported', async () => {
      const res = await request(ctx.app)
        .post('/get/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(405);
    });
    it('should not give an HTTP 405 when requested method for child route with method support', async () => {
      const res = await request(ctx.app)
        .post('/get/1/list')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.equal('list');
    });
    it('should give an HTTP 200 when policy implementation returns true and method is supported', async () => {
      const res = await request(ctx.app)
        .get('/get/1')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give content for appropriate method', async () => {
      const resGet = await request(ctx.app)
        .get('/test')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(resGet.status).to.equal(200);
      expect(resGet.body).to.equal('test-1');

      const resPost = await request(ctx.app)
        .post('/test')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(resPost.status).to.equal(200);
      expect(resPost.body).to.equal('test-2');

      const resPatch = await request(ctx.app)
        .patch('/test')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(resPatch.status).to.equal(200);
      expect(resPatch.body).to.equal('test-3');

      const resDelete = await request(ctx.app)
        .delete('/test')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(resDelete.status).to.equal(200);
      expect(resDelete.body).to.equal('test-4');
    });
    it('should give an HTTP 400 when body model incorrect', async () => {
      const res = await request(ctx.app)
        .post('/model')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({
          name: 'Test',
          value: '123',
        });
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 200 when body model correct', async () => {
      const res = await request(ctx.app)
        .post('/model')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({
          name: 'Test',
          value: 123,
        });
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 200 when endpoint has less restrictions', async () => {
      const res = await request(ctx.app)
        .get('/restrictions')
        .set('Authorization', `Bearer ${ctx.userTokenRestricted}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 when endpoint has default restriction', async () => {
      const res = await request(ctx.app)
        .get('/get/1')
        .set('Authorization', `Bearer ${ctx.userTokenRestricted}`);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 200 when token not restricted', async () => {
      const res = await request(ctx.app)
        .get('/restrictions')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
    });
  });
});
