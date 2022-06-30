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
import express, { Application } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import { json } from 'body-parser';
import log4js from 'log4js';
import sinon from 'sinon';
import { Client } from 'ldapts';
import { describe } from 'mocha';
import User, { UserType } from '../../../src/entity/user/user';
import TokenHandler from '../../../src/authentication/token-handler';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import AuthenticationController from '../../../src/controller/authentication-controller';
import AuthenticationMockRequest from '../../../src/controller/request/authentication-mock-request';
import RoleManager from '../../../src/rbac/role-manager';
import AuthenticationResponse from '../../../src/controller/response/authentication-response';
import AuthenticationLDAPRequest from '../../../src/controller/request/authentication-ldap-request';
import userIsAsExpected from '../service/authentication-service';
import AuthenticationPinRequest from '../../../src/controller/request/authentication-pin-request';

describe('AuthenticationController', async (): Promise<void> => {
  let ctx: {
    env: string,
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: AuthenticationController,
    user: User,
    user2: User,
    request: AuthenticationMockRequest,
  };

  beforeEach(async () => {
    // Initialize context
    ctx = {
      env: process.env.NODE_ENV,
      connection: await Database.initialize(),
      app: express(),
      specification: undefined,
      controller: undefined,
      tokenHandler: new TokenHandler({
        algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
      }),
      roleManager: new RoleManager(),
      user: await User.save({
        firstName: 'Roy',
        type: UserType.LOCAL_USER,
        active: true,
      } as User),
      user2: await User.save({
        firstName: 'Roy Clone',
        type: UserType.LOCAL_ADMIN,
        active: true,
      } as User),
      request: {
        userId: 1,
        nonce: 'test',
      },
    };
    process.env.NODE_ENV = 'development';

    ctx.roleManager.registerRole({
      name: 'Role',
      permissions: {},
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    // Silent in-dependency logs unless really wanted by the environment.
    const logger = log4js.getLogger('Console');
    logger.level = process.env.LOG_LEVEL;
    console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

    ctx.specification = await Swagger.initialize(ctx.app);
    ctx.controller = new AuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler);

    ctx.app.use(json());
    ctx.app.use('/authentication', ctx.controller.getRouter());
  });
  afterEach(async () => {
    process.env.NODE_ENV = ctx.env;
    await ctx.connection.close();
  });

  describe('POST /authentication/mock', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should be able to create token', async () => {
      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;

      const auth = res.body as AuthenticationResponse;
      const promise = ctx.tokenHandler.verifyToken(auth.token);
      expect(promise).to.eventually.be.fulfilled;

      const token = await promise;
      expect(token.roles).to.be.empty;
    });
    it('should contain the correct roles', async () => {
      let res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);

      let auth = res.body as AuthenticationResponse;
      let token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.be.empty;

      const req = {
        ...ctx.request,
        userId: 2,
      };
      res = await request(ctx.app)
        .post('/authentication/mock')
        .send(req);
      expect(res.status).to.equal(200);

      auth = res.body as AuthenticationResponse;
      token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.deep.equal(['Role']);
    });
    it('should give an HTTP 403 when not in development environment', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 when user does not exist', async () => {
      const req = { ...ctx.request, userId: 10 };

      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(req);
      expect(res.status).to.equal(403);
    });
  });
  describe('POST /authentication/LDAP', () => {
    const stubs: sinon.SinonStub[] = [];

    const validADUser = {
      dn: 'CN=Sudo SOS (m4141),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl',
      memberOfFlattened: [
        'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
      ],
      givenName: 'Sudo',
      sn: 'SOS',
      objectGUID: '1',
      sAMAccountName: 'm4141',
      mail: 'm4141@gewis.nl',
    };

    afterEach(() => {
      process.env.LDAP_SERVER_URL = undefined;
      process.env.LDAP_BASE = undefined;
      process.env.LDAP_USER_FILTER = undefined;
      process.env.LDAP_BIND_USER = undefined;
      process.env.LDAP_BIND_PW = undefined;
      stubs.forEach((stub) => stub.restore());
      stubs.splice(0, stubs.length);
    });

    const validLDAPRequest: AuthenticationLDAPRequest = {
      accountName: 'm4141',
      password: 'This is correct',
    };

    function stubLDAP(searchEntries: any[]) {
      // Stub LDAP functions
      process.env.LDAP_SERVER_URL = 'ldaps://gewisdc03.gewis.nl:636';
      process.env.LDAP_BASE = 'DC=gewiswg,DC=gewis,DC=nl';
      process.env.LDAP_USER_FILTER = '(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=CN=PRIV - SudoSOS Users,OU=Privileges,OU=Groups,DC=gewiswg,DC=gewis,DC=nl)(mail=*)(sAMAccountName=%u))';
      process.env.LDAP_BIND_USER = 'CN=Service account SudoSOS,OU=Service Accounts,OU=Special accounts,DC=gewiswg,DC=gewis,DC=nl';
      process.env.LDAP_BIND_PW = 'BIND PW';
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);
    }

    it('should return an HTTP 200 and the user if correct login', async () => {
      stubLDAP([validADUser]);

      const res = await request(ctx.app)
        .post('/authentication/LDAP')
        .send(validLDAPRequest);
      userIsAsExpected((res.body as AuthenticationResponse).user, validADUser);
      expect(res.status).to.equal(200);
    });

    it('should return an HTTP 403 if the login is incorrect', async () => {
      stubLDAP([]);
      const res = await request(ctx.app)
        .post('/authentication/LDAP')
        .send(validLDAPRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });
  describe('POST /authentication/pin', () => {
    const pinRequest: AuthenticationPinRequest = {
      pin: '',
      userId: 0,
    };
  });
});
