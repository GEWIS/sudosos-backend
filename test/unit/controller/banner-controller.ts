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

// verify whether the banner request translates to a valid banner object
function verifyBanner(spec: SwaggerSpecification, bannerRequest: BannerRequest): void {
  // validate specifications
  // const validation = spec.validateModel('BannerRequest', bannerRequest, false, true);
  // expect(validation).to.be.true;

  // check types
  expect(bannerRequest.name).to.be.a('string');
  expect(bannerRequest.picture).to.be.a('string');
  expect(bannerRequest.duration).to.be.a('number');
  expect(bannerRequest.active).to.be.a('boolean');
  expect(bannerRequest.startDate).to.be.a('string');
  expect(bannerRequest.endDate).to.be.a('string');

  expect(bannerRequest.name).to.not.be.empty;
  expect(bannerRequest.picture).to.not.be.empty;
  expect(bannerRequest.duration).to.be.above(0);
  expect(bannerRequest.active).to.not.be.null;

  const sDate = new Date(Date.parse(bannerRequest.startDate));
  const eDate = new Date(Date.parse(bannerRequest.endDate));
  expect(sDate).to.be.a('date');
  expect(eDate).to.be.a('date');
  expect(eDate).to.be.greaterThan(sDate);
}

function bannerEq(a: Banner, b: Banner): Boolean {
  const aEmpty = a === {} as Banner || a === undefined;
  const bEmpty = b === {} as Banner || b === undefined;
  if (aEmpty === bEmpty) {
    return true;
  }
  if (aEmpty ? !bEmpty : bEmpty) {
    return false;
  }

  let aStartDate = a.startDate;
  let bStartDate = b.startDate;
  let aEndDate = a.endDate;
  let bEndDate = b.endDate;

  if (typeof aStartDate === 'string') {
    aStartDate = new Date(Date.parse(aStartDate));
  }
  if (typeof bStartDate === 'string') {
    bStartDate = new Date(Date.parse(bStartDate));
  }
  if (typeof aEndDate === 'string') {
    aEndDate = new Date(Date.parse(aEndDate));
  }
  if (typeof bEndDate === 'string') {
    bEndDate = new Date(Date.parse(bEndDate));
  }

  return a.name === b.name
    && a.picture === b.picture
    && a.duration === b.duration
    && a.active === b.active
    && aStartDate.getTime() === bStartDate.getTime()
    && aEndDate.getTime() === bEndDate.getTime();
}

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
    invalidBannerReq: BannerRequest,
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
      ...validBannerReq,
      startDate: new Date(Date.parse(validBannerReq.startDate)),
      endDate: new Date(Date.parse(validBannerReq.endDate)),
    } as Banner;

    const invalidBannerReq = {
      ...validBannerReq,
      name: '',
    } as BannerRequest;

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
      invalidBannerReq,
    };
  });

  // close database connection
  afterEach(async () => {
    await User.clear();
    await Banner.clear();
    await ctx.connection.close();
  });

  describe('GET /banners', () => {
    it('should return an HTTP 200 and all banners in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const banners = res.body as Banner[];
      expect(banners.length).to.equal(await Banner.count());

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('POST /banners', () => {
    it('should store the given banner in the database and return an HTTP 200 and the banner if admin', async () => {
      // number of banners in the database
      const count = await Banner.count();
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBannerReq);

      // check if number of banners in the database increased
      expect(count + 1).to.equal(await Banner.count());

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(count + 1);
      expect(bannerEq(ctx.validBanner, databaseBanner)).to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the given banner is invalid', async () => {
      // number of banners in the database
      const count = await Banner.count();
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBannerReq);

      // check if number of banners in the database hasn't increased
      expect(count).to.equal(await Banner.count());

      // check no response body
      expect(res.body).to.be.empty;

      // invalid code
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // number of banners in the database
      const count = await Banner.count();
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBannerReq);

      // check if number of banners in the database hasn't increased
      expect(count).to.equal(await Banner.count());

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /banners/:id', () => {
    it('should return an HTTP 200 and the banner with given id if admin', async () => {
      // save banner with id 1
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const resBanner = res.body as Banner;
      const databaseBanner = await Banner.findOne(1);

      // check if returned banner is indeed the one in the database
      expect(bannerEq(resBanner, databaseBanner)).to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const databaseBanner = await Banner.findOne(1);

      // check if banner is not returned
      expect(res.body).to.be.empty;
      expect(databaseBanner).to.be.undefined;

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check if banner is not returned
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /banners/:id', () => {
    it('should update and return an HTTP 200 and the banner with given id if admin', async () => {
      // patching banner request
      const patchBannerReq = {
        ...ctx.validBannerReq,
        name: 'patch banner',
        picture: 'patch picture',
        duration: 5,
      } as BannerRequest;

      // patched banner in database
      const patchBanner = {
        ...patchBannerReq,
        startDate: new Date(Date.parse(patchBannerReq.startDate)),
        endDate: new Date(Date.parse(patchBannerReq.endDate)),
      } as Banner;

      // save valid banner with id 1
      await Banner.save(ctx.validBanner);

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(patchBannerReq);

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(1);
      expect(bannerEq(ctx.validBanner, databaseBanner)).to.be.false;
      expect(bannerEq(patchBanner, databaseBanner)).to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if given banner is invalid', async () => {
      // save valid banner with id 1
      await Banner.save(ctx.validBanner);

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBannerReq);

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(1);
      expect(bannerEq(ctx.validBanner, databaseBanner)).to.be.true;

      // check no response body
      expect(res.body).to.be.empty;

      // invalid code
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {

      // patching banner request
      const patchBannerReq = {
        ...ctx.validBannerReq,
        name: 'patch banner',
        picture: 'patch picture',
        duration: 5,
      } as BannerRequest;

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(patchBannerReq);

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(1);
      expect(databaseBanner).to.be.undefined;

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // patching banner request
      const patchBannerReq = {
        ...ctx.validBannerReq,
        name: 'patch banner',
        picture: 'patch picture',
        duration: 5,
      } as BannerRequest;

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(patchBannerReq);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /banners/:id', () => {
    it('should delete the banner from the database and return an HTTP 200 and the banner with given id if admin', async () => {
      // save valid banner with id 1
      await Banner.save(ctx.validBanner);

      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // test deletion
      expect(bannerEq(res.body as Banner, ctx.validBanner)).to.be.true;
      expect(await Banner.findOne(1)).to.be.undefined;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check no response body
      expect(res.body).to.be.empty;

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save valid banner with id 1
      await Banner.save(ctx.validBanner);

      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // check if banner with id 1 is not deleted
      expect(bannerEq(await Banner.findOne(1), ctx.validBanner)).to.be.true;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /banners/active', () => {
    it('should return an HTTP 200 and all active banners in the database if admin', async () => {
      // inactive banner
      const inactiveBanner = {
        ...ctx.validBanner,
        active: false,
      } as Banner;

      // save banners
      await Banner.save(ctx.validBanner);
      await Banner.save(inactiveBanner);

      // get active banners
      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // test if returned banners are active
      expect(res.body.length).to.equal(1);
      expect(bannerEq((res.body as Banner[])[0], ctx.validBanner)).to.be.true;

      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // inactive banner
      const inactiveBanner = {
        ...ctx.validBanner,
        active: false,
      } as Banner;

      // save banners
      await Banner.save(ctx.validBanner);
      await Banner.save(inactiveBanner);

      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });
});

// https://stackabuse.com/testing-node-js-code-with-mocha-and-chai/
