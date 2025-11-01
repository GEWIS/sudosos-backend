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
 *
 *  @license
 */

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import sinon from 'sinon';
import { Client } from 'ldapts';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed/all';
import Swagger from '../../../src/start/swagger';
import AuthenticationService from '../../../src/service/authentication-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import PinAuthenticator from '../../../src/entity/authenticator/pin-authenticator';
import { UserResponse } from '../../../src/controller/response/user-response';
import { isNumber } from '../../../src/helpers/validators';
import { finishTestDB, restoreLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import HashBasedAuthenticationMethod from '../../../src/entity/authenticator/hash-based-authentication-method';
import LocalAuthenticator from '../../../src/entity/authenticator/local-authenticator';
import AuthenticationResetTokenRequest from '../../../src/controller/request/authentication-reset-token-request';
import { truncateAllTables } from '../../setup';

export default function userIsAsExpected(user: User | UserResponse, ADResponse: any) {
  expect(user.firstName).to.equal(ADResponse.givenName);
  expect(user.lastName).to.equal(ADResponse.sn);
  if (isNumber(user.type)) expect(user.type).to.equal(1);
  expect(user.active).to.equal(true);
  expect(user.deleted).to.equal(false);
  expect(user.canGoIntoDebt).to.equal(true);
}

describe('AuthenticationService', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
    validADUser: any,
  };

  const stubs: sinon.SinonStub[] = [];

  let ldapEnvVariables: { [key: string]: any; } = {};

  before(async function test(): Promise<void> {
    this.timeout(50000);

    ldapEnvVariables = storeLDAPEnv();

    process.env.LDAP_SERVER_URL = 'ldaps://gewisdc03.gewis.nl:636';
    process.env.LDAP_BASE = 'DC=gewiswg,DC=gewis,DC=nl';
    process.env.LDAP_USER_FILTER = '(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=CN=PRIV - SudoSOS Users,OU=Privileges,OU=Groups,DC=gewiswg,DC=gewis,DC=nl)(mail=*)(sAMAccountName=%u))';
    process.env.LDAP_BIND_USER = 'CN=Service account SudoSOS,OU=Service Accounts,OU=Special accounts,DC=gewiswg,DC=gewis,DC=nl';
    process.env.LDAP_BIND_PW = 'BIND PW';
    process.env.ENABLE_LDAP = 'true';

    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();
    await seedDatabase();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    const validADUser = {
      dn: 'CN=Sudo SOS (m4141),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl',
      memberOfFlattened: [
        'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
      ],
      givenName: 'Sudo',
      sn: 'SOS',
      objectGUID: Buffer.from('11', 'hex'),
      sAMAccountName: 'm4141',
      mail: 'm4141@gewis.nl',
    };

    ctx = {
      connection,
      app,
      users,
      validADUser,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    restoreLDAPEnv(ldapEnvVariables);
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('LDAP Authentication', () => {
    it('should login and create a user using LDAP', async () => {
      let DBUser = await User.findOne(
        { where: { firstName: ctx.validADUser.givenName, lastName: ctx.validADUser.sn } },
      );
      expect(DBUser).to.be.null;
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({
        searchReferences: [],
        searchEntries: [ctx.validADUser],
      });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      let user: User;
      await ctx.connection.transaction(async (manager) => {
        const service = new AuthenticationService(manager);
        user = await service.LDAPAuthentication('m4141', 'This Is Correct', service.createUserAndBind.bind(service));
      });

      DBUser = await User.findOne(
        { where: { firstName: ctx.validADUser.givenName, lastName: ctx.validADUser.sn } },
      );
      expect(DBUser).to.exist;

      userIsAsExpected(user, ctx.validADUser);

      expect(user).to.not.be.undefined;
      expect(clientBindStub).to.have.been.calledWith(
        process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PW,
      );
    });
    it('should login without creating a user if already bound', async () => {
      const otherValidADUser = {
        ...ctx.validADUser, givenName: 'Test', objectGUID: Buffer.from('22', 'hex'), sAMAccountName: 'm0041',
      };
      let DBUser = await User.findOne(
        { where: { firstName: otherValidADUser.givenName, lastName: otherValidADUser.sn } },
      );

      expect(DBUser).to.be.null;
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({
        searchReferences: [],
        searchEntries: [otherValidADUser],
      });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      let user: User;
      await ctx.connection.transaction(async (manager) => {
        const service = new AuthenticationService(manager);
        user = await service.LDAPAuthentication('m0041', 'This Is Correct', service.createUserAndBind.bind(service));
      });

      userIsAsExpected(user, otherValidADUser);

      DBUser = await User.findOne(
        { where: { firstName: otherValidADUser.givenName, lastName: otherValidADUser.sn } },
      );
      expect(DBUser).to.not.be.undefined;

      const count = await User.count();

      await ctx.connection.transaction(async (manager) => {
        const service = new AuthenticationService(manager);
        user = await service.LDAPAuthentication('m0041', 'This Is Correct', service.createUserAndBind.bind(service));
      });
      userIsAsExpected(user, otherValidADUser);

      expect(count).to.be.equal(await User.count());
    });
    it('should return undefined if wrong password', async () => {
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({
        searchReferences: [],
        searchEntries: [],
      });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      let user: User;
      await ctx.connection.transaction(async (manager) => {
        const service = new AuthenticationService(manager);
        user = await service.LDAPAuthentication('m4141', 'This Is Wrong', service.createUserAndBind.bind(service));
      });
      expect(user).to.be.undefined;
    });
  });
  describe('Hash Authentication', () => {
    async function verifyLogin<T extends HashBasedAuthenticationMethod>(
      Type: { new(): T, findOne: any, save: any }, right: string, wrong: string,
    ) {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        await new AuthenticationService().setUserAuthenticationHash(user, right, Type);
        const auth = await Type.findOne({ where: { user: { id: user.id } } });
        expect(auth).to.not.be.null;
        expect(await new AuthenticationService().compareHash(wrong, auth.hash)).to.be.false;
        expect(await new AuthenticationService().compareHash(right, auth.hash)).to.be.true;
      });
    }

    it('should set and verify a user PIN-Code', async () => {
      await verifyLogin(PinAuthenticator, '2000', '1000');
    });
    it('should set and verify a user local password', async () => {
      await verifyLogin(LocalAuthenticator, 'Im so right', 'Im so wrong');
    });

    describe('with posId parameter', () => {
      it('should include posId in token when provided for PIN authentication', async () => {
        await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
          await new AuthenticationService().setUserAuthenticationHash(user, '2000', PinAuthenticator);
          const auth = await PinAuthenticator.findOne({ where: { user: { id: user.id } } });
          
          const mockContext = {
            roleManager: {
              getRoles: () => Promise.resolve([]),
              getUserOrgans: () => Promise.resolve([]),
              can: () => Promise.resolve(false),
            },
            tokenHandler: {
              signToken: (contents: any) => Promise.resolve('mock-token'),
            },
          };

          const result = await new AuthenticationService().HashAuthentication(
            '2000', auth, mockContext, true, 123
          );

          expect(result).to.not.be.undefined;
          expect(result?.token).to.equal('mock-token');
        });
      });

      it('should include posId in token when provided for local authentication', async () => {
        await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
          await new AuthenticationService().setUserAuthenticationHash(user, 'password123', LocalAuthenticator);
          const auth = await LocalAuthenticator.findOne({ where: { user: { id: user.id } } });
          
          const mockContext = {
            roleManager: {
              getRoles: () => Promise.resolve([]),
              getUserOrgans: () => Promise.resolve([]),
              can: () => Promise.resolve(false),
            },
            tokenHandler: {
              signToken: (contents: any) => Promise.resolve('mock-token'),
            },
          };

          const result = await new AuthenticationService().HashAuthentication(
            'password123', auth, mockContext, true, 456
          );

          expect(result).to.not.be.undefined;
          expect(result?.token).to.equal('mock-token');
        });
      });

      it('should work without posId when not provided', async () => {
        await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
          await new AuthenticationService().setUserAuthenticationHash(user, '2000', PinAuthenticator);
          const auth = await PinAuthenticator.findOne({ where: { user: { id: user.id } } });
          
          const mockContext = {
            roleManager: {
              getRoles: () => Promise.resolve([]),
              getUserOrgans: () => Promise.resolve([]),
              can: () => Promise.resolve(false),
            },
            tokenHandler: {
              signToken: (contents: any) => Promise.resolve('mock-token'),
            },
          };

          const result = await new AuthenticationService().HashAuthentication(
            '2000', auth, mockContext, true
          );

          expect(result).to.not.be.undefined;
          expect(result?.token).to.equal('mock-token');
        });
      });
    });
  });
  describe('resetLocalUsingToken function', () => {
    it('should reset password if resetToken is correct and user has no password', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        let localAuthenticator = await LocalAuthenticator.findOne({ where: { user: { id: user.id } }, relations: ['user'] });
        expect(localAuthenticator).to.be.null;

        const tokenInfo = await new AuthenticationService().createResetToken(user);
        const auth = await new AuthenticationService().resetLocalUsingToken(tokenInfo.resetToken, tokenInfo.password, 'Password');
        localAuthenticator = await LocalAuthenticator.findOne({ where: { user: { id: user.id } }, relations: ['user'] });
        expect(localAuthenticator).to.not.be.null;
        expect(auth).to.not.be.undefined;
        await expect(new AuthenticationService().compareHash('Password', auth.hash)).to.eventually.be.true;
      });
    });
    it('should reset password if resetToken is correct and user has password', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        let auth = await new AuthenticationService().setUserAuthenticationHash(user, 'Password2', LocalAuthenticator);
        await expect(new AuthenticationService().compareHash('Password2', auth.hash)).to.eventually.be.true;

        const tokenInfo = await new AuthenticationService().createResetToken(user);
        auth = await new AuthenticationService().resetLocalUsingToken(tokenInfo.resetToken, tokenInfo.password, 'Password');

        expect(auth).to.not.be.undefined;
        await expect(new AuthenticationService().compareHash('Password', auth.hash)).to.eventually.be.true;
        await expect(new AuthenticationService().compareHash('Password2', auth.hash)).to.eventually.be.false;
      });
    });
  });
  describe('isResetTokenRequestValid function', () => {
    it('should return false if user has no reset token requested', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password: 'Password',
          token: 'wrong',
        };
        const auth = await new AuthenticationService().isResetTokenRequestValid(req);
        expect(auth).to.be.undefined;
      });
    });
    it('should return false if user is not local', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        // eslint-disable-next-line no-param-reassign
        user.type = UserType.MEMBER;
        await User.save(user);
        const resetToken = await new AuthenticationService().createResetToken(user);
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password: 'Password',
          token: resetToken.password,
        };
        const auth = await new AuthenticationService().isResetTokenRequestValid(req);
        expect(auth).to.be.undefined;
      });
    });
    it('should return false if token is incorrect', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        await new AuthenticationService().createResetToken(user);
        const req: AuthenticationResetTokenRequest = {
          accountMail: user.email,
          password: 'Password',
          token: 'wrong',
        };
        const auth = await new AuthenticationService().isResetTokenRequestValid(req);
        expect(auth).to.be.undefined;
      });
    });
  });
  describe('createResetToken function', () => {
    it('should create a reset token', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const tokenInfo = await new AuthenticationService().createResetToken(user);
        expect(tokenInfo.resetToken.user).to.eq(user);
        expect(tokenInfo.resetToken.expires).to.be.greaterThan(new Date());
      });
    });
  });
});
