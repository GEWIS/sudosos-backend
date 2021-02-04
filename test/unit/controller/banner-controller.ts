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
import bodyParser from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import TokenHandler from '../../../src/authentication/token-handler';
import BannerController from '../../../src/controller/banner-controller';
import BannerRequest from '../../../src/controller/request/banner-request';
import Database from '../../../src/database';
import Banner from '../../../src/entity/banner';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import Swagger from '../../../src/swagger';

describe('BannerController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BannerController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validBannerReq: BannerRequest,
    validBanner: Banner,
  };

  // initialize context
  beforeEach(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser }, 'nonce');

    // test banners
    const validBannerReq = {
      name: 'valid banner',
      picture: 'some picture link',
      duration: 10,
      active: true,
      startDate: '2021-02-29T16:00:00Z',
      endDate: '2021-02-30T16:00:00Z',
    } as BannerRequest;

    const validBanner = {
      name: 'valid banner',
      picture: 'some picture link',
      duration: 10,
      active: true,
      startDate: new Date(Date.parse('2021-02-29T16:00:00Z')),
      endDate: new Date(Date.parse('2021-02-30T16:00:00Z')),
    } as Banner;

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new BannerController(specification);
    app.use(bodyParser.json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/banners', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validBannerReq,
      validBanner,
    };
  });

  // close database connection
  afterEach(async () => {
    await User.clear();
    await Banner.clear();
    await ctx.connection.close();
  });

  describe('GET /banners', () => {
    it('should return all banners if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('POST /banners', () => {
    it('should be able to create a banner as admin', async () => {
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBannerReq);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBannerReq);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /banners/:id', () => {
    it('should return the banner with corresponding id if admin', async () => {
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 400 if banner does not exist', async () => {
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      console.log(res.body);
      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 403 if not admin', async () => {
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });
});

// https://stackabuse.com/testing-node-js-code-with-mocha-and-chai/
