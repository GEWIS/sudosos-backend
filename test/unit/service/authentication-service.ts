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

  before(async function test(): Promise<void> {
    this.timeout(50000);

    process.env.LDAP_SERVER_URL = 'ldaps://gewisdc03.gewis.nl:636';
    process.env.LDAP_BASE = 'DC=gewiswg,DC=gewis,DC=nl';
    process.env.LDAP_USER_FILTER = '(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=CN=PRIV - SudoSOS Users,OU=Privileges,OU=Groups,DC=gewiswg,DC=gewis,DC=nl)(mail=*)(sAMAccountName=%u))';
    process.env.LDAP_BIND_USER = 'CN=Service account SudoSOS,OU=Service Accounts,OU=Special accounts,DC=gewiswg,DC=gewis,DC=nl';
    process.env.LDAP_BIND_PW = 'BIND PW';

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
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [ctx.validADUser] });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      const user = await AuthenticationService.LDAPAuthentication('m4141', 'This Is Correct',
        AuthenticationService.wrapInManager<User>(AuthenticationService.createUserAndBind));

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
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [otherValidADUser] });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      let user = await AuthenticationService.LDAPAuthentication('m0041', 'This Is Correct',
        AuthenticationService.wrapInManager<User>(AuthenticationService.createUserAndBind));

      userIsAsExpected(user, otherValidADUser);

      DBUser = await User.findOne(
        { where: { firstName: otherValidADUser.givenName, lastName: otherValidADUser.sn } },
      );
      expect(DBUser).to.not.be.undefined;

      const count = await User.count();
      user = await AuthenticationService.LDAPAuthentication('m0041', 'This Is Correct',
        AuthenticationService.wrapInManager<User>(AuthenticationService.createUserAndBind));
      userIsAsExpected(user, otherValidADUser);

      expect(count).to.be.equal(await User.count());
    });
    it('should return undefined if wrong password', async () => {
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [] });
      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      const user = await AuthenticationService.LDAPAuthentication('m4141', 'This Is Wrong',
        AuthenticationService.wrapInManager<User>(AuthenticationService.createUserAndBind));
      expect(user).to.be.undefined;
    });
  });
  describe('PIN Authentication', () => {
    it('should set and verify a user PIN-Code', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        await AuthenticationService.setUserPINCode(user, '1000');
        const auth = await PinAuthenticator.findOne({ where: { user } });
        expect(auth).to.not.be.undefined;
        expect(await AuthenticationService.compareHash('2000', auth.hashedPin)).to.be.false;
        expect(await AuthenticationService.compareHash('1000', auth.hashedPin)).to.be.true;
      });
    });
  });
});
