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
import { expect, request } from 'chai';
import sinon from 'sinon';
import { Client } from 'ldapts';
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import AuthenticationService from '../../../src/service/authentication-service';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import userIsAsExpected from '../service/authentication-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import GewisUser from '../../../src/gewis/entity/gewis-user';
import Gewis from '../../../src/gewis/gewis';
import wrapInManager from '../../../src/helpers/database';
import { finishTestDB, restoreLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import Bindings from '../../../src/helpers/bindings';
import TokenHandler from '../../../src/authentication/token-handler';
import RoleManager from '../../../src/rbac/role-manager';
import UserController from '../../../src/controller/user-controller';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { PaginatedUserResponse } from '../../../src/controller/response/user-response';
import { GewisUserResponse } from '../../../src/gewis/controller/response/gewis-user-response';
import { truncateAllTables } from '../../setup';

describe('GEWIS Helper functions', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
    validADUser: any,
    adminToken: string,
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
      objectGUID: '1',
      employeeNumber: '4141',
      sAMAccountName: 'm4141',
      mail: 'm4141@gewis.nl',
    };

    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: users[0], roles: ['User', 'Admin'], lesser: false }, '1');

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        User: {
          create: all,
          get: all,
          update: all,
          delete: all,
          acceptToS: all,
        },
        Product: {
          get: all,
        },
        Container: {
          get: all,
        },
        PointOfSale: {
          get: all,
        },
        Transaction: {
          get: all,
        },
        Transfer: {
          get: all,
        },
        Authenticator: {
          get: all,
          update: all,
        },
        Roles: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const spec = await Swagger.initialize(app);
    const controller = new UserController({
      specification: spec,
      roleManager,
    }, tokenHandler);

    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/users', controller.getRouter());

    ctx = {
      connection,
      app,
      users,
      validADUser,
      spec,
      adminToken,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
    restoreLDAPEnv(ldapEnvVariables);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('GEWIS LDAP Authentication', () => {
    it('should bind to GEWIS User if already exists', async () => {
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
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
      await inUserContext(await (await UserFactory()).clone(1), async (user: User) => {
        const ADuser = {
          ...ctx.validADUser, givenName: `Sudo #${user.firstName}`, sn: `SOS #${user.lastName}`, objectGUID: user.id, employeeNumber: `${user.id}`,
        };
        let DBUser = await User.findOne(
          { where: { firstName: ctx.validADUser.givenName, lastName: ctx.validADUser.sn } },
        );
        expect(DBUser).to.be.null;
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

        const gewisUser = await GewisUser.findOne({ where: { user: { id: authUser.id } } });
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

  describe('GEWIS GET /users', () => {
    let oldBindings: any;
    before(() => {
      oldBindings = { ...Bindings.Users };
      Bindings.Users = {
        parseToResponse: Gewis.parseRawUserToGewisResponse,
        getBuilder: Gewis.getUserBuilder,
      };
    });
    after(() => {
      Bindings.Users = { ...oldBindings };
    });
    it('should return the GEWIS id', async () => {
      const res = await request(ctx.app)
        .get('/users')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      (res.body as PaginatedUserResponse).records.forEach((userResponse: GewisUserResponse) => {
        const validation = ctx.spec.validateModel('GewisUserResponse', userResponse, true, true);
        expect(validation.valid).to.be.true;
      });
    });
  });
});
