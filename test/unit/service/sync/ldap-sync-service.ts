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

import User, { TermsOfServiceStatus, UserType } from '../../../../src/entity/user/user';
import { AppDataSource } from '../../../../src/database/database';
import {
  defaultAfter,
  defaultBefore,
  DefaultContext, restoreLDAPEnv,
  setDefaultLDAPEnv,
  storeLDAPEnv,
} from '../../../helpers/test-helpers';
import LdapSyncService from '../../../../src/service/sync/user/ldap-sync-service';
import { expect } from 'chai';
import LDAPAuthenticator from '../../../../src/entity/authenticator/ldap-authenticator';
import sinon from 'sinon';
import { Client, EqualityFilter } from 'ldapts';
import { LDAPUser } from '../../../../src/helpers/ad';
import { INTEGRATION_USER, inUserContext, ORGAN_USER, UserFactory } from '../../../helpers/user-factory';

describe('LdapSyncService', () => {
  let ctx: DefaultContext;

  let ldapEnvVariables: { [key: string]: any; } = {};

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    };

    ldapEnvVariables = storeLDAPEnv();
    setDefaultLDAPEnv();
  });

  after(async () => {
    restoreLDAPEnv(ldapEnvVariables);
    await defaultAfter(ctx);
  });

  let stubs: sinon.SinonStub[] = [];

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('guard function', () => {
    it('should return true if the user is of type ORGAN or INTEGRATION', async () => {
      await inUserContext(
        await (await UserFactory()).clone(3),
        async (organ: User, integration: User, local: User) => {
          organ.type = UserType.ORGAN;
          integration.type = UserType.INTEGRATION;
          local.type = UserType.LOCAL_USER;
          await User.save(organ);
          await User.save(integration);
          await User.save(local);

          const ldapSyncService = new LdapSyncService(ctx.roleManager);
          expect(await ldapSyncService.guard(organ)).to.be.true;
          expect(await ldapSyncService.guard(integration)).to.be.true;
          expect(await ldapSyncService.guard(local)).to.be.false;
        },
      );
    });
    it('should only return true for MEMBERS if they have an LDAPAuthenticator', async () => {
      await inUserContext(
        await (await UserFactory()).clone(1),
        async (member: User) => {
          const ldapSyncService = new LdapSyncService(ctx.roleManager);
          expect(await ldapSyncService.guard(member)).to.be.false;

          await AppDataSource.manager.save(LDAPAuthenticator, {
            UUID: Buffer.from('1234', 'hex'),
            user: member,
          });

          expect(await ldapSyncService.guard(member)).to.be.true;
        },
      );
    });
  });

  describe('ldap functions', () => {
    let ldapSyncService: LdapSyncService;

    before(async () => {
      ldapSyncService = new LdapSyncService(ctx.roleManager);
    });

    after(async () => {
      await ldapSyncService.post();
    });

    beforeEach(() => {
      stubs.push(sinon.stub(Client.prototype, 'bind').resolves(null));
    });
    
    function stubGroupSearch(stub: sinon.SinonStub, baseDN: string, returns: any) {
      stub.withArgs(baseDN, {
        filter: '(CN=*)',
        explicitBufferAttributes: ['objectGUID'],
      }).resolves(returns);
      stubs.push(stub);
    }

    function stubMemberSearch(stub: sinon.SinonStub, dn: string, returns: any) {
      stub.withArgs(process.env.LDAP_BASE, {
        filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
        explicitBufferAttributes: ['objectGUID'],
      }).resolves(returns);
      stubs.push(stub);
    }

    function stubGUIDSearch(stub: sinon.SinonStub, value: Buffer, returns: any) {
      stub.withArgs(process.env.LDAP_BASE, {
        filter: new EqualityFilter({
          attribute: 'objectGUID',
          value,
        }),
        explicitBufferAttributes: ['objectGUID'],
      }).resolves(returns);
      stubs.push(stub);
    }

    async function addLDAPAuthenticator(UUID: Buffer, user: User) {
      expect(await AppDataSource.manager.findOne(LDAPAuthenticator, {
        where: { UUID },
      })).to.be.null;

      return AppDataSource.manager.save(LDAPAuthenticator, {
        UUID,
        user,
      });
    }

    function userIsAsExpected(user: User, ldapUser: LDAPUser) {
      expect(user.firstName).to.be.equal(ldapUser.displayName);
      expect(user.lastName).to.be.equal('');
      expect(user.canGoIntoDebt).to.be.false;
      expect(user.acceptedToS).to.be.equal(TermsOfServiceStatus.NOT_REQUIRED);
      expect(user.active).to.be.true;
    }

    describe('sync function', () => {
      it('should return false if user no AD entry matching the LDAPAuthenticator UUID', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (member: User) => {
            const UUID = Buffer.from('4321', 'hex');
            expect(await ldapSyncService.guard(member)).to.be.false;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] });
            await ldapSyncService.pre();

            await addLDAPAuthenticator(UUID, member);
            expect(await ldapSyncService.sync(member)).to.be.false;
          },
        );
      });
      it('should return true if user has AD entry matching the LDAPAuthenticator UUID', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (member: User) => {
            const UUID = Buffer.from('4444', 'hex');
            await addLDAPAuthenticator(UUID, member);

            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [{ member }] });
            await ldapSyncService.pre();

            expect(await ldapSyncService.sync(member)).to.be.true;
          },
        );
      });
      it('should return true and update user if user is of type ORGAN with known LDAPAuthenticator', async () => {
        await inUserContext(
          await (await UserFactory(await ORGAN_USER())).clone(1),
          async (organ: User) => {
            const UUID = Buffer.from('8989', 'hex');
            await addLDAPAuthenticator(UUID, organ);

            // Intentionally "mess up" the user
            await AppDataSource.manager.update(User, organ.id, {
              firstName: 'Wrong',
              lastName: 'Wrong',
              canGoIntoDebt: true,
              acceptedToS: TermsOfServiceStatus.ACCEPTED,
              active: false,
            });

            const displayName = `${organ.firstName} Updated`;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, {
              searchReferences: [], searchEntries: [{
                displayName,
              }],
            });

            await ldapSyncService.pre();
            expect(await ldapSyncService.sync(organ)).to.be.true;
            const dbUser = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            userIsAsExpected(dbUser, { displayName } as LDAPUser);
          },
        );
      });
      it('should return true and update user if user is of type INTEGRATION with known LDAPAuthenticator', async () => {
        await inUserContext(
          await (await UserFactory(await INTEGRATION_USER())).clone(1),
          async (organ: User) => {
            const UUID = Buffer.from('4141', 'hex');
            await addLDAPAuthenticator(UUID, organ);

            // Intentionally "mess up" the user
            await AppDataSource.manager.update(User, organ.id, {
              firstName: 'Wrong',
              lastName: 'Wrong',
              canGoIntoDebt: true,
              acceptedToS: TermsOfServiceStatus.ACCEPTED,
              active: false,
            });

            const displayName = `${organ.firstName} Updated`;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, {
              searchReferences: [], searchEntries: [{
                displayName,
              }],
            });

            await ldapSyncService.pre();
            expect(await ldapSyncService.sync(organ)).to.be.true;
            const dbUser = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            userIsAsExpected(dbUser, { displayName } as LDAPUser);
          },
        );
      });
      it('should return false if user has no LDAPAuthenticator', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (member: User) => {
            expect(await ldapSyncService.sync(member)).to.be.false;
          },
        );
      });
    });

    describe('down function', () => {
      it('should remove the LDAPAuthenticator for the given user', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (member: User) => {
            const UUID = Buffer.from('4321'.repeat(member.id), 'hex');
            expect(await ldapSyncService.guard(member)).to.be.false;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] });
            await ldapSyncService.pre();

            await addLDAPAuthenticator(UUID, member);
            expect(await ldapSyncService.sync(member)).to.be.false;

            await ldapSyncService.down(member);
            const auth = await LDAPAuthenticator.findOne({ where: { UUID } });
            expect(auth).to.be.null;
          },
        );
      });
      it('should set INTEGRATION and ORGAN users to deleted and inactive', async () => {
        await inUserContext(
          await (await UserFactory(await ORGAN_USER())).clone(1),
          async (organ: User) => {
            const UUID = Buffer.from('4141'.repeat(organ.id), 'hex');
            expect(await ldapSyncService.guard(organ)).to.be.true;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] });
            await ldapSyncService.pre();

            await addLDAPAuthenticator(UUID, organ);
            expect(await ldapSyncService.sync(organ)).to.be.false;

            await ldapSyncService.down(organ);
            const auth = await LDAPAuthenticator.findOne({ where: { UUID } });
            expect(auth).to.be.null;

            const dbUser = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            expect(dbUser.deleted).to.be.true;
            expect(dbUser.active).to.be.false;
          },
        );
      });
    });

    describe('fetch functions', () => {
      describe('fetchSharedAccounts function', () => {
        it('should create an account for new shared accounts', async () => {
        });
      });
    });
  });


  // TODO: move these test cases to ad-sync-service test cases
  // describe('syncSharedAccounts functions', () => {
  //   async function createAccountsFromLDAP(accounts: any[]) {
  //     async function createAccounts(manager: EntityManager, acc: any[]): Promise<any> {
  //       const users: User[] = [];
  //       const promises: Promise<any>[] = [];
  //       acc.forEach((m) => {
  //         promises.push(new AuthenticationService(manager).createUserAndBind(m)
  //           .then((u) => users.push(u)));
  //       });
  //       await Promise.all(promises);
  //       return users;
  //     }
  //
  //     let result: any[];
  //     await ctx.connection.transaction(async (manager) => {
  //       result = await createAccounts(manager, accounts);
  //     });
  //     return result;
  //   }
  //   it('should create an account for new shared accounts', async () => {
  //     const newADSharedAccount = {
  //       objectGUID: Buffer.from('111111', 'hex'),
  //       displayName: 'Shared Organ #1',
  //       dn: 'CN=SudoSOSAccount - Shared Organ #1,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
  //     };
  //
  //     const auth = await LDAPAuthenticator.findOne(
  //       { where: { UUID: newADSharedAccount.objectGUID } },
  //     );
  //     expect(auth).to.be.null;
  //
  //     const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub = sinon.stub(Client.prototype, 'search').resolves({ searchReferences: [], searchEntries: [] });
  //
  //     clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
  //       filter: '(CN=*)',
  //       explicitBufferAttributes: ['objectGUID'],
  //     }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });
  //
  //     stubs.push(clientBindStub);
  //     stubs.push(clientSearchStub);
  //
  //     const organCount = await User.count({ where: { type: UserType.ORGAN } });
  //     await new ADService().syncSharedAccounts();
  //
  //     expect(await User.count({ where: { type: UserType.ORGAN } })).to.be.equal(organCount + 1);
  //     const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;
  //
  //     expect(newOrgan.firstName).to.be.equal(newADSharedAccount.displayName);
  //     expect(newOrgan.lastName).to.be.equal('');
  //     expect(newOrgan.type).to.be.equal(UserType.ORGAN);
  //   });
  //   it('should give member access to shared account', async () => {
  //     const newADSharedAccount = {
  //       objectGUID: Buffer.from('22', 'hex'),
  //       displayName: 'Shared Organ #2',
  //       dn: 'CN=SudoSOSAccount - Shared Organ #2,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
  //     };
  //
  //     const auth = await LDAPAuthenticator.findOne(
  //       { where: { UUID: newADSharedAccount.objectGUID } },
  //     );
  //     expect(auth).to.be.null;
  //
  //     const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub = sinon.stub(Client.prototype, 'search');
  //
  //     const sharedAccountMember = {
  //       dn: 'CN=Sudo SOS (m4141),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl',
  //       memberOfFlattened: [
  //         'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
  //       ],
  //       givenName: 'Sudo Organ #2',
  //       sn: 'SOS',
  //       objectGUID: Buffer.from('4141', 'hex'),
  //       sAMAccountName: 'm4141',
  //       mail: 'm4141@gewis.nl',
  //       // TODO: Fix this type inconsistency between ADUser and ldapts.Client
  //       mNumber: '4141' as string & number,
  //       whenChanged: new Date().toISOString(),
  //       displayName: 'Sudo Organ #2',
  //     };
  //
  //     let user: User;
  //     await ctx.connection.transaction(async (manager) => {
  //       user = await new AuthenticationService(manager).createUserAndBind(sharedAccountMember);
  //     });
  //
  //     clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
  //       filter: '(CN=*)',
  //       explicitBufferAttributes: ['objectGUID'],
  //     }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });
  //
  //     clientSearchStub.withArgs(process.env.LDAP_BASE, {
  //       filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
  //       explicitBufferAttributes: ['objectGUID'],
  //     })
  //       .resolves({ searchReferences: [], searchEntries: [sharedAccountMember] });
  //
  //     stubs.push(clientBindStub);
  //     stubs.push(clientSearchStub);
  //
  //     await new ADService().syncSharedAccounts();
  //
  //     const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;
  //
  //     const canAuthenticateAs = await MemberAuthenticator.find(
  //       { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
  //     );
  //
  //     expect(canAuthenticateAs.length).to.be.equal(1);
  //     expect(canAuthenticateAs[0].user.id).to.be.equal(user.id);
  //   });
  //   it('should update the members of an existing shared account', async () => {
  //     const newADSharedAccount = {
  //       objectGUID: Buffer.from('39', 'hex'),
  //       displayName: 'Shared Organ #3',
  //       dn: 'CN=SudoSOSAccount - Shared Organ #3,OU=SudoSOS Shared Accounts,OU=Groups,DC=sudososwg,DC=sudosos,DC=nl',
  //     };
  //
  //     const auth = await LDAPAuthenticator.findOne(
  //       { where: { UUID: newADSharedAccount.objectGUID } },
  //     );
  //     expect(auth).to.be.null;
  //
  //     const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub = sinon.stub(Client.prototype, 'search');
  //
  //     const sharedAccountMemberConstruction = (number: number) => ({
  //       dn: `CN=Sudo SOS (m${number}),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl`,
  //       memberOfFlattened: [
  //         'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
  //       ],
  //       givenName: `Sudo Organ #3 ${number}`,
  //       sn: 'SOS',
  //       mNumber: `${number}`,
  //       objectGUID: Buffer.from((number.toString().length % 2 ? '0' : '') + number.toString(), 'hex'),
  //       sAMAccountName: `m${number}`,
  //       mail: `m${number}@gewis.nl`,
  //     });
  //
  //     let sharedAccountMembers = [sharedAccountMemberConstruction(10),
  //       sharedAccountMemberConstruction(21)];
  //
  //     const firstMembers = await createAccountsFromLDAP(sharedAccountMembers);
  //
  //     clientSearchStub.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
  //       filter: '(CN=*)',
  //       explicitBufferAttributes: ['objectGUID'],
  //     }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });
  //
  //     clientSearchStub.withArgs(process.env.LDAP_BASE, {
  //       filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
  //       explicitBufferAttributes: ['objectGUID'],
  //     })
  //       .resolves({ searchReferences: [], searchEntries: sharedAccountMembers });
  //
  //     stubs.push(clientBindStub);
  //     stubs.push(clientSearchStub);
  //
  //     await new ADService().syncSharedAccounts();
  //
  //     // Should contain the first users
  //     const newOrgan = (await LDAPAuthenticator.findOne({ where: { UUID: newADSharedAccount.objectGUID }, relations: ['user'] })).user;
  //     expect(newOrgan).to.not.be.undefined;
  //
  //     const canAuthenticateAs = await MemberAuthenticator.find(
  //       { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
  //     );
  //     let canAuthenticateAsIDs = canAuthenticateAs.map((mAuth) => mAuth.user.id);
  //
  //     expect(canAuthenticateAsIDs).to.deep.equalInAnyOrder(firstMembers.map((u: any) => u.id));
  //
  //     stubs.forEach((stub) => stub.restore());
  //     stubs.splice(0, stubs.length);
  //     // stubs = [];
  //
  //     const clientBindStub2 = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub2 = sinon.stub(Client.prototype, 'search');
  //
  //     sharedAccountMembers = [sharedAccountMemberConstruction(11),
  //       sharedAccountMemberConstruction(3)];
  //
  //     const secondMembers = await createAccountsFromLDAP(sharedAccountMembers);
  //
  //     clientSearchStub2.withArgs(process.env.LDAP_SHARED_ACCOUNT_FILTER, {
  //       filter: '(CN=*)',
  //       explicitBufferAttributes: ['objectGUID'],
  //     }).resolves({ searchReferences: [], searchEntries: [newADSharedAccount] });
  //
  //     clientSearchStub2.withArgs(process.env.LDAP_BASE, {
  //       filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${newADSharedAccount.dn}))`,
  //       explicitBufferAttributes: ['objectGUID'],
  //     })
  //       .resolves({ searchReferences: [], searchEntries: sharedAccountMembers });
  //
  //     stubs.push(clientBindStub2);
  //     stubs.push(clientSearchStub2);
  //
  //     await new ADService().syncSharedAccounts();
  //
  //     canAuthenticateAsIDs = (await MemberAuthenticator.find(
  //       { where: { authenticateAs: { id: newOrgan.id } }, relations: ['user'] },
  //     )).map((mAuth) => mAuth.user.id);
  //
  //     const currentMemberIDs = secondMembers.map((u: any) => u.id);
  //     expect(canAuthenticateAsIDs).to.deep.equalInAnyOrder(currentMemberIDs);
  //   });
  // });
  // describe('syncUserRoles function', () => {
  //   it('should assign roles to members of the group in AD', async () => {
  //     process.env.ENABLE_LDAP = 'true';
  //
  //     const newUser = { ...(ctx.validADUser(await User.count() + 2)) };
  //     const existingUser = { ...(ctx.validADUser(await User.count() + 3)) };
  //
  //     await new ADService().createAccountIfNew([existingUser]);
  //     // precondition.
  //     expect(await LDAPAuthenticator.findOne(
  //       { where: { UUID: newUser.objectGUID } },
  //     )).to.be.null;
  //     expect(await LDAPAuthenticator.findOne(
  //       { where: { UUID: existingUser.objectGUID } },
  //     )).to.exist;
  //
  //     const roleGroup: LDAPGroup = {
  //       cn: 'SudoSOS - Test',
  //       displayName: 'Test group',
  //       dn: 'CN=PRIV - SudoSOS Test,OU=SudoSOS Roles,OU=Groups,DC=gewiswg,DC=gewis,DC=nl',
  //       objectGUID: Buffer.from('1234', 'hex'),
  //       whenChanged: '',
  //     };
  //
  //     const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub = sinon.stub(Client.prototype, 'search');
  //
  //     clientSearchStub.withArgs(process.env.LDAP_ROLE_FILTER, {
  //       filter: '(CN=*)',
  //       explicitBufferAttributes: ['objectGUID'],
  //     }).resolves({ searchReferences: [], searchEntries: [roleGroup as any] });
  //
  //     clientSearchStub.withArgs(process.env.LDAP_BASE, {
  //       filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${roleGroup.dn}))`,
  //       explicitBufferAttributes: ['objectGUID'],
  //     })
  //       .resolves({ searchReferences: [], searchEntries: [newUser as any, existingUser as any] });
  //
  //     stubs.push(clientBindStub);
  //     stubs.push(clientSearchStub);
  //
  //     await new RbacSeeder().seed([{
  //       name: 'SudoSOS - Test',
  //       permissions: {
  //       },
  //       assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: { name: 'SudoSOS - Test' }, user: { id: user.id } } }) !== undefined,
  //     }]);
  //
  //     const roleManager = await new RoleManager().initialize();
  //
  //     await new ADService().syncUserRoles(roleManager);
  //     const auth = (await LDAPAuthenticator.findOne(
  //       { where: { UUID: newUser.objectGUID }, relations: ['user'] },
  //     ));
  //     expect(auth).to.exist;
  //     const { user } = auth;
  //     userIsAsExpected(user, newUser);
  //
  //     const users = await new ADService().getUsers([newUser as LDAPUser, existingUser as LDAPUser]);
  //     expect(await AssignedRole.findOne({ where: { role: { name: 'SudoSOS - Test' }, user: { id: users[0].id } } })).to.exist;
  //     expect(await AssignedRole.findOne({ where: { role: { name: 'SudoSOS - Test' }, user: { id: users[1].id } } })).to.exist;
  //   });
  // });
  // describe('run function', () => {
  //   it('should create new users if needed', async () => {
  //     process.env.ENABLE_LDAP = 'true';
  //
  //     const newUser = { ...(ctx.validADUser(await User.count() + 23)) };
  //     const clientBindStub = sinon.stub(Client.prototype, 'bind').resolves(null);
  //     const clientSearchStub = sinon.stub(Client.prototype, 'search');
  //
  //     clientSearchStub.withArgs(process.env.LDAP_BASE, {
  //       filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${process.env.LDAP_USER_BASE}))`,
  //       explicitBufferAttributes: ['objectGUID'],
  //     })
  //       .resolves({ searchReferences: [], searchEntries: [newUser as any] });
  //
  //     stubs.push(clientBindStub);
  //     stubs.push(clientSearchStub);
  //
  //     await new ADService().run();
  //     const auth = (await LDAPAuthenticator.findOne(
  //       { where: { UUID: newUser.objectGUID }, relations: ['user'] },
  //     ));
  //     expect(auth).to.exist;
  //     const { user } = auth;
  //     userIsAsExpected(user, newUser);
  //   });
  // });
});
