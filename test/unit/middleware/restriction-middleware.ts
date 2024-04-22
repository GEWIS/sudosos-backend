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
import express, { Application, Response } from 'express';
import { Connection } from 'typeorm';
import { expect, request } from 'chai';
import RestrictionMiddleware from '../../../src/middleware/restriction-middleware';
import Database from '../../../src/database/database';
import { UserFactory } from '../../helpers/user-factory';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenHandler from '../../../src/authentication/token-handler';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import {truncateAllTables} from "../../setup";

describe('RestrictionMiddleware', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    middleware: RestrictionMiddleware,
    tokenHandler: TokenHandler,
    userNotAccepted: User,
    userNotRequired: User,
    userAccepted: User,
    lesser?: boolean,
    acceptTOS?: boolean,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const userNotAccepted = await (await UserFactory({
      firstName: 'TestUser1',
      lastName: 'TestUser1',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_ACCEPTED,
    } as User)).get();
    const userNotRequired = await (await UserFactory({
      firstName: 'TestUser2',
      lastName: 'TestUser2',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User)).get();
    const userAccepted = await (await UserFactory({
      firstName: 'TestUser1',
      lastName: 'TestUser1',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User)).get();

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    ctx = {
      connection,
      app: express(),
      middleware: new RestrictionMiddleware(() => ({})),
      tokenHandler,
      userNotAccepted,
      userNotRequired,
      userAccepted,
      lesser: undefined,
      acceptTOS: undefined,
    };

    ctx.middleware = new RestrictionMiddleware(() => ({
      lesser: ctx.lesser,
      acceptedTOS: ctx.acceptTOS,
    }));

    ctx.app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    ctx.app.use(ctx.middleware.getMiddleware());
    ctx.app.use((req: any, res: Response) => {
      res.end('Success');
    });
  });

  afterEach(() => {
    ctx.lesser = undefined;
    ctx.acceptTOS = undefined;
  });

  after(async () => {
    await Database.finish(ctx.connection);
  });

  describe('Non-lesser endpoints', async () => {
    it('should allow non-lesser tokens', async () => {
      ctx.lesser = false;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should reject lesser tokens', async () => {
      ctx.lesser = false;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: true }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(403);
    });
  });
  describe('Lesser endpoints', async () => {
    it('should allow non-lesser tokens', async () => {
      ctx.lesser = true;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: true }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should allow lesser tokens', async () => {
      ctx.lesser = true;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should be lesser by default (reject by default)', async () => {
      // Sanity check
      ctx.lesser = undefined;
      let token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      let res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);

      token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: true }, '39');
      res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
  });

  describe('Accepted TOS endpoints', async () => {
    it('should allow accepted TOS tokens', async () => {
      ctx.acceptTOS = true;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should allow not required TOS tokens', async () => {
      ctx.acceptTOS = true;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userNotRequired, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should reject not accepted TOS tokens', async () => {
      ctx.acceptTOS = true;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userNotAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(403);
    });
    it('should reject not accepted users by default', async () => {
      // sanity check
      ctx.acceptTOS = undefined;
      let token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      let res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);

      token = await ctx.tokenHandler.signToken({ user: ctx.userNotAccepted, roles: [], lesser: false }, '39');
      res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(403);
    });
  });
  describe('Not accepted TOS endpoints', async () => {
    it('should allow accepted TOS tokens', async () => {
      ctx.acceptTOS = false;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should allow not required TOS tokens', async () => {
      ctx.acceptTOS = false;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userNotRequired, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
    it('should allow not accepted TOS tokens', async () => {
      ctx.acceptTOS = false;
      const token = await ctx.tokenHandler.signToken({ user: ctx.userNotAccepted, roles: [], lesser: false }, '39');
      const res = await request(ctx.app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).to.equal(200);
    });
  });
});
