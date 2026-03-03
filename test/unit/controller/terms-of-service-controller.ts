/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

import { json } from 'body-parser';
import { expect, request } from 'chai';
import sinon from 'sinon';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import TermsOfServiceController from '../../../src/controller/terms-of-service-controller';
import TermsOfServiceService from '../../../src/service/terms-of-service-service';
import { TermsOfServiceResponse } from '../../../src/controller/response/terms-of-service-response';
import { DefaultContext, defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { ADMIN_USER, UserFactory } from '../../helpers/user-factory';
import { RbacSeeder } from '../../seed';

describe('TermsOfServiceController', () => {
  let ctx: DefaultContext & {
    controller: TermsOfServiceController;
    adminToken: string;
    userToken: string;
  };

  const stubs: sinon.SinonStub[] = [];

  before(async () => {
    const c = { ...await defaultContext() };
    await truncateAllTables(c.connection);

    const admin = await (await UserFactory(await ADMIN_USER())).get();
    const regularUser = await (await UserFactory()).get();

    const all = { all: new Set<string>(['*']) };
    const adminRole = await new RbacSeeder().seed([{
      name: 'Admin',
      permissions: {
        TermsOfService: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    const userRole = await new RbacSeeder().seed([{
      name: 'User',
      permissions: {
        TermsOfService: {
          get: { own: new Set<string>(['*']) },
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.MEMBER,
    }]);

    const adminToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(admin, adminRole), 'nonce admin');
    const userToken = await c.tokenHandler.signToken(await new RbacSeeder().getToken(regularUser, userRole), 'nonce user');

    const tokenMiddleware = new TokenMiddleware({ tokenHandler: c.tokenHandler, refreshFactor: 0.5 }).getMiddleware();
    c.app.use(json());
    c.app.use(tokenMiddleware);
    const controller = new TermsOfServiceController({ specification: c.specification, roleManager: c.roleManager });
    c.app.use('/terms-of-service', controller.getRouter());

    ctx = { ...c, controller, adminToken, userToken };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('GET /terms-of-service', () => {
    it('should return correct model', async () => {
      const tosResponse: TermsOfServiceResponse = { versionNumber: '1.0', content: '# TOS v1.0' };
      const stub = sinon.stub(TermsOfServiceService, 'getTermsOfService').resolves(tosResponse);
      stubs.push(stub);

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'TermsOfServiceResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });

    it('should return 200 with the correct TOS content when a valid version is requested', async () => {
      const tosResponse: TermsOfServiceResponse = { versionNumber: '1.0', content: '# Terms of Service v1.0' };
      const stub = sinon.stub(TermsOfServiceService, 'getTermsOfService').resolves(tosResponse);
      stubs.push(stub);

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      const body = res.body as TermsOfServiceResponse;
      expect(body.versionNumber).to.equal('1.0');
      expect(body.content).to.equal('# Terms of Service v1.0');
      expect(stub.calledOnceWith('1.0')).to.be.true;
    });

    it('should return 400 when no version query parameter is provided', async () => {
      const res = await request(ctx.app)
        .get('/terms-of-service')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error').that.includes('version');
    });

    it('should return 404 when the requested version does not exist', async () => {
      const stub = sinon.stub(TermsOfServiceService, 'getTermsOfService')
        .rejects(new Error("Terms of service version v'99.9' not found"));
      stubs.push(stub);

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '99.9' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error');
    });

    it('should return 403 when a user without permissions requests a TOS version', async () => {
      const noPermRole = await new RbacSeeder().seed([{
        name: 'NoPermUser',
        permissions: {},
        assignmentCheck: async () => false,
      }]);
      const noPermUser = await (await UserFactory()).get();
      const noPermToken = await ctx.tokenHandler.signToken(
        await new RbacSeeder().getToken(noPermUser, noPermRole),
        'nonce noperm',
      );

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' })
        .set('Authorization', `Bearer ${noPermToken}`);

      expect(res.status).to.equal(403);
    });

    it('should return 401 when no authorization token is provided', async () => {
      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' });

      expect(res.status).to.equal(401);
    });

    it('should return 500 when the service throws an unexpected error', async () => {
      const stub = sinon.stub(TermsOfServiceService, 'getTermsOfService')
        .rejects(new Error('Unexpected internal error'));
      stubs.push(stub);

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(500);
      expect(res.body).to.equal('Internal server error.');
    });

    it('should return 200 for a regular user with own TOS permissions', async () => {
      const tosResponse: TermsOfServiceResponse = { versionNumber: '1.0', content: '# TOS v1.0' };
      const stub = sinon.stub(TermsOfServiceService, 'getTermsOfService').resolves(tosResponse);
      stubs.push(stub);

      const res = await request(ctx.app)
        .get('/terms-of-service')
        .query({ version: '1.0' })
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
    });
  });
});

