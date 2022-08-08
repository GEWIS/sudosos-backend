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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import sinon from 'sinon';
import { Client } from 'ldapts';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import AuthenticationService from '../../../src/service/authentication-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import PinAuthenticator from '../../../src/entity/authenticator/pin-authenticator';
import { UserResponse } from '../../../src/controller/response/user-response';
import { isNumber } from '../../../src/helpers/validators';
import wrapInManager from '../../../src/helpers/database';
import { restoreLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import HashBasedAuthenticationMethod from '../../../src/entity/authenticator/hash-based-authentication-method';
import LocalAuthenticator from '../../../src/entity/authenticator/local-authenticator';

export default function userIsAsExpected(user: User | UserResponse, ADResponse: any) {
  expect(user.firstName).to.equal(ADResponse.givenName);
  expect(user.lastName).to.equal(ADResponse.sn);
  if (isNumber(user.type)) expect(user.type).to.equal(1);
  expect(user.active).to.equal(true);
  expect(user.deleted).to.equal(false);
}

describe('AuthenticationService', (): void => {
  let ctx: {
    connection: Connection,
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
      objectGUID: '1',
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
    await ctx.connection.close();
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
      expect(DBUser).to.be.undefined;
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({
        searchReferences: [],
        searchEntries: [ctx.validADUser],
      });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      const user = await AuthenticationService.LDAPAuthentication('m4141', 'This Is Correct',
        wrapInManager<User>(AuthenticationService.createUserAndBind));

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
        ...ctx.validADUser, givenName: 'Test', objectGUID: 2, sAMAccountName: 'm0041',
      };
      let DBUser = await User.findOne(
        { where: { firstName: otherValidADUser.givenName, lastName: otherValidADUser.sn } },
      );

      expect(DBUser).to.be.undefined;
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({
        searchReferences: [],
        searchEntries: [otherValidADUser],
      });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      let user = await AuthenticationService.LDAPAuthentication('m0041', 'This Is Correct',
        wrapInManager<User>(AuthenticationService.createUserAndBind));

      userIsAsExpected(user, otherValidADUser);

      DBUser = await User.findOne(
        { where: { firstName: otherValidADUser.givenName, lastName: otherValidADUser.sn } },
      );
      expect(DBUser).to.not.be.undefined;

      const count = await User.count();
      user = await AuthenticationService.LDAPAuthentication('m0041', 'This Is Correct',
        wrapInManager<User>(AuthenticationService.createUserAndBind));
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

      const user = await AuthenticationService.LDAPAuthentication('m4141', 'This Is Wrong',
        wrapInManager<User>(AuthenticationService.createUserAndBind));
      expect(user).to.be.undefined;
    });
  });
  describe('Hash Authentication', () => {
    async function verifyLogin<T extends HashBasedAuthenticationMethod>(
      Type: { new(): T, findOne: any, save: any }, right: string, wrong: string,
    ) {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        await AuthenticationService.setUserAuthenticationHash(user, right, Type);
        const auth = await Type.findOne({ where: { user } });
        expect(auth).to.not.be.undefined;
        expect(await AuthenticationService.compareHash(wrong, auth.hash)).to.be.false;
        expect(await AuthenticationService.compareHash(right, auth.hash)).to.be.true;
      });
    }

    it('should set and verify a user PIN-Code', async () => {
      await verifyLogin(PinAuthenticator, '2000', '1000');
    });
    it('should set and verify a user local password', async () => {
      await verifyLogin(LocalAuthenticator, 'Im so right', 'Im so wrong');
    });
  });
  describe('resetLocalUsingToken function', () => {
    it('should reset password if resetToken is correct and user has no password', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        let localAuthenticator = await LocalAuthenticator.findOne({ where: { user }, relations: ['user'] });
        expect(localAuthenticator).to.be.undefined;

        const tokenInfo = await AuthenticationService.createResetToken(user);
        const auth = await AuthenticationService.resetLocalUsingToken(tokenInfo.resetToken, tokenInfo.password, 'Password');
        localAuthenticator = await LocalAuthenticator.findOne({ where: { user }, relations: ['user'] });
        expect(localAuthenticator).to.not.be.undefined;
        expect(auth).to.not.be.undefined;
        expect(AuthenticationService.compareHash('Password', auth.hash)).to.eventually.be.true;
      });
    });
    it('should reset password if resetToken is correct and user has password', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        let auth = await AuthenticationService.setUserAuthenticationHash(user, 'Password2', LocalAuthenticator);
        expect(AuthenticationService.compareHash('Password2', auth.hash)).to.eventually.be.true;

        const tokenInfo = await AuthenticationService.createResetToken(user);
        auth = await AuthenticationService.resetLocalUsingToken(tokenInfo.resetToken, tokenInfo.password, 'Password');

        expect(auth).to.not.be.undefined;
        expect(AuthenticationService.compareHash('Password', auth.hash)).to.eventually.be.true;
        expect(AuthenticationService.compareHash('Password2', auth.hash)).to.eventually.be.false;
      });
    });
    it('should return undefined if resetToken is incorrect', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        const tokenInfo = await AuthenticationService.createResetToken(user);
        const auth = await AuthenticationService.resetLocalUsingToken(tokenInfo.resetToken, 'wrong', 'Password');
        expect(auth).to.be.undefined;
      });
    });
  });
  describe('createResetToken function', () => {
    it('should create a reset token', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        const tokenInfo = await AuthenticationService.createResetToken(user);
        expect(tokenInfo.resetToken.user).to.eq(user);

        expect(tokenInfo.resetToken.expires).to.be.greaterThan(new Date());
      });
    });
  });
});
