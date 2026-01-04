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

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import sinon from 'sinon';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ADService from '../../../src/service/ad-service';
import LDAPAuthenticator from '../../../src/entity/authenticator/ldap-authenticator';
import { LDAPGroup, LDAPUser } from '../../../src/helpers/ad';
import userIsAsExpected from './authentication-service';
import { finishTestDB, restoreLDAPEnv, setDefaultLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { UserSeeder } from '../../seed';
import { Client } from 'ldapts';
import RoleManager from '../../../src/rbac/role-manager';
import AuthenticationService from '../../../src/service/authentication-service';

chai.use(deepEqualInAnyOrder);

describe('AD Service', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
  };

  const validADUser = (mNumber: number): LDAPUser => ({
    dn: `CN=SudoSOS (m${mNumber}),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl`,
    memberOfFlattened: [
      'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
    ],
    givenName: `Sudo (${mNumber})`,
    sn: 'SOS',
    objectGUID: Buffer.from((mNumber.toString().length % 2 ? '0' : '') + mNumber.toString(), 'hex'),
    mNumber: mNumber,
    mail: `m${mNumber}@gewis.nl`,
    whenChanged: '202204151213.0Z',
    displayName: `Sudo (${mNumber})`,
  });

  const validLDAPGroup = (mNumber: number): LDAPGroup => ({
    displayName: `Group ${mNumber}`,
    dn: 'OU=SudoSOS Shared Accounts,OU=Groups,DC=GEWISWG,DC=GEWIS,DC=NL',
    cn: `Group ${mNumber}`,
    objectGUID: Buffer.from((mNumber.toString().length % 2 ? '0' : '') + mNumber.toString(), 'hex'),
    whenChanged: Date.now().toString(),
  });

  const organIsAsExpected = (user: User, organ: LDAPGroup) => {
    expect(user.type).to.equal(UserType.ORGAN);
    expect(user.firstName).to.equal(organ.displayName);
    expect(user.lastName).to.equal('');
    expect(user.active).to.equal(true);
    expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_REQUIRED);
  };

  const serviceAccountIsAsExpected = (user: User, organ: LDAPUser) => {
    expect(user.type).to.equal(UserType.INTEGRATION);
    expect(user.firstName).to.equal(organ.displayName);
    expect(user.lastName).to.equal('');
    expect(user.active).to.equal(true);
    expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_REQUIRED);
    expect(user.canGoIntoDebt).to.equal(false);
  };

  const stubs: sinon.SinonStub[] = [];

  let ldapEnvVariables: { [key: string]: any; } = {};

  before(async function test(): Promise<void> {
    this.timeout(50000);

    ldapEnvVariables = storeLDAPEnv();
    setDefaultLDAPEnv();

    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();
    await new UserSeeder().seed();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    ctx = {
      connection,
      app,
      users,
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

  describe('createAccountIfNew function', () => {
    it('should create an account if GUID is unknown to DB', async () => {
      const adUser = { ...(validADUser(await User.count() + 200)) };
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID } },
      )).to.be.null;

      const userCount = await User.count();
      await new ADService().createAccountIfNew([adUser]);

      expect(await User.count()).to.be.equal(userCount + 1);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      const { user } = auth;
      userIsAsExpected(user, adUser);
    });
    it('should not create an account if GUID is known to DB', async () => {
      const adUser = { ...(validADUser(await User.count() + 200)) };
      // precondition.
      await new ADService().createAccountIfNew([adUser]);

      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID } },
      )).to.not.be.null;

      const userCount = await User.count();
      await new ADService().createAccountIfNew([adUser]);
      expect(await User.count()).to.be.equal(userCount);
    });
  });
  describe('toSharedUser function', () => {
    it('should create an ORGAN user', async () => {
      const userCount = await User.count();
      const organUser = validLDAPGroup(userCount + 200);
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: organUser.objectGUID } },
      )).to.be.null;
      await new ADService().toSharedUser(validLDAPGroup(await User.count() + 200));
      expect(await User.count()).to.be.equal(userCount + 1);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: organUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      organIsAsExpected(auth.user, organUser);
    });
  });

  describe('toServiceAccount function', () => {
    it('should create an INTEGRATION user', async () => {
      const userCount = await User.count();
      const adUser = validADUser(await User.count() + 200);
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID } },
      )).to.be.null;
      await new ADService().toServiceAccount(adUser);
      expect(await User.count()).to.be.equal(userCount + 1);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      serviceAccountIsAsExpected(auth.user, adUser);
    });
  });

  describe('getUsers function', () => {
    it('should return only bound users if createIfNew is false', async () => {
      const rawLdapUsers = [validADUser(await User.count() + 200), validADUser(await User.count() + 201)];
      await new ADService().createAccountIfNew(rawLdapUsers);
      const newLdapUsers = [validADUser(await User.count() + 200), validADUser(await User.count() + 201)];

      const ldapUsers: User[] = [];
      for (const ldapUser of rawLdapUsers) {
        const auth = await LDAPAuthenticator.findOne(
          { where: { UUID: ldapUser.objectGUID }, relations: ['user'] },
        );
        expect(auth).to.exist;
        ldapUsers.push(auth.user);
      }

      const userCount = await User.count();
      const users = await new ADService().getUsers(rawLdapUsers.concat(newLdapUsers), false);
      expect(await User.count()).to.be.equal(userCount);
      expect(users).to.have.length(2);
      expect(users).to.deep.equalInAnyOrder(ldapUsers);
    });
    it('should return return all and create new users if createIfNew is true', async () => {
      const rawLdapUsers = [validADUser(await User.count() + 200), validADUser(await User.count() + 201)];
      await new ADService().createAccountIfNew(rawLdapUsers);
      const newLdapUsers = [validADUser(await User.count() + 200), validADUser(await User.count() + 201)];

      const ldapUsers: User[] = [];
      for (const ldapUser of rawLdapUsers) {
        const auth = await LDAPAuthenticator.findOne(
          { where: { UUID: ldapUser.objectGUID }, relations: ['user'] },
        );
        expect(auth).to.exist;
        ldapUsers.push(auth.user);
      }

      for (const ldapUser of newLdapUsers) {
        const auth = await LDAPAuthenticator.findOne(
          { where: { UUID: ldapUser.objectGUID }, relations: ['user'] },
        );
        expect(auth).to.not.exist;
      }

      const userCount = await User.count();
      const users = await new ADService().getUsers(rawLdapUsers.concat(newLdapUsers), true);
      expect(await User.count()).to.be.equal(userCount + newLdapUsers.length);
      expect(users).to.have.length(rawLdapUsers.length + newLdapUsers.length);
    });
  });
  describe('AD Client functions', () => {
    beforeEach(() => {
      stubs.push(sinon.stub(Client.prototype, 'bind').resolves(null));
    });
    describe('getLDAPGroupMembers function', () => {
      let ldapClient: Client;
      const dn = 'CN=GroupName,OU=Groups,DC=example,DC=com';
      const mockResponse = {
        searchEntries: [
          {
            objectGUID: Buffer.from('12345678', 'hex'),
            dn: 'CN=Test User,OU=Users,DC=example,DC=com',
            givenName: 'Test',
            sn: 'User',
          },
        ],
        searchReferences: [] as string[],
      };

      beforeEach(() => {
        ldapClient = new Client({ url: 'ldap://example.com' });
        stubs.push(sinon.stub(Client.prototype, 'search').resolves(mockResponse));
      });

      afterEach(() => {
        stubs.forEach((stub) => stub.restore());
        stubs.splice(0, stubs.length);
      });

      it('should return searchEntries for a valid group DN', async () => {
        const adService = new ADService();
        const result = await adService.getLDAPGroupMembers(ldapClient, dn);

        expect(result).to.have.property('searchEntries').that.is.an('array');
        expect(result.searchEntries).to.deep.equal(mockResponse.searchEntries);
        expect(result).to.have.property('searchReferences').that.is.an('array');
        expect(result.searchReferences).to.deep.equal(mockResponse.searchReferences);

        sinon.assert.calledOnceWithExactly(Client.prototype.search as sinon.SinonStub, process.env.LDAP_BASE, {
          filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
          explicitBufferAttributes: ['objectGUID'],
        });
      });

      it('should throw an error if the search fails', async () => {
        const searchStub = Client.prototype.search as sinon.SinonStub;
        searchStub.rejects(new Error('LDAP search failed'));

        const adService = new ADService();
        await expect(adService.getLDAPGroupMembers(ldapClient, dn)).to.be.rejectedWith('LDAP search failed');

        sinon.assert.calledOnce(searchStub);
      });
    });
    describe('getLDAPGroups function', () => {
      let ldapClient: Client;
      const mockResponse = {
        searchEntries: [
          {
            objectGUID: Buffer.from('12345678', 'hex'),
            dn: 'CN=Test Group,OU=Groups,DC=example,DC=com',
            cn: 'Test Group',
            displayName: 'Test Group',
          },
        ],
        searchReferences: [] as string[],
      };

      beforeEach(() => {
        ldapClient = new Client({ url: 'ldap://example.com' });
        stubs.push(sinon.stub(Client.prototype, 'search').resolves(mockResponse));
      });

      afterEach(() => {
        stubs.forEach((stub) => stub.restore());
        stubs.splice(0, stubs.length);
      });

      it('should return searchEntries for a valid group DN', async () => {
        const adService = new ADService();
        const result = (await adService.getLDAPGroups<LDAPGroup>(ldapClient, process.env.LDAP_USER_BASE))[0];

        expect(result).to.have.property('displayName').that.is.an('string');
        expect(result.displayName).to.equal(mockResponse.searchEntries[0].displayName);
        expect(result).to.have.property('dn').that.is.an('string');
        expect(result.dn).to.equal(mockResponse.searchEntries[0].dn);
        expect(result).to.have.property('cn').that.is.an('string');
        expect(result.cn).to.equal(mockResponse.searchEntries[0].cn);
        expect(result.objectGUID).to.deep.equal(mockResponse.searchEntries[0].objectGUID);

        sinon.assert.calledOnceWithExactly(Client.prototype.search as sinon.SinonStub, process.env.LDAP_USER_BASE, {
          filter: '(CN=*)',
          explicitBufferAttributes: ['objectGUID'],
        });
      });
      it('should not throw an error if the search fails', async () => {
        const searchStub = Client.prototype.search as sinon.SinonStub;
        searchStub.rejects(new Error('LDAP search failed'));

        const adService = new ADService();
        await expect(adService.getLDAPGroups(ldapClient, process.env.LDAP_USER_BASE)).to.eventually.be.fulfilled;

        sinon.assert.calledOnce(searchStub);
      });
    });
    describe('update functions', () => {
      let ldapClient: Client;
      let adService: ADService;
      let roleManager: RoleManager;
      const sharedAccountMock = {
        objectGUID: Buffer.from('abcdef', 'hex'),
        dn: 'CN=SharedGroup,OU=Groups,DC=example,DC=com',
        displayName: 'SharedGroup',
      };
      const roleGroupMock = {
        objectGUID: Buffer.from('123456', 'hex'),
        dn: 'CN=RoleGroup,OU=Groups,DC=example,DC=com',
        displayName: 'RoleGroup',
      };
      const mockLDAPUser = {
        dn: 'CN=Test User,OU=Users,DC=example,DC=com',
        objectGUID: Buffer.from('654321', 'hex'),
        givenName: 'Test',
        sn: 'User',
        sAMAccountName: 'test.user',
        mail: 'test.user@example.com',
      };

      beforeEach(() => {
        ldapClient = new Client({ url: 'ldap://example.com' });
        adService = new ADService();
        roleManager = new RoleManager();
        sinon.stub(Client.prototype, 'search').resolves({
          searchEntries: [mockLDAPUser],
          searchReferences: [],
        });
        sinon.stub(LDAPAuthenticator, 'findOne')
        // @ts-ignore
          .withArgs({ where: { UUID: sharedAccountMock.objectGUID }, relations: ['user'] })
        // @ts-ignore
          .resolves({ user: { id: 1, displayName: sharedAccountMock.displayName } });
        // @ts-ignore
        sinon.stub(adService, 'getUsers').resolves([{ id: 1, email: 'test.user@example.com' }]);
        sinon.stub(roleManager, 'setRoleUsers').resolves();
        sinon.stub(AuthenticationService.prototype, 'setMemberAuthenticator').resolves();
      });

      afterEach(() => {
        sinon.restore();
      });

      describe('updateSharedAccountMembership function', () => {
        it('should update the members of a shared account', async () => {
          const ldapGroup = sharedAccountMock as LDAPGroup;
          await adService.updateSharedAccountMembership(ldapClient, ldapGroup);

          // Assertions
          sinon.assert.calledOnceWithExactly(Client.prototype.search as sinon.SinonStub, process.env.LDAP_BASE, {
            filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${ldapGroup.dn}))`,
            explicitBufferAttributes: ['objectGUID'],
          });
          sinon.assert.calledOnceWithExactly(LDAPAuthenticator.findOne as sinon.SinonStub, {
            where: { UUID: ldapGroup.objectGUID },
            relations: ['user'],
          });
          sinon.assert.calledOnce(adService.getUsers as sinon.SinonStub);
          sinon.assert.calledOnce(AuthenticationService.prototype.setMemberAuthenticator as sinon.SinonStub);
        });

        it('should throw an error if no authenticator is found for the shared account', async () => {
          sinon.restore();
          sinon.stub(LDAPAuthenticator, 'findOne').resolves(null);

          const ldapGroup = sharedAccountMock as LDAPGroup;
          await expect(adService.updateSharedAccountMembership(ldapClient, ldapGroup))
            .to.be.rejectedWith('No authenticator found for shared account');
        });
      });

      describe('updateRoleMembership function', () => {
        it('should update the members of a role', async () => {
          const ldapGroup = roleGroupMock as LDAPGroup;
          await adService.updateRoleMembership(ldapClient, ldapGroup, roleManager);

          // Assertions
          sinon.assert.calledOnceWithExactly(Client.prototype.search as sinon.SinonStub, process.env.LDAP_BASE, {
            filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${ldapGroup.dn}))`,
            explicitBufferAttributes: ['objectGUID'],
          });
          sinon.assert.calledOnce(adService.getUsers as sinon.SinonStub);
          sinon.assert.calledOnce(roleManager.setRoleUsers as sinon.SinonStub);
        });

        it('should not throw an error even if no users are found in the group', async () => {
          sinon.restore();
          sinon.stub(Client.prototype, 'search').resolves({
            searchEntries: [],
            searchReferences: [],
          });

          const ldapGroup = roleGroupMock as LDAPGroup;
          await expect(adService.updateRoleMembership(ldapClient, ldapGroup, roleManager))
            .to.eventually.be.fulfilled;

          sinon.assert.calledOnceWithExactly(Client.prototype.search as sinon.SinonStub, process.env.LDAP_BASE, {
            filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${ldapGroup.dn}))`,
            explicitBufferAttributes: ['objectGUID'],
          });
        });
      });
    });
  });
});
