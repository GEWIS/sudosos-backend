import express, { Application } from 'express';
import { expect, request } from 'chai';
import TokenHandler from '../../../src/authentication/token-handler';
import User from '../../../src/entity/user';
import { generateKeys } from '../../setup';
import TokenMiddleware, { RequestWithToken } from '../../../src/middleware/token-middleware';
import JsonWebToken from '../../../src/authentication/json-web-token';

describe('TokenMiddleware', (): void => {
  let ctx: {
    handler: TokenHandler,
    user: User,
    app: Application,
    token: JsonWebToken,
    tokenString: string,
    middleware: TokenMiddleware,
    req: RequestWithToken,
  };

  before(async () => {
    // Generate RSA keypair
    const { publicKey, privateKey } = await generateKeys();

    // Initialize context
    ctx = {
      handler: new TokenHandler({
        algorithm: 'RS512',
        publicKey,
        privateKey,
        expiry: 10,
      }),
      user: {
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as User,
      app: express(),
      token: undefined,
      tokenString: undefined,
      middleware: undefined,
      req: undefined,
    };
    ctx.token = {
      user: ctx.user,
    };
    ctx.middleware = new TokenMiddleware({
      tokenHandler: ctx.handler,
      refreshFactor: 0.5,
    });
    ctx.tokenString = await ctx.handler.signToken(ctx.token, '1');

    ctx.app.use(ctx.middleware.getMiddleware());
    ctx.app.use((req: RequestWithToken) => {
      ctx.req = req;
    });
  });

  afterEach(() => {
    ctx.req = undefined;
  });

  describe('#handle', () => {
    it('should place the parsed token in the request object', async () => {
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${ctx.tokenString}`);

      expect(res.status).to.equal(200);
      expect(ctx.req).to.exist;
      expect(ctx.req.token).to.equal(ctx.token);
    });
    it('should give an HTTP 401 when no token is present', async () => {
      const res = await request(ctx.app)
        .get('/');

      expect(res.status).to.equal(401);
    });
    it('should give an HTTP 403 when token is invalid', async () => {
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${ctx.tokenString}`);

      expect(res.status).to.equal(403);
    });
    it('should not refresh token before refreshFactor expiry', async () => {
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${ctx.tokenString}`);

      expect(res.status).to.equal(200);
      expect(res.header.Authorization).to.not.exist;
    });
    it('should place new token in Set-Authorization response header', async () => {
      // eslint-disable-next-line dot-notation
      ctx.middleware['options']['refreshFactor'] = 0;

      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${ctx.tokenString}`);

      expect(res.status).to.equal(200);
      expect(res.header.Authorization).to.exist;

      // Verify the token in response header
      const func = ctx.handler.verifyToken.bind(ctx.handler, res.header.Authorization);
      expect(func).to.eventually.be.fulfilled;

      // eslint-disable-next-line dot-notation
      ctx.middleware['options']['refreshFactor'] = 0.5;
    });
  });
});
