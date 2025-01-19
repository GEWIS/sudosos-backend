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
            const UUID = Buffer.from('4321'.repeat(member.id), 'hex');
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
            const UUID = Buffer.from('4141'.repeat(organ.id), 'hex');
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
    });

    describe('fetch functions', () => {
      describe('fetchSharedAccounts function', () => {
        it('should create an account for new shared accounts', async () => {
        });
      });
    });
  });
});
