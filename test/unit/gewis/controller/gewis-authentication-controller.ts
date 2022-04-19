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
import * as jwt from 'jsonwebtoken';
import log4js from 'log4js';
import sinon from 'sinon';
import { Client } from 'ldapts';
import User, { UserType } from '../../../../src/entity/user/user';
import TokenHandler from '../../../../src/authentication/token-handler';
import Database from '../../../../src/database/database';
import Swagger from '../../../../src/start/swagger';
import RoleManager from '../../../../src/rbac/role-manager';
import AuthenticationResponse from '../../../../src/controller/response/authentication-response';
import GewisAuthenticationController from '../../../../src/gewis/controller/gewis-authentication-controller';
import GewiswebToken from '../../../../src/gewis/gewisweb-token';
import GewisUser from '../../../../src/entity/user/gewis-user';
import AuthenticationLDAPRequest from '../../../../src/controller/request/authentication-ldap-request';
import userIsAsExpected from '../../service/authentication-service';
import AuthenticationService from '../../../../src/service/authentication-service';
import GEWISAuthenticationPinRequest from '../../../../src/gewis/controller/request/gewis-authentication-pin-request';

describe('GewisAuthenticationController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    tokenHandler: TokenHandler,
    roleManager: RoleManager,
    specification: SwaggerSpecification,
    controller: GewisAuthenticationController,
    user: User,
    user2: User,
    gewisUser1: GewisUser,
    gewisUser2: GewisUser,
    secret: string,
  };

  before(async () => {
    // Initialize context
    ctx = {
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
      gewisUser1: await GewisUser.save({
        user: {
          id: 1,
        } as User,
        gewisId: 11,
      } as GewisUser),
      gewisUser2: await GewisUser.save({
        user: {
          id: 2,
        } as User,
        gewisId: 12,
      } as GewisUser),
      secret: '42',
    };

    await AuthenticationService.setUserPINCode(await User.findOne(1), '1000');

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
    ctx.controller = new GewisAuthenticationController({
      specification: ctx.specification,
      roleManager: ctx.roleManager,
    }, ctx.tokenHandler, ctx.secret);

    ctx.app.use(json());
    ctx.app.use('/authentication', ctx.controller.getRouter());
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('POST /authentication/gewisweb', () => {
    it('should be able to create token', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser1.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
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
      let req = {
        token: jwt.sign({ lidnr: ctx.gewisUser1.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      let res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(200);

      let auth = res.body as AuthenticationResponse;
      let token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.be.empty;

      req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(200);

      auth = res.body as AuthenticationResponse;
      token = await ctx.tokenHandler.verifyToken(auth.token);
      expect(token.roles).to.deep.equal(['Role']);
    });
    it('should give an HTTP 403 when user does not exist', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId + 1 } as GewiswebToken, ctx.secret, {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 403 with invalid JWT signature', async () => {
      const req = {
        token: jwt.sign({ lidnr: ctx.gewisUser2.gewisId } as GewiswebToken, 'Imposter', {
          algorithm: 'HS256',
        }),
        nonce: 'HelloWorld',
      };
      const res = await request(ctx.app)
        .post('/authentication/gewisweb')
        .send(req);
      expect(res.status).to.equal(403);
    });
  });
  describe('POST /authentication/GEWIS/LDAP', () => {
    const stubs: sinon.SinonStub[] = [];

    const validADUser = {
      dn: 'CN=Sudo SOS (m4141),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl',
      memberOfFlattened: [
        'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
      ],
      givenName: 'Sudo',
      sn: 'SOS',
      objectGUID: '1',
      employeeNumber: '4141',
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
        .post('/authentication/GEWIS/LDAP')
        .send(validLDAPRequest);
      userIsAsExpected((res.body as AuthenticationResponse).user, validADUser);
      expect(res.status).to.equal(200);
    });

    it('should return an HTTP 403 if the login is incorrect', async () => {
      stubLDAP([]);
      const res = await request(ctx.app)
        .post('/authentication/GEWIS/LDAP')
        .send(validLDAPRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });
  describe('POST /authentication/GEWIS/pin', () => {
    const validPinRequest: GEWISAuthenticationPinRequest = {
      gewisId: 11,
      pin: '1000',
    };
    it('should return an HTTP 200 and User if correct pin code', async () => {
      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin')
        .send(validPinRequest);
      expect((res.body as AuthenticationResponse).user.id).to.be.equal(1);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if incorrect pin code', async () => {
      const res = await request(ctx.app)
        .post('/authentication/GEWIS/pin')
        .send({ ...validPinRequest, pin: '1' });
      expect(res.status).to.equal(403);
    });
  });
});
