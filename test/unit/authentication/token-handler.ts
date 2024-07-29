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

import * as util from 'util';
import { expect } from 'chai';
import * as jwt from 'jsonwebtoken';
import TokenHandler from '../../../src/authentication/token-handler';
import User from '../../../src/entity/user/user';
import { generateKeys } from '../../setup';

describe('TokenHandler', (): void => {
  let ctx: {
    expiry: number,
    handler: TokenHandler,
    user: User,
  };

  before(async () => {
    // Generate RSA keypair
    const { publicKey, privateKey } = await generateKeys();

    const expiry = 3600;
    // Initialize context
    ctx = {
      expiry,
      handler: new TokenHandler({
        algorithm: 'RS512',
        publicKey,
        privateKey,
        expiry,
      }),
      user: {
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as User,
    };
  });

  describe('#signToken', () => {
    it('should be able to sign valid payload', async () => {
      const token = await ctx.handler.signToken({
        user: ctx.user,
        roles: [],
        organs: [],
        lesser: false,
      }, '1');

      // Verify that the token is signed properly
      const { publicKey } = ctx.handler.getOptions();
      const promise = util.promisify(jwt.verify).bind(null, token, publicKey)();
      await expect(promise).to.eventually.be.fulfilled;
    });

    it('should set custom expiry', async () => {
      const expiry = ctx.expiry * 2;
      const token = await ctx.handler.signToken({
        user: ctx.user,
        roles: [],
        organs: [],
        lesser: false,
      }, '1', expiry);

      // Verify that the token has longer expiry
      const { publicKey } = ctx.handler.getOptions();
      const payload = await util.promisify(jwt.verify).bind(null, token, publicKey)();
      const actualExpiry = payload.exp - payload.iat;
      expect(actualExpiry).to.equal(expiry);
    });

    it('should fail to sign if payload does not contain user', async () => {
      const promise = ctx.handler.signToken({
        user: undefined,
        roles: [],
        organs: [],
        lesser: false,
      }, '1');
      await expect(promise).to.eventually.be.rejectedWith('Payload has no user.');
    });

    it('should fail to sign if payload user does not have an integer id', async () => {
      const promise = ctx.handler.signToken({
        user: {
          id: 'test' as any as number,
          createdAt: new Date(),
        } as User,
        roles: [],
        organs: [],
        lesser: false,
      }, '1');
      await expect(promise).to.eventually.be.rejectedWith('Payload user has invalid id.');
    });
  });

  describe('#verifyToken', () => {
    it('should be able to verify valid token', async () => {
      const token = await ctx.handler.signToken({
        user: ctx.user,
        roles: [],
        lesser: false,
        organs: [],
      }, '1');
      const promise = ctx.handler.verifyToken(token);
      await expect(promise).to.eventually.be.fulfilled;
    });

    it('should fail to verify if signature is from different key', async () => {
      const { publicKey, privateKey } = await generateKeys();
      const otherHandler = new TokenHandler({
        ...ctx.handler.getOptions(),
        publicKey,
        privateKey,
      });
      const token = await otherHandler.signToken({
        user: ctx.user,
        roles: [],
        lesser: false,
        organs: [],
      }, '1');
      const promise = ctx.handler.verifyToken(token);
      await expect(promise).to.eventually.be.rejectedWith(jwt.JsonWebTokenError);
    });

    it('should fail to verify if signature is from different algorithm', async () => {
      const token = util.promisify(jwt.sign).bind(null, 'nonce', {
        ...ctx.handler.getOptions(),
        algorithm: 'none',
      })();
      const promise = ctx.handler.verifyToken(token);
      await expect(promise).to.eventually.be.rejectedWith(jwt.JsonWebTokenError);
    });

    it('should fail to verify if token is expired', async () => {
      const token = await util.promisify(jwt.sign).bind(null, { user: ctx.user },
        ctx.handler.getOptions().privateKey, {
          algorithm: ctx.handler.getOptions().algorithm,
          expiresIn: -1000,
        })();
      const promise = ctx.handler.verifyToken(token);
      await expect(promise).to.eventually.be.rejectedWith(jwt.TokenExpiredError);
    });
  });

  describe('#refreshToken', () => {
    it('should be able to refresh valid token', async () => {
      // Should be able to refresh
      const token1 = await ctx.handler.signToken({
        user: ctx.user,
        roles: [],
        lesser: false,
        organs: [],
      }, '1');
      const promise1 = ctx.handler.refreshToken(token1, '2');
      await expect(promise1).to.eventually.be.fulfilled;

      // Should get different token
      const token2 = await promise1;
      expect(token2).to.not.equal(token1);

      // New token should be valid
      const promise2 = ctx.handler.verifyToken(token2);
      await expect(promise2).to.eventually.be.fulfilled;
    });

    it('should use same expiry time as current token', async () => {
      const expiry = ctx.expiry * 2;
      const token1 = await ctx.handler.signToken({
        user: ctx.user,
        roles: [],
        lesser: false,
        organs: [],
      }, '1', expiry);

      const promise1 = ctx.handler.refreshToken(token1, '2');
      await expect(promise1).to.eventually.be.fulfilled;

      const token2 = await promise1;
      const result2 = await ctx.handler.verifyToken(token2);
      expect(result2.exp - result2.iat).to.equal(expiry);
    });

    it('should fail to refresh if signature is from different key', async () => {
      const { publicKey, privateKey } = await generateKeys();
      const otherHandler = new TokenHandler({
        ...ctx.handler.getOptions(),
        publicKey,
        privateKey,
      });
      const token = await otherHandler.signToken({
        user: ctx.user,
        roles: [],
        lesser: false,
        organs: [],
      }, '1');
      const promise = ctx.handler.refreshToken(token, '2');
      await expect(promise).to.eventually.be.rejectedWith(jwt.JsonWebTokenError);
    });

    it('should fail to refresh if token is expired', async () => {
      const token = await util.promisify(jwt.sign).bind(null, { user: ctx.user },
        ctx.handler.getOptions().privateKey, {
          algorithm: ctx.handler.getOptions().algorithm,
          expiresIn: -1000,
        })();
      const promise = ctx.handler.refreshToken(token, '2');
      await expect(promise).to.eventually.be.rejectedWith(jwt.TokenExpiredError);
    });
  });
});
