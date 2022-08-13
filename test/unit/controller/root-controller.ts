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
import RootController from '../../../src/controller/root-controller';
import Database from '../../../src/database/database';
import { BannerResponse } from '../../../src/controller/response/banner-response';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import Banner from '../../../src/entity/banner';
import { seedBanners } from '../../seed';
import { bannerEq } from './banner-controller';
import { DefaultContext, defaultContext } from '../../helpers/test-helpers';
import User from '../../../src/entity/user/user';
import { ADMIN_USER, UserFactory } from '../../helpers/user-factory';

describe('RootController', async (): Promise<void> => {
  let ctx: DefaultContext & {
    controller: RootController,
    banners: Banner[]
  };

  before(async () => {
    ctx = {
      ...(await defaultContext()),
    } as any;
    const admin: User = await (await UserFactory(await ADMIN_USER())).get();
    const user: User = await (await UserFactory()).get();
    const { banners } = await seedBanners([user, admin]);

    const controller = new RootController({ specification: ctx.specification, roleManager: ctx.roleManager });
    ctx.app.use(json());
    ctx.app.use('', controller.getRouter());

    ctx = {
      ...ctx,
      controller,
      banners,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('GET /banners', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/banners');
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
        .get('/banners');

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
        .query({ take, skip });

      // number of banners returned is number of banners in database
      const banners = res.body.records as BannerResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(ctx.banners.length);
      expect(banners.length).to.be.at.most(take);
    });
  });

  describe('GET /ping', () => {
    it('should return an HTTP 200 if nothing is wrong', async () => {
      const res = await request(ctx.app)
        .get('/ping');

      expect(res.status).to.equal(200);
      expect(res.body).to.equal('Pong!');
    });
    it('should return an HTTP 500 if something is wrong', async () => {
      await ctx.connection.close();
      const res = await request(ctx.app)
        .get('/ping');

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');
      ctx.connection = await Database.initialize();
    });
  });
});
