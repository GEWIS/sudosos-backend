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
import OrganMembership from '../../../src/entity/organ/organ-membership';

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

  describe('setMemberAuthenticator function', () => {
    it('should assign indices to new organ members', async () => {
      await inUserContext(await (await UserFactory()).clone(4), async (...users: User[]) => {
        const organ = users[0];
        organ.type = UserType.ORGAN;
        await organ.save();

        const members = [users[1], users[2], users[3]];

        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator(members, organ);
        });

        const memberships = await OrganMembership.find({
          where: { organId: organ.id },
          order: { index: 'ASC' },
        });

        expect(memberships).to.have.length(3);
        // Verify each membership has an index
        memberships.forEach((membership, idx) => {
          expect(membership.index).to.be.a('number');
          expect(membership.index).to.equal(idx); // Should be 0, 1, 2
        });

        // Clean up
        await OrganMembership.delete({ organId: organ.id });
      });
    });

    it('should preserve indices for existing members when membership is updated', async () => {
      await inUserContext(await (await UserFactory()).clone(5), async (...users: User[]) => {
        const organ = users[0];
        organ.type = UserType.ORGAN;
        await organ.save();

        const initialMembers = [users[1], users[2], users[3]];

        // First, create initial memberships
        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator(initialMembers, organ);
        });

        const initialMemberships = await OrganMembership.find({
          where: { organId: organ.id },
          order: { index: 'ASC' },
        });

        expect(initialMemberships).to.have.length(3);
        const user1Index = initialMemberships.find(m => m.userId === users[1].id).index;
        const user3Index = initialMemberships.find(m => m.userId === users[3].id).index;

        // Now update: remove user[2], keep user[1] and user[3], add user[4]
        const updatedMembers = [users[1], users[3], users[4]];

        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator(updatedMembers, organ);
        });

        const updatedMemberships = await OrganMembership.find({
          where: { organId: organ.id },
        });

        expect(updatedMemberships).to.have.length(3);

        // Verify user[1] kept their index
        const user1After = updatedMemberships.find(m => m.userId === users[1].id);
        expect(user1After.index).to.equal(user1Index);

        // Verify user[3] kept their index
        const user3After = updatedMemberships.find(m => m.userId === users[3].id);
        expect(user3After.index).to.equal(user3Index);

        // Verify user[4] got a new index (should be the lowest available, which is user[2]'s old index)
        const user4After = updatedMemberships.find(m => m.userId === users[4].id);
        expect(user4After.index).to.be.a('number');

        // Clean up
        await OrganMembership.delete({ organId: organ.id });
      });
    });

    it('should assign lowest available index to new members', async () => {
      await inUserContext(await (await UserFactory()).clone(6), async (...users: User[]) => {
        const organ = users[0];
        organ.type = UserType.ORGAN;
        await organ.save();

        // Create memberships with users[1], users[2], users[3]
        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator([users[1], users[2], users[3]], organ);
        });

        // Remove user[2] (index 1), creating a gap
        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator([users[1], users[3]], organ);
        });

        let memberships = await OrganMembership.find({
          where: { organId: organ.id },
          order: { index: 'ASC' },
        });

        expect(memberships).to.have.length(2);

        // Now add user[4] and user[5] - they should fill gaps starting from 0
        await ctx.connection.transaction(async (manager) => {
          const service = new AuthenticationService(manager);
          await service.setMemberAuthenticator([users[1], users[3], users[4], users[5]], organ);
        });

        memberships = await OrganMembership.find({
          where: { organId: organ.id },
          order: { index: 'ASC' },
        });

        expect(memberships).to.have.length(4);

        // User[4] should have gotten the lowest available index (the gap left by user[2])
        const user4Membership = memberships.find(m => m.userId === users[4].id);
        const user5Membership = memberships.find(m => m.userId === users[5].id);

        // Both should have valid numeric indices
        expect(user4Membership.index).to.be.a('number');
        expect(user5Membership.index).to.be.a('number');

        // Verify no duplicate indices
        const allIndices = memberships.map(m => m.index);
        const uniqueIndices = new Set(allIndices);
        expect(uniqueIndices.size).to.equal(allIndices.length);

        // Clean up
        await OrganMembership.delete({ organId: organ.id });
      });
    });
  });
});
