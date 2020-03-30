import { generateKeyPair } from 'crypto';
import * as util from 'util';
import { expect } from 'chai';
import * as jwt from 'jsonwebtoken';
import TokenHandler from '../../../src/authentication/token-handler';
import User from '../../../src/entity/user';

describe('TokenHandler', (): void => {
  /**
   * Generates a basic RSA keypair.
   */
  async function generateKeys(): Promise<{ publicKey: string, privateKey: string }> {
    return util.promisify(generateKeyPair).bind(null, 'rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    })();
  }

  let ctx: {
    handler: TokenHandler,
    user: User
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
        expiry: 3600,
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
      }, '1');

      // Verify that the token is signed properly
      const { publicKey } = ctx.handler.getOptions();
      const promise = util.promisify(jwt.verify).bind(null, token, publicKey)();
      await expect(promise).to.eventually.be.fulfilled;
    });

    it('should fail to sign if payload does not contain user', async () => {
      const promise = ctx.handler.signToken({
        user: undefined,
      }, '1');
      await expect(promise).to.eventually.be.rejectedWith('Payload has no user.');
    });

    it('should fail to sign if payload user does not have an integer id', async () => {
      const promise = ctx.handler.signToken({
        user: {
          id: 'test' as any as number,
          createdAt: new Date(),
        } as User,
      }, '1');
      await expect(promise).to.eventually.be.rejectedWith('Payload user has invalid id.');
    });
  });

  describe('#verifyToken', () => {
    it('should be able to verify valid token', async () => {
      const token = await ctx.handler.signToken({
        user: ctx.user,
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
      }, '1');
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

    it('should fail to refresh if signature is from different key', async () => {
      const { publicKey, privateKey } = await generateKeys();
      const otherHandler = new TokenHandler({
        ...ctx.handler.getOptions(),
        publicKey,
        privateKey,
      });
      const token = await otherHandler.signToken({
        user: ctx.user,
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
