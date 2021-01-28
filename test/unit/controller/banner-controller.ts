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
import Database from '../../../src/database';
import Banner from '../../../src/entity/banner';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import Swagger from '../../../src/swagger';

function verifyBanner(spec: SwaggerSpecification, banner: Banner) {
  // validate if banner properties are present and correct type
  const validation = spec.validateModel('Banner', banner, false, true);
  expect(validation).to.be.true;

  // validate values of banner properties
  expect(banner.name).to.not.be.empty;
  expect(banner.picture).to.not.be.empty;
  expect(banner.duration).to.be.greaterThan(-1);
  expect(banner.active).to.not.be.null;
  expect(banner.startDate).to.not.be.empty;
  expect(banner.endDate).to.not.be.empty;
  return validation;
}

describe('BannerController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BannerController,
    users: Array<User>,
    adminToken: String,
    token: String,
  };

  // initialize context
  beforeEach(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const users = [
      {
        id: 0,
        firstName: 'Admin',
        type: UserType.LOCAL_ADMIN,
        active: true,
      } as User,
      {
        id: 1,
        firstName: 'User',
        type: UserType.LOCAL_USER,
        active: true,
      } as User,
    ];

    // save users to database
    // users.map(async (user) => {
    //   await User.save(user);
    // });
    await User.save(users[0]);
    await User.save(users[1]);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'pub', privateKey: 'priv', expiry: 60,
    });
    const adminToken = await tokenHandler.signToken({ user: users[0] }, '1');
    const token = await tokenHandler.signToken({ user: users[1] }, '1');

    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new BannerController(specification);
    app.use(bodyParser.json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/banners', controller.getRouter());

    // instantiate context
    ctx = {
      connection,
      app,
      specification,
      controller,
      users,
      adminToken,
      token,
    };
  });

  // remove database entries
  afterEach(async () => {
    await ctx.connection.close();
  });

  // get banner test
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
});

// https://stackabuse.com/testing-node-js-code-with-mocha-and-chai/
