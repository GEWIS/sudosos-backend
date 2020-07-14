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
import express, { Application, Request } from 'express';
import { expect, request } from 'chai';
import BaseController from '../../../src/controller/base-controller';
import Policy from '../../../src/controller/policy';

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
    };
  }
}

describe('BaseController', (): void => {
  let ctx: {
    app: Application,
    controller: BaseController,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      controller: new TestController(),
    };

    ctx.app.use(ctx.controller.getRouter());
  });

  describe('#handle', () => {
    it('should give an HTTP 401 when policy implementation returns false', async () => {
      const res = await request(ctx.app)
        .get('/get/2');
      expect(res.status).to.equal(401);
    });
    it('should give an HTTP 405 when requested method is not supported', async () => {
      const res = await request(ctx.app)
        .post('/get/1');
      expect(res.status).to.equal(405);
    });
    it('should not give an HTTP 405 when requested method for child route with method support', async () => {
      const res = await request(ctx.app)
        .post('/get/1/list');
      expect(res.status).to.equal(200);
      expect(res.body).to.equal('list');
    });
    it('should give an HTTP 200 when policy implementation returns true and method is supported', async () => {
      const res = await request(ctx.app)
        .get('/get/1');
      expect(res.status).to.equal(200);
    });
    it('should give content for appropriate method', async () => {
      const resGet = await request(ctx.app)
        .get('/test');
      expect(resGet.status).to.equal(200);
      expect(resGet.body).to.equal('test-1');

      const resPost = await request(ctx.app)
        .post('/test');
      expect(resPost.status).to.equal(200);
      expect(resPost.body).to.equal('test-2');

      const resPatch = await request(ctx.app)
        .patch('/test');
      expect(resPatch.status).to.equal(200);
      expect(resPatch.body).to.equal('test-3');

      const resDelete = await request(ctx.app)
        .delete('/test');
      expect(resDelete.status).to.equal(200);
      expect(resDelete.body).to.equal('test-4');
    });
  });
});
