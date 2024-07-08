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

import { Connection, EntityManager } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import sinon from 'sinon';
import { Client } from 'ldapts';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import { seedUsers } from '../../seed';
import Swagger from '../../../src/start/swagger';
import ADService from '../../../src/service/ad-service';
import LDAPAuthenticator from '../../../src/entity/authenticator/ldap-authenticator';
import AuthenticationService from '../../../src/service/authentication-service';
import wrapInManager from '../../../src/helpers/database';
import MemberAuthenticator from '../../../src/entity/authenticator/member-authenticator';
import { LDAPGroup, LDAPResponse, LDAPUser } from '../../../src/helpers/ad';
import userIsAsExpected from './authentication-service';
import RoleManager from '../../../src/rbac/role-manager';
import AssignedRole from '../../../src/entity/rbac/assigned-role';
import { finishTestDB, restoreLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';

chai.use(deepEqualInAnyOrder);

describe('AD Service', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
    validADUser: (mNumber: number) => (LDAPResponse),
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
    process.env.LDAP_SHARED_ACCOUNT_FILTER = 'OU=SudoSOS Shared Accounts,OU=Groups,DC=GEWISWG,DC=GEWIS,DC=NL';
    process.env.LDAP_ROLE_FILTER = 'OU=SudoSOS Roles,OU=Groups,DC=GEWISWG,DC=GEWIS,DC=NL';
    process.env.ENABLE_LDAP = 'true';
    process.env.LDAP_USER_BASE = 'CN=PRIV - SudoSOS Users,OU=SudoSOS Roles,OU=Groups,DC=gewiswg,DC=gewis,DC=nl';

    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();
    await seedUsers();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    const validADUser = (mNumber: number) => ({
      dn: `CN=Sudo SOS (m${mNumber}),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl`,
      memberOfFlattened: [
        'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
      ],
      givenName: `Sudo (${mNumber})`,
      sn: 'SOS',
      objectGUID: `${mNumber}`,
      sAMAccountName: `m${mNumber}`,
      mail: `m${mNumber}@gewis.nl`,
      whenChanged: '202204151213.0Z',
    }) as LDAPResponse;

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

  afterEach(async () => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('syncSharedAccounts functions', () => {
    async function createAccountsFromLDAP(accounts: any[]) {
      async function createAccounts(manager: EntityManager, acc: any[]): Promise<any> {
        const users: User[] = [];
        const promises: Promise<any>[] = [];
        acc.forEach((m) => {
          promises.push(AuthenticationService.createUserAndBind(manager, m)
            .then((u) => users.push(u)));
        });
        await Promise.all(promises);
        return users;
      }

      return Promise.resolve(wrapInManager(createAccounts)(accounts));
    }
    it('should create an account for new shared accounts', async () => {
      const newADSharedAccount = {
        objectGUID: '1',
        displayName: 'Shared Organ #1',
        dn: 'CN=SudoSOSAccount - Shared Organ #1,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
      };

      const auth = await LDAPAuthenticator.findOne(
        { where: { UUID: newADSharedAccount.objectGUID } },
      );
      expect(auth).to.be.null;

      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [] });

      clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
        filter: '(CN=*)',
      }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });

      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      const organCount = await User.count({ where: { type: UserType.ORGAN } });
      await ADService.syncSharedAccounts();

      expect(await User.count({ where: { type: UserType.ORGAN } })).to.be.equal(organCount + 1);
      const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;

      expect(newOrgan.firstName).to.be.equal(newADSharedAccount.displayName);
      expect(newOrgan.lastName).to.be.equal('');
      expect(newOrgan.type).to.be.equal(UserType.ORGAN);
    });
    it('should give member access to shared account', async () => {
      const newADSharedAccount = {
        objectGUID: '2',
        displayName: 'Shared Organ #2',
        dn: 'CN=SudoSOSAccount - Shared Organ #2,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
      };

      const auth = await LDAPAuthenticator.findOne(
        { where: { UUID: newADSharedAccount.objectGUID } },
      );
      expect(auth).to.be.null;

      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search');

      const sharedAccountMember = {
        dn: 'CN=Sudo SOS (m4141),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl',
        memberOfFlattened: [
          'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
        ],
        givenName: 'Sudo Organ #2',
        sn: 'SOS',
        objectGUID: '4141',
        sAMAccountName: 'm4141',
        mail: 'm4141@gewis.nl',
      };

      const user = await wrapInManager(AuthenticationService
        .createUserAndBind)(sharedAccountMember);

      clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
        filter: '(CN=*)',
      }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });

      clientSearchStub.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
      })
        .resolves({ searchReferences: [], searchEntries: [sharedAccountMember] });

      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      await ADService.syncSharedAccounts();

      const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;

      const canAuthenticateAs = await MemberAuthenticator.find(
        { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
      );

      expect(canAuthenticateAs.length).to.be.equal(1);
      expect(canAuthenticateAs[0].user.id).to.be.equal(user.id);
    });
    it('should update the members of an existing shared account', async () => {
      const newADSharedAccount = {
        objectGUID: '39',
        displayName: 'Shared Organ #3',
        dn: 'CN=SudoSOSAccount - Shared Organ #3,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
      };

      const auth = await LDAPAuthenticator.findOne(
        { where: { UUID: newADSharedAccount.objectGUID } },
      );
      expect(auth).to.be.null;

      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search');

      const sharedAccountMemberConstruction = (number: number) => ({
        dn: `CN=Sudo SOS (m${number}),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl`,
        memberOfFlattened: [
          'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
        ],
        givenName: `Sudo Organ #3 ${number}`,
        sn: 'SOS',
        mNumber: `${number}`,
        objectGUID: `${number}`,
        sAMAccountName: `m${number}`,
        mail: `m${number}@gewis.nl`,
      });

      let sharedAccountMembers = [sharedAccountMemberConstruction(10),
        sharedAccountMemberConstruction(21)];

      const firstMembers = await createAccountsFromLDAP(sharedAccountMembers);

      clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
        filter: '(CN=*)',
      }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });

      clientSearchStub.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
      })
        .resolves({ searchReferences: [], searchEntries: sharedAccountMembers });

      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      await ADService.syncSharedAccounts();

      // Should contain the first users
      const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;

      let canAuthenticateAsIDs = (await MemberAuthenticator.find(
        { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
      )).map((mAuth) => mAuth.user.id);

      expect(canAuthenticateAsIDs).to.deep.equalInAnyOrder(firstMembers.map((u: any) => u.id));

      stubs.forEach((stub) => stub.restore());
      stubs.splice(0, stubs.length);
      // stubs = [];

      const clientBindStub2 = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub2 = sinon.stub(Client.prototype, 'search');

      sharedAccountMembers = [sharedAccountMemberConstruction(11),
        sharedAccountMemberConstruction(3)];

      const secondMembers = await createAccountsFromLDAP(sharedAccountMembers);

      clientSearchStub2.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
        filter: '(CN=*)',
      }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });

      clientSearchStub2.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
      })
        .resolves({ searchReferences: [], searchEntries: sharedAccountMembers });

      stubs.push(clientBindStub2);
      stubs.push(clientSearchStub2);

      await ADService.syncSharedAccounts();

      canAuthenticateAsIDs = (await MemberAuthenticator.find(
        { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
      )).map((mAuth) => mAuth.user.id);

      const currentMemberIDs = secondMembers.map((u: any) => u.id);
      expect(canAuthenticateAsIDs).to.deep.equalInAnyOrder(currentMemberIDs);
    });
  });
  describe('createAccountIfNew function', () => {
    it('should create an account if GUID is unknown to DB', async () => {
      const adUser = { ...(ctx.validADUser(await User.count() + 200)) };
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID } },
      )).to.be.null;

      const userCount = await User.count();
      await wrapInManager(ADService.createAccountIfNew)([adUser]);

      expect(await User.count()).to.be.equal(userCount + 1);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      const { user } = auth;
      userIsAsExpected(user, adUser);
    });
  });
  describe('syncUserRoles function', () => {
    it('should assign roles to members of the group in AD', async () => {
      process.env.ENABLE_LDAP = 'true';

      const newUser = { ...(ctx.validADUser(await User.count() + 2)) };
      const existingUser = { ...(ctx.validADUser(await User.count() + 3)) };

      await wrapInManager(ADService.createAccountIfNew)([existingUser]);
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: newUser.objectGUID } },
      )).to.be.null;
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: existingUser.objectGUID } },
      )).to.exist;

      const roleGroup: LDAPGroup = {
        cn: 'SudoSOS - Test',
        displayName: 'Test group',
        dn: 'CN=PRIV - SudoSOS Test,OU=SudoSOS Roles,OU=Groups,DC=gewiswg,DC=gewis,DC=nl',
        objectGUID: '1234',
        whenChanged: '',
      };

      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search');

      clientSearchStub.withArgs(process.env.LDAP_ROLE_FILTER, {
        filter: '(CN=*)',
      }).resolves({ searchReferences: [], searchEntries: [roleGroup as any] });

      clientSearchStub.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${roleGroup.dn}))`,
      })
        .resolves({ searchReferences: [], searchEntries: [newUser as any, existingUser as any] });

      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      const roleManager = new RoleManager();

      roleManager.registerRole({
        name: 'SudoSOS - Test',
        permissions: {
        },
        assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - Test', user: { id: user.id } } }) !== undefined,
      });

      await ADService.syncUserRoles(roleManager);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: newUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      const { user } = auth;
      userIsAsExpected(user, newUser);

      const users = await ADService.getUsers([newUser as LDAPUser, existingUser as LDAPUser]);
      expect(await AssignedRole.findOne({ where: { role: 'SudoSOS - Test', user: { id: users[0].id } } })).to.exist;
      expect(await AssignedRole.findOne({ where: { role: 'SudoSOS - Test', user: { id: users[1].id } } })).to.exist;
    });
  });
  describe('syncUsers function', () => {
    it('should create new users if needed', async () => {
      process.env.ENABLE_LDAP = 'true';

      const newUser = { ...(ctx.validADUser(await User.count() + 23)) };
      const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
      const clientSearchStub = sinon.stub(Client.prototype, 'search');

      clientSearchStub.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${process.env.LDAP_USER_BASE}))`,
      })
        .resolves({ searchReferences: [], searchEntries: [newUser as any] });

      stubs.push(clientBindStub);
      stubs.push(clientSearchStub);

      await ADService.syncUsers();
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: newUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      const { user } = auth;
      userIsAsExpected(user, newUser);
    });
  });
});
