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
import { LDAPResponse, LDAPResult, LDAPUser } from '../../../../src/helpers/ad';
import { INTEGRATION_USER, inUserContext, ORGAN_USER, UserFactory } from '../../../helpers/user-factory';
import ADService from '../../../../src/service/ad-service';
import RBACService from '../../../../src/service/rbac-service';
import Role from '../../../../src/entity/rbac/role';

export function stubGroupSearch(stub: sinon.SinonStub, baseDN: string, returns: any, stubs: sinon.SinonStub[]) {
  stub.withArgs(baseDN, {
    filter: '(CN=*)',
    explicitBufferAttributes: ['objectGUID'],
  }).resolves(returns);
  stubs.push(stub);
}

export function stubMemberSearch(stub: sinon.SinonStub, dn: string, returns: any, stubs: sinon.SinonStub[]) {
  stub.withArgs(process.env.LDAP_BASE, {
    filter: `(&(objectClass=user)(objectCategory=person)(memberOf:1.2.840.113556.1.4.1941:=${dn}))`,
    explicitBufferAttributes: ['objectGUID'],
  }).resolves(returns);
  stubs.push(stub);
}

export function stubGUIDSearch(stub: sinon.SinonStub, value: Buffer, returns: any, stubs: sinon.SinonStub[]) {
  stub.withArgs(process.env.LDAP_BASE, {
    filter: new EqualityFilter({
      attribute: 'objectGUID',
      value,
    }),
    explicitBufferAttributes: ['objectGUID'],
  }).resolves(returns);
  stubs.push(stub);
}

export async function addLDAPAuthenticator(UUID: Buffer, user: User) {
  expect(await AppDataSource.manager.findOne(LDAPAuthenticator, {
    where: { UUID },
  })).to.be.null;

  return AppDataSource.manager.save(LDAPAuthenticator, {
    UUID,
    user,
  });
}

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
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] }, stubs);
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
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [{ member }] }, stubs);
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
            }, stubs);

            await ldapSyncService.pre();
            expect(await ldapSyncService.sync(organ)).to.be.true;
            const dbUser = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            userIsAsExpected(dbUser, { displayName } as LDAPUser);
          },
        );
      });

      it('should return true but not update user in dry-run mode', async () => {
        await inUserContext(
          await (await UserFactory(await ORGAN_USER())).clone(1),
          async (organ: User) => {
            const UUID = Buffer.from('9999', 'hex');
            await addLDAPAuthenticator(UUID, organ);

            // Intentionally "mess up" the user and snapshot the 'wrong' values
            await AppDataSource.manager.update(User, organ.id, {
              firstName: 'Wrong',
              lastName: 'Wrong',
              canGoIntoDebt: true,
              acceptedToS: TermsOfServiceStatus.ACCEPTED,
              active: false,
            });
            // Snapshot database state after the mess up
            const dbUserBefore = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            const messedUpState = {
              firstName: dbUserBefore.firstName,
              lastName: dbUserBefore.lastName,
              canGoIntoDebt: dbUserBefore.canGoIntoDebt,
              acceptedToS: dbUserBefore.acceptedToS,
              active: dbUserBefore.active,
            };

            const displayName = `${organ.firstName} Updated`;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, {
              searchReferences: [], searchEntries: [{
                displayName,
              }],
            }, stubs);

            await ldapSyncService.pre();
            expect(await ldapSyncService.sync(organ, true)).to.be.true;
            
            // The user in the database should remain unchanged from the 'messed up' values
            const dbUserAfter = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            expect(dbUserAfter.firstName).to.eq(messedUpState.firstName);
            expect(dbUserAfter.lastName).to.eq(messedUpState.lastName);
            expect(dbUserAfter.canGoIntoDebt).to.eq(messedUpState.canGoIntoDebt);
            expect(dbUserAfter.acceptedToS).to.eq(messedUpState.acceptedToS);
            expect(dbUserAfter.active).to.eq(messedUpState.active);
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
            }, stubs);

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
            const UUID = Buffer.from((member.id.toString().length % 2 ? '0' : '') + member.id.toString(), 'hex');
            expect(await ldapSyncService.guard(member)).to.be.false;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] }, stubs);
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
            const UUID = Buffer.from((organ.id.toString().length % 2 ? '0' : '') + organ.id.toString(), 'hex');
            expect(await ldapSyncService.guard(organ)).to.be.true;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] }, stubs);
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

      it('should not remove LDAPAuthenticator in dry-run mode', async () => {
        await inUserContext(
          await (await UserFactory()).clone(1),
          async (member: User) => {
            const UUID = Buffer.from((member.id.toString().length % 2 ? '0' : '') + member.id.toString(), 'hex');
            expect(await ldapSyncService.guard(member)).to.be.false;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] }, stubs);
            await ldapSyncService.pre();

            await addLDAPAuthenticator(UUID, member);
            expect(await ldapSyncService.sync(member)).to.be.false;

            await ldapSyncService.down(member, true);
            const auth = await LDAPAuthenticator.findOne({ where: { UUID } });
            expect(auth).to.not.be.null;
          },
        );
      });

      it('should not set users to deleted and inactive in dry-run mode', async () => {
        await inUserContext(
          await (await UserFactory(await ORGAN_USER())).clone(1),
          async (organ: User) => {
            const UUID = Buffer.from((organ.id.toString().length % 2 ? '0' : '') + organ.id.toString(), 'hex');
            expect(await ldapSyncService.guard(organ)).to.be.true;
            const stub = sinon.stub(Client.prototype, 'search');
            stubGUIDSearch(stub, UUID, { searchReferences: [], searchEntries: [] }, stubs);
            await ldapSyncService.pre();

            await addLDAPAuthenticator(UUID, organ);
            expect(await ldapSyncService.sync(organ)).to.be.false;

            const originalDeleted = organ.deleted;
            const originalActive = organ.active;

            await ldapSyncService.down(organ, true);
            const auth = await LDAPAuthenticator.findOne({ where: { UUID } });
            expect(auth).to.not.be.null;

            const dbUser = await AppDataSource.manager.findOne(User, { where: { id: organ.id } });
            expect(dbUser.deleted).to.eq(originalDeleted);
            expect(dbUser.active).to.eq(originalActive);
          },
        );
      });
    });

    describe('fetch functions', () => {
      let mockAdService: sinon.SinonStubbedInstance<ADService>;
      beforeEach(() => {
        mockAdService = sinon.createStubInstance(ADService);
        // @ts-ignore
        ldapSyncService.adService = mockAdService;
      });
      describe('fetchSharedAccounts function', () => {
        it('should create accounts for new shared accounts', async () => {
          const sharedAccountsMock = [
            { cn: 'shared1', objectGUID: 'guid1' },
            { cn: 'shared2', objectGUID: 'guid2' },
          ];

          const unboundMock = [
            { cn: 'shared1', objectGUID: 'guid1' },
          ];

          mockAdService.getLDAPGroups.resolves(sharedAccountsMock);
          mockAdService.filterUnboundGUID.resolves(unboundMock as unknown as LDAPResponse[]);
          mockAdService.toSharedUser.resolves();

          // eslint-disable-next-line @typescript-eslint/dot-notation
          await ldapSyncService['fetchSharedAccounts']();

          expect(mockAdService.toSharedUser.calledOnceWith(unboundMock[0] as unknown as LDAPResponse)).to.be.true;
        });
        it('should update membership of all shared accounts', async () => {
          const sharedAccountsMock = [
            { cn: 'shared1', objectGUID: 'guid1' },
            { cn: 'shared2', objectGUID: 'guid2' },
          ];
            
          mockAdService.getLDAPGroups.resolves(sharedAccountsMock);
          mockAdService.filterUnboundGUID.resolves([] as unknown as LDAPResponse[]);
          mockAdService.updateSharedAccountMembership.resolves();

          // eslint-disable-next-line @typescript-eslint/dot-notation
          await ldapSyncService['fetchSharedAccounts']();

          expect(mockAdService.updateSharedAccountMembership.calledWith(sinon.match.any, sharedAccountsMock[0] as unknown as LDAPResponse)).to.be.true;
          expect(mockAdService.updateSharedAccountMembership.calledWith(sinon.match.any, sharedAccountsMock[1] as unknown as LDAPResponse)).to.be.true;
        });
      });
      describe('fetchUserRoles function', () => {
        it('should update membership of all existing roles', async () => {
          const localRolesMock = [
            { cn: 'role1', objectGUID: 'guid1' },
            { cn: 'role2', objectGUID: 'guid2' },
          ];
          const rolesMock = [
            ...localRolesMock,
            { cn: 'role3', objectGUID: 'guid3' },
          ];
          
          const roles: Role[] = localRolesMock.map((r) => {
            return {
              name: r.cn,
            } as unknown as Role;
          });
          
          const stub = sinon.stub(RBACService, 'getRoles');
          stub.resolves([roles, 2]);
          stubs.push(stub);

          mockAdService.getLDAPGroups.resolves(rolesMock);
          // @ts-ignore
          await ldapSyncService.fetchUserRoles();

          expect(mockAdService.getLDAPGroups.calledOnceWith(sinon.match.any, process.env.LDAP_ROLE_FILTER)).to.be.true;
          expect(mockAdService.updateRoleMembership.calledWith(sinon.match.any, rolesMock[0] as unknown as LDAPResponse, sinon.match.any)).to.be.true;
          expect(mockAdService.updateRoleMembership.calledWith(sinon.match.any, rolesMock[1] as unknown as LDAPResponse, sinon.match.any)).to.be.true;
          expect(mockAdService.updateRoleMembership.calledWith(sinon.match.any, rolesMock[2] as unknown as LDAPResponse, sinon.match.any)).to.be.false;
        });
      });
      describe('fetchServiceAccounts function', () => {
        it('should create accounts for new service accounts', async () => {
          const newResult = {
            cn: 'service3',
            objectGUID: 'guid1',
          } as unknown as LDAPResult;

          const ldapResults: LDAPResult[] = [
            { cn: 'service1', objectGUID: 'guid1' },
            { cn: 'service2', objectGUID: 'guid2' },
            newResult,
          ] as unknown as LDAPResult[];

          const serviceAccountsMock = {
            searchEntries: ldapResults,
            searchReferences: [] as string[],
          };

          mockAdService.getLDAPGroupMembers.resolves(serviceAccountsMock);
          mockAdService.filterUnboundGUID.resolves([newResult]);
          // @ts-ignore
          await ldapSyncService.fetchServiceAccounts();

          expect(mockAdService.getLDAPGroupMembers.calledOnceWith(sinon.match.any, process.env.LDAP_SERVICE_ACCOUNT_FILTER)).to.be.true;
          expect(mockAdService.toServiceAccount.calledWith(ldapResults[0] as unknown as LDAPUser)).to.be.false;
          expect(mockAdService.toServiceAccount.calledWith(ldapResults[1] as unknown as LDAPUser)).to.be.false;
          expect(mockAdService.toServiceAccount.calledWith(ldapResults[2] as unknown as LDAPUser)).to.be.true;
        });
      });
      describe('fetch function', () => {
        it('should run all sync functions', async () => {
          setDefaultLDAPEnv();
          // @ts-ignore
          ldapSyncService.fetchSharedAccounts = sinon.stub().resolves();
          // @ts-ignore
          ldapSyncService.fetchUserRoles = sinon.stub().resolves();
          // @ts-ignore
          ldapSyncService.fetchServiceAccounts = sinon.stub().resolves();

          const result = await ldapSyncService.fetch();
          expect(result).to.be.undefined;
        });
      });
    });
  });
});
