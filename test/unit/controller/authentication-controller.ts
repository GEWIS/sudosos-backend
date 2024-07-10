/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
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
import PinAuthenticator from '../../../src/entity/authenticator/pin-authenticator';
import { seedHashAuthenticator } from '../../seed';
import AuthenticationLocalRequest from '../../../src/controller/request/authentication-local-request';
import LocalAuthenticator from '../../../src/entity/authenticator/local-authenticator';
import ResetLocalRequest from '../../../src/controller/request/reset-local-request';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import AuthenticationService from '../../../src/service/authentication-service';
import AuthenticationResetTokenRequest from '../../../src/controller/request/authentication-reset-token-request';
import EanAuthenticator from '../../../src/entity/authenticator/ean-authenticator';
import AuthenticationEanRequest from '../../../src/controller/request/authentication-ean-request';
import KeyAuthenticator from '../../../src/entity/authenticator/key-authenticator';
import AuthenticationKeyRequest from '../../../src/controller/request/authentication-key-request';
import AuthenticationNfcRequest from '../../../src/controller/request/authentication-nfc-request';
import NfcAuthenticator from '../../../src/entity/authenticator/nfc-authenticator';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { assignRole, seedRole } from '../../seed/rbac';
import Role from '../../../src/entity/rbac/role';

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
    user3: User,
    role: Role,
    request: AuthenticationMockRequest,
  };

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const [role] = await seedRole([{
      name: 'Role',
      permissions: {
        Product: {
          create: { all: new Set(['*']) },
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    }]);

    // Initialize context
    ctx = {
      env: process.env.NODE_ENV,
      connection: connection,
      app: express(),
      specification: undefined,
      controller: undefined,
      tokenHandler: new TokenHandler({
        algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
      }),
      roleManager: new RoleManager(),
      user: await User.save({
        firstName: 'Roy',
        email: 'Roy@gewis.nl',
        type: UserType.LOCAL_USER,
        active: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      } as User),
      user2: await User.save({
        firstName: 'Roy Clone',
        email: 'Roy39@gewis.nl',
        type: UserType.LOCAL_ADMIN,
        active: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      } as User),
      user3: await User.save({
        firstName: 'Roy Clone',
        email: 'Roy41@gewis.nl',
        type: UserType.LOCAL_ADMIN,
        active: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      } as User),
      request: {
        userId: 1,
        nonce: 'test',
      },
      role: role.role,
    };

    process.env.NODE_ENV = 'development';
    await Promise.all([ctx.user, ctx.user2, ctx.user3].map((u) => {
      return assignRole(u, role);
    }));

    await seedHashAuthenticator([ctx.user, ctx.user2], PinAuthenticator);
    await seedHashAuthenticator([ctx.user, ctx.user2], LocalAuthenticator);
    await seedHashAuthenticator([ctx.user, ctx.user2], KeyAuthenticator);

    await EanAuthenticator.save({
      userId: ctx.user.id,
      eanCode: '39',
    });

    await NfcAuthenticator.save({
      userId: ctx.user.id,
      nfcCode: 'nfcCorrectString',
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
  after(async () => {
    process.env.NODE_ENV = ctx.env;
    await finishTestDB(ctx.connection);
  });

  describe('POST /authentication/mock', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .post('/authentication/mock')
        .send(ctx.request);
      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'AuthenticationResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
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
      await expect(promise).to.eventually.be.fulfilled;

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
      expect(auth.permissions.length).to.equal(1);
      expect(auth.permissions[0]).to.deep.equal({
        entity: 'Product',
        action: 'create',
        relationship: 'all',
        attributes: ['*'],
      });
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

  function testHashAuthentication(type: string, right: any, wrong: any) {
    it('should return an HTTP 200 and User if correct', async () => {
      const res = await request(ctx.app)
        .post(`/authentication/${type}`)
        .send(right);
      expect(res.status).to.equal(200);
      expect((res.body as AuthenticationResponse).user.id).to.be.equal(1);
    });
    it('should return an HTTP 403 if incorrect', async () => {
      const res = await request(ctx.app)
        .post(`/authentication/${type}`)
        .send(wrong);
      expect(res.status).to.equal(403);
    });
  }

  describe('POST /authentication/pin', () => {
    const validPinRequest: AuthenticationPinRequest = {
      userId: 1,
      pin: '1',
    };
    testHashAuthentication('pin', validPinRequest, { ...validPinRequest, pin: '2' });
    it('should return an HTTP 403 if user does not exist', async () => {
      const userId = 0;
      const res = await request(ctx.app)
        .post('/authentication/pin')
        .send({ userId, pin: '1' } as AuthenticationPinRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
    it('should return an HTTP 403 if user does not have a pin', async () => {
      const res = await request(ctx.app)
        .post('/authentication/pin')
        .send({ userId: 3, pin: '1' } as AuthenticationPinRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });

  describe('POST /authentication/local', () => {
    const validLocalRequest: AuthenticationLocalRequest = {
      accountMail: 'Roy@gewis.nl',
      password: '1',
    };
    testHashAuthentication('local', validLocalRequest, { ...validLocalRequest, password: '2' });
    it('should return an HTTP 403 if user does not exist', async () => {
      const accountMail = 'fake@gewis.nl';
      const res = await request(ctx.app)
        .post('/authentication/local')
        .send({ accountMail, password: '1' });
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
    it('should return an HTTP 403 if user does not have a password', async () => {
      const res = await request(ctx.app)
        .post('/authentication/local')
        .send({ accountMail: 'Roy41@gewis.nl', password: '1' } as AuthenticationLocalRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
  });

  describe('POST /authentication/key', () => {
    const validKeyRequest: AuthenticationKeyRequest = {
      userId: 1,
      key: '1',
    };
    testHashAuthentication('key', validKeyRequest, { ...validKeyRequest, key: '2' });
    it('should return an HTTP 403 if user does not exist', async () => {
      const userId = 0;
      const res = await request(ctx.app)
        .post('/authentication/key')
        .send({ userId, key: '1' } as AuthenticationKeyRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });
    it('should return an HTTP 403 if user does not have a key', async () => {
      const res = await request(ctx.app)
        .post('/authentication/key')
        .send({ userId: 3, key: '1' } as AuthenticationKeyRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
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

  describe('POST /authentication/ean', async () => {
    const validLocalRequest: AuthenticationEanRequest = {
      eanCode: '39',
    };
    testHashAuthentication('ean', validLocalRequest, { ...validLocalRequest, eanCode: '2' });
  });

  describe('POST /authentication/nfc', async () => {

    it('should return an HTTP 200 and User if correct', async () => {
      const validNfcRequest: AuthenticationNfcRequest = {
        nfcCode: 'nfcCorrectString',
      };
      const res = await request(ctx.app)
        .post('/authentication/nfc')
        .send(validNfcRequest);
      expect(res.status).to.equal(200);
      expect((res.body as AuthenticationResponse).user.id).to.be.equal(1);
    });
    it('should return an HTTP 403 if incorrect', async () => {
      const wrongNfcRequest: AuthenticationNfcRequest = {
        nfcCode: 'nfcwrongString',
      };
      const res = await request(ctx.app)
        .post('/authentication/nfc')
        .send(wrongNfcRequest);
      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 403 if user does not have a nfc', async () => {
      const validNfcRequest: AuthenticationNfcRequest = {
        nfcCode: 'nfcCorrectString',
      };
      const res = await request(ctx.app)
        .post('/authentication/nfc')
        .send({ ...validNfcRequest, nfcCode: 'notExistingNfcString' } as AuthenticationNfcRequest);
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Invalid credentials.');
    });

  });

  describe('POST /authentication/local/reset', async () => {
    it('should return an HTTP 204', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        const req: ResetLocalRequest = {
          accountMail: user.email,
        };
        const res = await request(ctx.app)
          .post('/authentication/local/reset')
          .send(req);
        expect(res.status).to.equal(204);
      });
    });
    it('should return an HTTP 204 is user does not exist', async () => {
      const req: ResetLocalRequest = {
        accountMail: 'fake@sudosos.nl',
      };
      const res = await request(ctx.app)
        .post('/authentication/local/reset')
        .send(req);
      expect(res.status).to.equal(204);
    });
  });
  describe('PUT /authentication/local', () => {
    it('should reset local if token is correct', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.LOCAL_USER;
        await User.save(user);
        const resetToken = await AuthenticationService.createResetToken(user);
        const password = 'Password2';
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password,
          token: resetToken.password,
        };

        let res = await request(ctx.app)
          .put('/authentication/local')
          .send(req);
        expect(res.status).to.equal(204);

        const auth: AuthenticationLocalRequest = {
          accountMail: user.email, password,
        };

        res = await request(ctx.app)
          .post('/authentication/local')
          .send(auth);

        expect(res.status).to.be.eq(200);
      });
    });
    it('should return an HTTP 403 if user does not exist', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.LOCAL_USER;
        await User.save(user);
        const resetToken = await AuthenticationService.createResetToken(user);
        const password = 'Password2';
        const req: AuthenticationResetTokenRequest = {
          accountMail: 'wrong@sudosos.nl',
          password,
          token: resetToken.password,
        };

        const res = await request(ctx.app)
          .put('/authentication/local')
          .send(req);
        expect(res.status).to.equal(403);
        expect(res.body.message).to.equal('Invalid request.');
      });
    });
    it('should return an HTTP 403 if the user has requested no reset', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.LOCAL_USER;
        await User.save(user);
        const password = 'Password2';
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password,
          token: password,
        };

        const res = await request(ctx.app)
          .put('/authentication/local')
          .send(req);
        expect(res.status).to.equal(403);
        expect(res.body.message).to.equal('Invalid request.');
      });
    });
    it('should return an HTTP 403 if the token is expired', async () => {
      const { RESET_TOKEN_EXPIRES } = process.env;
      process.env.RESET_TOKEN_EXPIRES = '0';
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.LOCAL_USER;
        await User.save(user);
        const resetToken = await AuthenticationService.createResetToken(user);
        const password = 'Password2';
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password,
          token: resetToken.password,
        };

        await new Promise((f) => setTimeout(f, 100));

        const res = await request(ctx.app)
          .put('/authentication/local')
          .send(req);
        expect(res.status).to.equal(403);
        expect(res.body.message).to.equal('Token expired.');
      });
      process.env.RESET_TOKEN_EXPIRES = RESET_TOKEN_EXPIRES;
    });
    it('should return an HTTP 403 if the wrong token password is provided', async () => {
      await inUserContext((await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.LOCAL_USER;
        await User.save(user);
        await AuthenticationService.createResetToken(user);
        const password = 'Password2';
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password,
          token: 'wrong',
        };

        const res = await request(ctx.app)
          .put('/authentication/local')
          .send(req);
        expect(res.status).to.equal(403);
        expect(res.body.message).to.equal('Invalid request.');
      });
    });
  });
});
