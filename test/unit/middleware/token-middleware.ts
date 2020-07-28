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
import * as util from 'util';
import jwt from 'jsonwebtoken';
import express, { Application, Response } from 'express';
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
    ctx.app.use((req: RequestWithToken, res: Response) => {
      ctx.req = req;
      res.end('Success');
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
      expect(ctx.req.token).to.exist;

      const parsedUser = JSON.parse(JSON.stringify(ctx.token.user));
      expect(ctx.req.token.user).to.deep.equal(parsedUser);
    });
    it('should give an HTTP 401 when no token is present', async () => {
      const res = await request(ctx.app)
        .get('/');

      expect(res.status).to.equal(401);
    });
    it('should give an HTTP 403 when token is invalid', async () => {
      const tokenString = await await util.promisify(jwt.sign).bind(null, { user: ctx.user },
        ctx.handler.getOptions().privateKey, {
          algorithm: ctx.handler.getOptions().algorithm,
          expiresIn: -1000,
        })();
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${tokenString}`);

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
      expect(res.header['set-authorization']).to.exist;

      // Verify the token in response header
      const promise = ctx.handler.verifyToken.bind(ctx.handler, res.header['set-authorization'])();
      expect(promise).to.eventually.be.fulfilled;

      // eslint-disable-next-line dot-notation
      ctx.middleware['options']['refreshFactor'] = 0.5;
    });
  });
});
