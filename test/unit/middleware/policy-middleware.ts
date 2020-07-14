import express, { Application, Response } from 'express';
import { expect, request } from 'chai';
import PolicyMiddleware from '../../../src/middleware/policy-middleware';

describe('PolicyMiddleware', (): void => {
  let ctx: {
    app: Application,
    middleware: PolicyMiddleware,
    value: boolean,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      middleware: new PolicyMiddleware(async () => ctx.value),
      value: false,
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
  });
});
