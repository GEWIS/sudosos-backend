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
import { json } from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import sinon from 'sinon';
import TokenHandler from '../../../src/authentication/token-handler';
import BannerController from '../../../src/controller/banner-controller';
import BannerRequest from '../../../src/controller/request/banner-request';
import { BannerResponse } from '../../../src/controller/response/banner-response';
import Database from '../../../src/database/database';
import Banner from '../../../src/entity/banner';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { seedBanners } from '../../seed';
import BannerImage from '../../../src/entity/file/banner-image';
import { DiskStorage } from '../../../src/files/storage';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';

function bannerEq(a: Banner, b: BannerResponse): Boolean {
  const aEmpty = a === {} as Banner || a === undefined;
  const bEmpty = b === {} as BannerResponse || b === undefined;
  if (aEmpty !== bEmpty) {
    return false;
  }
  if (aEmpty ? !bEmpty : bEmpty) {
    return false;
  }

  const downloadName = a.image ? (a.image.downloadName ?? null) : null;

  return a.name === b.name
    && downloadName === b.image
    && a.duration === b.duration
    && a.active === b.active
    && a.startDate.getTime() === new Date(b.startDate).getTime()
    && a.endDate.getTime() === new Date(b.endDate).getTime();
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
    banners: Banner[],
    validBannerReq: BannerRequest,
    validBanner: Banner,
    invalidBannerReq: BannerRequest,
  };

  const stubs: sinon.SinonStub[] = [];

  // initialize context
  before(async () => {
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

    const { banners } = await seedBanners([adminUser, localUser]);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: [], lesser: false }, 'nonce');

    // test banners
    const validBannerReq = {
      name: 'valid banner',
      duration: 10,
      active: true,
      startDate: '3000-02-29T16:00:00Z',
      endDate: '3000-02-30T16:00:00Z',
    } as BannerRequest;

    const validBanner = {
      ...validBannerReq,
      startDate: new Date(validBannerReq.startDate),
      endDate: new Date(validBannerReq.endDate),
    } as Banner;

    const invalidBannerReq = {
      ...validBannerReq,
      name: '',
    } as BannerRequest;

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Banner: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new BannerController({ specification, roleManager });
    app.use(json());
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
      banners,
      validBannerReq,
      validBanner,
      invalidBannerReq,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('GET /banners', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedBannerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all banners in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const banners = res.body.records as BannerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(banners.length).to.equal(await Banner.count());
      banners.forEach((bannerResponse) => {
        expect(
          bannerEq(ctx.banners.find((b) => b.id === bannerResponse.id), bannerResponse),
          `bannerResponse ${bannerResponse.id} to be correct`,
        ).to.be.true;
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.banners.length);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/banners')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const banners = res.body.records as BannerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(ctx.banners.length);
      expect(banners.length).to.be.at.most(take);
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

  describe('GET /banners/active', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedBannerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all active banners in the database if admin', async () => {
      // get active banners
      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const activeBanners = ctx.banners.filter((b) => b.active);

      expect(res.status).to.equal(200);

      const bannerResponses = res.body.records as BannerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;
      // test if returned banners are active
      expect(bannerResponses.length).to.equal(activeBanners.length);
      bannerResponses.forEach((bannerResponse) => {
        expect(
          bannerEq(activeBanners.find((b) => b.id === bannerResponse.id), bannerResponse),
        ).to.be.true;
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(activeBanners.length);
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/banners/active')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const activeBanners = ctx.banners.filter((b) => b.active);

      // number of banners returned is number of banners in database
      const banners = res.body.records as BannerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(activeBanners.length);
      expect(banners.length).to.be.at.most(take);
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
      expect(bannerEq(databaseBanner, res.body as BannerResponse)).to.be.true;

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
      expect(res.body).to.equal('Invalid banner.');

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
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/banners/2')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'BannerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and the banner with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners/2')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // success code
      expect(res.status).to.equal(200);

      // check if returned banner is indeed the one in the database
      expect(bannerEq(ctx.banners.find((b) => b.id === 2), res.body as BannerResponse)).to.be.true;
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get('/banners/9999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const databaseBanner = await Banner.findOne(9999999);

      // not found code
      expect(res.status).to.equal(404);
      // check if banner is not returned
      expect(res.body).to.equal('Banner not found.');
      expect(databaseBanner).to.be.undefined;
    });
    it('should return an HTTP 403 if not admin', async () => {
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
        duration: 5,
      } as BannerRequest;

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(patchBannerReq);

      expect(ctx.specification.validateModel(
        'BannerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(1);
      expect(bannerEq(databaseBanner, res.body as BannerResponse)).to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if given banner is invalid', async () => {
      // patch the banner
      let res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const oldBanner = res.body as BannerResponse;

      res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBannerReq);

      // invalid code
      expect(res.status).to.equal(400);
      // check if banner is unaltered
      const databaseBanner = await Banner.findOne(1, { relations: ['image'] });
      expect(bannerEq(databaseBanner, oldBanner)).to.be.true;
      expect(res.body).to.equal('Invalid banner.');

      // check response body
      expect(res.body).to.equal('Invalid banner.');

      // invalid code
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      // patching banner request
      const patchBannerReq = {
        ...ctx.validBannerReq,
        name: 'patch banner',
        duration: 5,
      } as BannerRequest;

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(patchBannerReq);

      // check if posted banner is not in the database
      const databaseBanner = await Banner.findOne(999999);
      expect(databaseBanner).to.be.undefined;

      // not found code
      expect(res.status).to.equal(404);
      // check response body
      expect(res.body).to.equal('Banner not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      // patching banner request
      const patchBannerReq = {
        ...ctx.validBannerReq,
        name: 'patch banner',
        duration: 5,
      } as BannerRequest;

      // patch the banner
      const res = await request(ctx.app)
        .patch('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(patchBannerReq);

      // forbidden code
      expect(res.status).to.equal(403);
      // check no response body
      expect(res.body).to.be.empty;
    });
  });

  describe('DELETE /banners/:id', () => {
    it('should delete the banner from the database and return an HTTP 200 and the banner with given id if admin', async () => {
      const previousBannerImage = await BannerImage.findOne(3);
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(true);
      stubs.push(deleteFileStub);

      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/3')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(ctx.specification.validateModel(
        'BannerResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      // success code
      expect(res.status).to.equal(200);

      const banner = res.body as BannerResponse;
      // test deletion
      expect(bannerEq(ctx.banners.find((b) => b.id === 3), banner)).to.be.true;
      expect(await Banner.findOne(3)).to.be.undefined;

      // Removed image
      expect(previousBannerImage).to.not.be.undefined;
      expect(await BannerImage.findOne(3)).to.be.undefined;
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/999999')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check response body
      expect(res.body).to.equal('Banner not found.');

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // delete the banner
      const res = await request(ctx.app)
        .delete('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      // forbidden code
      expect(res.status).to.equal(403);

      // check no response body
      expect(res.body).to.be.empty;

      // check if banner with id 1 is not deleted
      expect(await Banner.findOne(1)).to.not.be.undefined;
    });
  });
});
