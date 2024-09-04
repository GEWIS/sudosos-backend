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

import express, { Application, Response } from 'express';
import { expect, request } from 'chai';
import PolicyMiddleware from '../../../src/middleware/policy-middleware';
import sinon from 'sinon';

xdescribe('PolicyMiddleware', (): void => {
  let ctx: {
    app: Application,
    middleware: PolicyMiddleware,
    value: boolean,
    error: boolean,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      middleware: new PolicyMiddleware(async () => {
        if (ctx.error) throw new Error('I\'m dying');
        return ctx.value;
      }),
      value: false,
      error: false,
    };

    ctx.app.use(ctx.middleware.getMiddleware());
    ctx.app.use((req: any, res: Response) => {
      res.end('Success');
    });
  });

  afterEach(() => {
    ctx.value = false;
  });

  describe('#handle', () => {
    it('should give an HTTP 403 when policy implementation returns false', async () => {
      const res = await request(ctx.app)
        .get('/');

      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 200 when policy implementation returns true', async () => {
      ctx.value = true;
      const res = await request(ctx.app)
        .get('/');

      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 500 when policy implementation throws an error', async () => {
      // Hide the error message from the console
      const stub = sinon.stub(console, 'error');

      ctx.error = true;
      const res = await request(ctx.app)
        .get('/');

      expect(res.status).to.equal(500);

      // Cleanup
      stub.restore();
    });
  });
});
