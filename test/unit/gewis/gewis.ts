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
import { expect } from 'chai';
import sinon from 'sinon';
import { Client } from 'ldapts';
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import AuthenticationService from '../../../src/service/authentication-service';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import userIsAsExpected from '../service/authentication-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import GewisUser from '../../../src/entity/user/gewis-user';
import Gewis from '../../../src/gewis/gewis';
import wrapInManager from '../../../src/helpers/database';
import { restoreLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';

describe('GEWIS Helper functions', async (): Promise<void> => {
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
      employeeNumber: '4141',
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
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
    restoreLDAPEnv(ldapEnvVariables);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('GEWIS LDAP Authentication', () => {
    it('should bind to GEWIS User if already exists', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        const ADuser = {
          ...ctx.validADUser, givenName: `Sudo #${user.firstName}`, sn: `SOS #${user.lastName}`, objectGUID: user.id, employeeNumber: `${user.id}`,
        };
        const userCount = await User.count();

        const newGewisUser = Object.assign(new GewisUser(), {
          user,
          gewisId: user.id,
        });
        await newGewisUser.save();
        const gewisUserCount = await GewisUser.count();

        const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
        const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [ADuser] });
        stubs.push(clientBindStub);
        stubs.push(clientSearchStub);

        const authUser = await AuthenticationService.LDAPAuthentication(`m${user.id}`, 'This Is Correct',
          wrapInManager<User>(Gewis.findOrCreateGEWISUserAndBind));

        expect(authUser.id).to.be.equal(user.id);
        expect(await User.count()).to.be.equal(userCount);
        expect(await GewisUser.count()).to.be.equal(gewisUserCount);
        expect(user).to.not.be.undefined;
        expect(clientBindStub).to.have.been.calledWith(
          process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PW,
        );
      });
    });
    it('should login and create a user + GEWIS user using LDAP ', async () => {
      await inUserContext(await UserFactory().clone(1), async (user: User) => {
        const ADuser = {
          ...ctx.validADUser, givenName: `Sudo #${user.firstName}`, sn: `SOS #${user.lastName}`, objectGUID: user.id, employeeNumber: `${user.id}`,
        };
        let DBUser = await User.findOne(
          { where: { firstName: ctx.validADUser.givenName, lastName: ctx.validADUser.sn } },
        );
        expect(DBUser).to.be.undefined;
        const userCount = await User.count();
        const gewisUserCount = await GewisUser.count();

        const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
        const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [ADuser] });
        stubs.push(clientBindStub);
        stubs.push(clientSearchStub);

        const authUser = await AuthenticationService.LDAPAuthentication(`m${user.id}`, 'This Is Correct',
          wrapInManager<User>(Gewis.findOrCreateGEWISUserAndBind));

        DBUser = await User.findOne(
          { where: { firstName: ADuser.givenName, lastName: ADuser.sn } },
        );
        expect(DBUser).to.exist;

        userIsAsExpected(authUser, ADuser);

        const gewisUser = await GewisUser.findOne({ where: { user: authUser } });
        expect(gewisUser.gewisId).to.be.equal(user.id);

        expect(await User.count()).to.be.equal(userCount + 1);
        expect(await GewisUser.count()).to.be.equal(gewisUserCount + 1);
        expect(user).to.not.be.undefined;
        expect(clientBindStub).to.have.been.calledWith(
          process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PW,
        );
      });
    });
  });
});
