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
import { describe } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { DataSource } from 'typeorm';
import UserService, { parseGetUsersFilters, parseGetFinancialMutationsFilters, asUserResponse } from '../../../src/service/user-service';
import User, { LocalUserTypes, TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import WelcomeWithReset from '../../../src/mailer/messages/welcome-with-reset';
import WelcomeToSudosos from '../../../src/mailer/messages/welcome-to-sudosos';
import Mailer from '../../../src/mailer';
import AuthenticationService from '../../../src/service/authentication-service';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import {
  UserSeeder, PointOfSaleSeeder, ContainerSeeder, ProductSeeder, VatGroupSeeder,
  ProductCategorySeeder, TransactionSeeder, TransferSeeder,
} from '../../seed';
import OrganMembership from '../../../src/entity/organ/organ-membership';
import AssignedRole from '../../../src/entity/rbac/assigned-role';
import Role from '../../../src/entity/rbac/role';
import BalanceService from '../../../src/service/balance-service';
import MemberUser from '../../../src/entity/user/member-user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import UserTypeUpdatedWithReset from '../../../src/mailer/messages/user-type-updated-with-reset';
import UserTypeUpdated from '../../../src/mailer/messages/user-type-updated';
import LocalAuthenticator from '../../../src/entity/authenticator/local-authenticator';

describe('UserService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource;
    users: User[];
    roles: Role[];
    organs: User[];
    pointsOfSale: PointOfSale[];
    pointOfSaleUsers: User[];
    transactions: Transaction[];
    transfers: Transfer[];
  };
  let sendStub: sinon.SinonStub;
  let createResetTokenStub: sinon.SinonStub;

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const organs = users.filter((u) => u.type === UserType.ORGAN);
    const memberUsers = users.filter((u) => u.type === UserType.MEMBER);
    await new UserSeeder().seedMemberAuthenticators(memberUsers, organs);
    await new UserSeeder().seedHashAuthenticator(users, LocalAuthenticator, users.length);

    // Create roles for testing
    const role1 = await Role.save({ name: 'TestRole1', systemDefault: false } as Role);
    const role2 = await Role.save({ name: 'TestRole2', systemDefault: false } as Role);

    // Create point of sale for testing pointOfSaleId filter
    const categories = await new ProductCategorySeeder().seed();
    const vatGroups = await new VatGroupSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed(users, categories, vatGroups);
    const { containerRevisions } = await new ContainerSeeder().seed(users, productRevisions);
    const { pointsOfSale, pointOfSaleUsers, pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);

    // Seed transactions and transfers for getUserFinancialMutations tests
    const begin = new Date('2020-01-01');
    const end = new Date('2024-12-31');
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions, begin, end);
    const transfers = await new TransferSeeder().seed(users, begin, end);

    ctx = {
      connection,
      users,
      roles: [role1, role2],
      organs,
      pointsOfSale,
      pointOfSaleUsers,
      transactions,
      transfers,
    };
  });

  beforeEach(() => {
    // Setup mailer stub
    sendStub = sinon.stub().resolves();
    sinon.stub(Mailer, 'getInstance').returns({ send: sendStub } as any);

    // Setup authentication service stub
    createResetTokenStub = sinon.stub(AuthenticationService.prototype, 'createResetToken')
      .resolves({ token: 'reset-token' } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('parseGetUsersFilters', () => {
    it('should parse all filter parameters correctly', () => {
      const req = {
        query: {
          search: 'test search',
          active: 'true',
          ofAge: 'false',
          id: '123',
          deleted: 'true',
          type: 'MEMBER',
          organ: '456',
          assignedRoleIds: ['1', '2'],
        },
      } as any as RequestWithToken;

      const filters = parseGetUsersFilters(req);

      expect(filters.search).to.equal('test search');
      expect(filters.active).to.be.true;
      expect(filters.ofAge).to.be.false;
      expect(filters.id).to.equal(123);
      expect(filters.deleted).to.be.true;
      expect(filters.type).to.equal(UserType.MEMBER);
      expect(filters.organId).to.equal(456);
      expect(filters.assignedRoleIds).to.deep.equal([1, 2]);
    });

    it('should handle single assignedRoleId', () => {
      const req = {
        query: {
          assignedRoleIds: '1',
        },
      } as any as RequestWithToken;

      const filters = parseGetUsersFilters(req);

      expect(filters.assignedRoleIds).to.deep.equal([1]);
    });

    it('should handle missing optional parameters', () => {
      const req = {
        query: {},
      } as any as RequestWithToken;

      const filters = parseGetUsersFilters(req);

      expect(filters.search).to.be.undefined;
      expect(filters.active).to.be.undefined;
      expect(filters.id).to.be.undefined;
      expect(filters.deleted).to.be.false;
    });
  });

  describe('parseGetFinancialMutationsFilters', () => {
    it('should parse date filters correctly', () => {
      const req = {
        query: {
          fromDate: '2024-01-01',
          tillDate: '2024-12-31',
        },
      } as any as RequestWithToken;

      const filters = parseGetFinancialMutationsFilters(req);

      expect(filters.fromDate).to.not.be.undefined;
      expect(filters.tillDate).to.not.be.undefined;
    });

    it('should handle missing date parameters', () => {
      const req = {
        query: {},
      } as any as RequestWithToken;

      const filters = parseGetFinancialMutationsFilters(req);

      expect(filters.fromDate).to.be.undefined;
      expect(filters.tillDate).to.be.undefined;
    });
  });

  describe('asUserResponse', () => {
    it('should return undefined for null user', () => {
      const result = asUserResponse(null);
      expect(result).to.be.undefined;
    });

    it('should convert user to response without timestamps', () => {
      const user = Object.assign(new User(), {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        nickname: 'Johnny',
        active: true,
        deleted: false,
        type: UserType.MEMBER,
        email: 'john@example.com',
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        extensiveDataProcessing: true,
        ofAge: true,
        canGoIntoDebt: false,
      });

      const result = asUserResponse(user);

      expect(result.id).to.equal(1);
      expect(result.firstName).to.equal('John');
      expect(result.lastName).to.equal('Doe');
      expect(result.nickname).to.equal('Johnny');
      expect(result.createdAt).to.be.undefined;
      expect(result.updatedAt).to.be.undefined;
      expect(result.email).to.be.undefined; // MEMBER type doesn't show email
    });

    it('should include email for LOCAL_USER type', () => {
      const user = Object.assign(new User(), {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        type: UserType.LOCAL_USER,
        email: 'john@example.com',
      });

      const result = asUserResponse(user);

      expect(result.email).to.equal('john@example.com');
    });

    it('should include timestamps when requested', () => {
      const user = Object.assign(new User(), {
        id: 1,
        firstName: 'John',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      const result = asUserResponse(user, true);

      expect(result.createdAt).to.not.be.undefined;
      expect(result.updatedAt).to.not.be.undefined;
    });

    it('should include memberId when memberUser exists', () => {
      const memberUser = Object.assign(new MemberUser(), {
        memberId: 12345,
      });
      const user = Object.assign(new User(), {
        id: 1,
        firstName: 'John',
        type: UserType.MEMBER,
        memberUser,
      });

      const result = asUserResponse(user);

      expect(result.memberId).to.equal(12345);
      expect(result.gewisId).to.equal(12345);
    });
  });

  describe('getRelations', () => {
    it('should return relations with default base', () => {
      const relations = UserService.getRelations();
      expect(relations).to.have.property('user');
      expect(relations.user).to.have.property('memberUser');
    });

    it('should return relations with custom base', () => {
      const relations = UserService.getRelations({ base: 'customBase' });
      expect(relations).to.have.property('customBase');
    });

    it('should return direct relations when base is empty string', () => {
      const relations = UserService.getRelations({ base: '' });
      expect(relations).to.have.property('memberUser');
      expect(relations).to.not.have.property('user');
    });

    it('should include pointOfSale when pos is true', () => {
      const relations = UserService.getRelations({ pos: true });
      expect(relations.user).to.have.property('pointOfSale');
    });
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      const result = await UserService.getUsers({}, { take: 10, skip: 0 });

      expect(result).to.have.property('records');
      expect(result).to.have.property('_pagination');
      expect(result.records.length).to.be.greaterThan(0);
    });

    it('should filter by active status', async () => {
      const result = await UserService.getUsers({ active: true }, { take: 100 });

      result.records.forEach((user) => {
        expect(user.active).to.be.true;
      });
    });

    it('should filter by user type', async () => {
      const result = await UserService.getUsers({ type: UserType.MEMBER }, { take: 100 });

      result.records.forEach((user) => {
        expect(user.type).to.equal(UserType.MEMBER);
      });
    });

    it('should filter by id', async () => {
      const userId = ctx.users[0].id;
      const result = await UserService.getUsers({ id: userId }, { take: 100 });

      expect(result.records.length).to.equal(1);
      expect(result.records[0].id).to.equal(userId);
    });

    it('should filter by multiple ids', async () => {
      const userIds = [ctx.users[0].id, ctx.users[1].id];
      const result = await UserService.getUsers({ id: userIds }, { take: 100 });

      expect(result.records.length).to.equal(2);
      expect(result.records.map((u) => u.id)).to.include.members(userIds);
    });

    it('should filter by organId', async () => {
      if (ctx.organs.length > 0) {
        const organId = ctx.organs[0].id;
        const result = await UserService.getUsers({ organId }, { take: 100 });

        expect(result.records.length).to.be.greaterThan(0);
      }
    });

    it('should filter by assignedRoleIds', async () => {
      // Assign role to a user
      const user = ctx.users[0];
      await UserService.addUserRole(user, ctx.roles[0]);

      const result = await UserService.getUsers({ assignedRoleIds: [ctx.roles[0].id] }, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.true;
    });

    it('should search by name', async () => {
      const user = ctx.users[0];
      const result = await UserService.getUsers({ search: user.firstName }, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.true;
    });

    it('should search by email for local users', async () => {
      const localUser = ctx.users.find((u) => u.type === UserType.LOCAL_USER);
      if (localUser && localUser.email) {
        const result = await UserService.getUsers({ search: localUser.email }, { take: 100 });

        expect(result.records.some((u) => u.id === localUser.id)).to.be.true;
      }
    });

    it('should exclude deleted users by default', async () => {
      const user = ctx.users[0];
      user.deleted = true;
      await user.save();

      const result = await UserService.getUsers({}, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.false;

      user.deleted = false;
      await user.save();
    });

    it('should include deleted users when allowDeleted is true', async () => {
      const user = ctx.users[0];
      user.deleted = true;
      await user.save();

      const result = await UserService.getUsers({ allowDeleted: true }, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.true;

      user.deleted = false;
      await user.save();
    });

    it('should exclude POINT_OF_SALE users by default', async () => {
      const result = await UserService.getUsers({}, { take: 100 });

      result.records.forEach((user) => {
        expect(user.type).to.not.equal(UserType.POINT_OF_SALE);
      });
    });

    it('should handle empty search results', async () => {
      const result = await UserService.getUsers({ search: 'nonexistentuser12345' }, { take: 100 });

      expect(result.records.length).to.equal(0);
    });

    it('should search with multiple terms', async () => {
      const user = ctx.users[0];
      const result = await UserService.getUsers({ search: `${user.firstName} ${user.lastName}` }, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.true;
    });

    it('should search by nickname', async () => {
      const user = ctx.users.find((u) => u.nickname);
      if (user && user.nickname) {
        const result = await UserService.getUsers({ search: user.nickname }, { take: 100 });

        expect(result.records.some((u) => u.id === user.id)).to.be.true;
      }
    });

    it('should filter by pointOfSaleId', async () => {
      if (ctx.pointsOfSale.length > 0) {
        const pos = ctx.pointsOfSale[0];
        const result = await UserService.getUsers({ pointOfSaleId: pos.id }, { take: 100 });

        expect(result.records.length).to.be.greaterThan(0);
        expect(result.records.some((u) => u.id === pos.user.id)).to.be.true;
      }
    });

    it('should include POINT_OF_SALE users when type filter is set', async () => {
      const result = await UserService.getUsers({ type: UserType.POINT_OF_SALE }, { take: 100 });

      expect(result.records.length).to.be.greaterThan(0);
      result.records.forEach((user) => {
        expect(user.type).to.equal(UserType.POINT_OF_SALE);
      });
    });

    it('should handle search with id filter intersection', async () => {
      const user = ctx.users[0];
      const result = await UserService.getUsers({
        id: [user.id, 999999],
        search: user.firstName,
      }, { take: 100 });

      expect(result.records.some((u) => u.id === user.id)).to.be.true;
      expect(result.records.some((u) => u.id === 999999)).to.be.false;
    });

    it('should handle search with id filter that results in empty intersection', async () => {
      const result = await UserService.getUsers({
        id: [999999],
        search: ctx.users[0].firstName,
      }, { take: 100 });

      expect(result.records.length).to.equal(0);
    });
  });

  describe('getSingleUser', () => {
    it('should return user by id', async () => {
      const user = ctx.users[0];
      const result = await UserService.getSingleUser(user.id);

      expect(result).to.not.be.undefined;
      expect(result.id).to.equal(user.id);
    });

    it('should return undefined for non-existent user', async () => {
      const result = await UserService.getSingleUser(999999);

      expect(result).to.be.undefined;
    });
  });

  describe('createUser', () => {
    it('should send WelcomeWithReset for local user types', async () => {
      const localType = LocalUserTypes[0];
      const result = await UserService.createUser({
        type: localType,
        email: 'test@local.com',
        firstName: 'Test',
        lastName: 'User',
        canGoIntoDebt: false,
        ofAge: true,
      } as any);

      expect(result).to.not.be.undefined;
      expect(sendStub.calledOnce).to.be.true;

      const [user, message] = sendStub.getCall(0).args;
      expect(user.email).to.equal('test@local.com');
      expect(message).to.be.instanceOf(WelcomeWithReset);
      expect(createResetTokenStub.calledOnce).to.be.true;
    });

    it('should send WelcomeToSudosos for non-local user types', async () => {
      const result = await UserService.createUser({
        type: UserType.MEMBER,
        email: 'test@nonlocal.com',
        firstName: 'Test',
        lastName: 'User',
        canGoIntoDebt: false,
        ofAge: true,
      } as any);

      expect(result).to.not.be.undefined;
      expect(sendStub.calledOnce).to.be.true;

      const [user, message] = sendStub.getCall(0).args;
      expect(user.email).to.equal('test@nonlocal.com');
      expect(message).to.be.instanceOf(WelcomeToSudosos);
      expect(createResetTokenStub.called).to.be.false;
    });

    it('should set acceptedToS to NOT_ACCEPTED for TOS required types', async () => {
      const result = await UserService.createUser({
        type: UserType.MEMBER,
        email: 'test@member.com',
        firstName: 'Test',
        lastName: 'User',
        canGoIntoDebt: false,
        ofAge: true,
      } as any);

      const user = await User.findOne({ where: { id: result.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_ACCEPTED);
    });

    it('should set acceptedToS to NOT_REQUIRED for non-TOS required types', async () => {
      const result = await UserService.createUser({
        type: UserType.ORGAN,
        email: '',
        firstName: 'Test',
        lastName: 'User',
        canGoIntoDebt: false,
        ofAge: true,
      } as any);

      const user = await User.findOne({ where: { id: result.id } });
      expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_REQUIRED);
    });

    it('should set empty lastName to empty string', async () => {
      const result = await UserService.createUser({
        type: UserType.MEMBER,
        email: '',
        firstName: 'Test',
        canGoIntoDebt: false,
        ofAge: true,
      } as any);

      const user = await User.findOne({ where: { id: result.id } });
      expect(user.lastName).to.equal('');
    });
  });

  describe('closeUser', () => {
    it('should close user account without deleting', async () => {
      const user = ctx.users[0];
      user.active = true;
      user.canGoIntoDebt = true;
      await user.save();

      const getBalanceStub = sinon.stub(BalanceService.prototype, 'getBalance')
        .resolves({ amount: { amount: 0, currency: 'EUR', precision: 2 } } as any);

      const result = await UserService.closeUser(user.id, false);

      expect(result).to.not.be.undefined;
      expect(result.deleted).to.be.false;
      expect(result.active).to.be.false;

      const updatedUser = await User.findOne({ where: { id: user.id } });
      expect(updatedUser.active).to.be.false;
      expect(updatedUser.canGoIntoDebt).to.be.false;

      getBalanceStub.restore();
    });

    it('should delete user with zero balance', async () => {
      const user = ctx.users[0];
      user.active = true;
      await user.save();

      const getBalanceStub = sinon.stub(BalanceService.prototype, 'getBalance')
        .resolves({ amount: { amount: 0, currency: 'EUR', precision: 2 } } as any);

      const result = await UserService.closeUser(user.id, true);

      expect(result).to.not.be.undefined;
      expect(result.deleted).to.be.true;
      expect(result.active).to.be.false;

      getBalanceStub.restore();
    });

    it('should throw error when deleting user with non-zero balance', async () => {
      const user = ctx.users[0];
      user.active = true;
      await user.save();

      const getBalanceStub = sinon.stub(BalanceService.prototype, 'getBalance')
        .resolves({ amount: { amount: 100, currency: 'EUR', precision: 2 } } as any);

      try {
        await UserService.closeUser(user.id, true);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('non-zero balance');
      }

      getBalanceStub.restore();
    });

    it('should return undefined for non-existent user', async () => {
      const result = await UserService.closeUser(999999);
      expect(result).to.be.undefined;
    });
  });

  describe('updateUser', () => {
    it('should update user properties', async () => {
      const user = ctx.users[0];
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        nickname: 'UpdatedNick',
        active: true,
      };

      const result = await UserService.updateUser(user.id, updateData);

      expect(result.firstName).to.equal('Updated');
      expect(result.lastName).to.equal('Name');
      expect(result.nickname).to.equal('UpdatedNick');
      expect(result.active).to.be.true;

      const updatedUser = await User.findOne({ where: { id: user.id } });
      expect(updatedUser.firstName).to.equal('Updated');
    });

    it('should return undefined for non-existent user', async () => {
      const result = await UserService.updateUser(999999, { firstName: 'Test' });
      expect(result).to.be.undefined;
    });
  });

  describe('acceptToS', () => {
    it('should accept ToS for user', async () => {
      const user = ctx.users[0];
      user.acceptedToS = TermsOfServiceStatus.NOT_ACCEPTED;
      await user.save();

      const result = await UserService.acceptToS(user.id, { extensiveDataProcessing: true });

      expect(result).to.be.true;

      const updatedUser = await User.findOne({ where: { id: user.id } });
      expect(updatedUser.acceptedToS).to.equal(TermsOfServiceStatus.ACCEPTED);
      expect(updatedUser.extensiveDataProcessing).to.be.true;
    });

    it('should return false if user already accepted ToS', async () => {
      const user = ctx.users[0];
      user.acceptedToS = TermsOfServiceStatus.ACCEPTED;
      await user.save();

      const result = await UserService.acceptToS(user.id, { extensiveDataProcessing: false });

      expect(result).to.be.false;
    });

    it('should return false for non-existent user', async () => {
      const result = await UserService.acceptToS(999999, { extensiveDataProcessing: false });
      expect(result).to.be.false;
    });
  });

  describe('getUserFinancialMutations', () => {
    it('should return combined transactions and transfers', async () => {
      // Find a user that has both transactions and transfers
      const userWithTransactions = ctx.transactions.find((t) => t.from)?.from;
      const userWithTransfers = ctx.transfers.find((t) => t.from || t.to);
      const user = userWithTransactions || userWithTransfers?.from || ctx.users[0];

      expect(user).to.not.be.undefined;

      const result = await UserService.getUserFinancialMutations(user, {}, { take: 100, skip: 0 });

      expect(result.records.length).to.be.greaterThan(0);
      expect(result._pagination.count).to.be.greaterThan(0);

      // Verify all records have the correct structure
      result.records.forEach((record) => {
        expect(record.type).to.be.oneOf(['transaction', 'transfer']);
        expect(record.mutation).to.not.be.undefined;
        expect(record.mutation.createdAt).to.not.be.undefined;
      });
    });

    it('should sort mutations by creation date descending', async () => {
      const user = ctx.users[0];

      const result = await UserService.getUserFinancialMutations(user, {}, { take: 100, skip: 0 });

      if (result.records.length > 1) {
        for (let i = 0; i < result.records.length - 1; i += 1) {
          const currentDate = new Date(result.records[i].mutation.createdAt).getTime();
          const nextDate = new Date(result.records[i + 1].mutation.createdAt).getTime();
          expect(currentDate).to.be.greaterThanOrEqual(nextDate);
        }
      }
    });

    it('should apply pagination correctly', async () => {
      const user = ctx.users[0];

      const allResults = await UserService.getUserFinancialMutations(user, {}, { take: 1000, skip: 0 });
      const paginatedResults = await UserService.getUserFinancialMutations(user, {}, { take: 5, skip: 2 });

      if (allResults.records.length > 2) {
        expect(paginatedResults.records.length).to.be.at.most(5);
        expect(paginatedResults._pagination.skip).to.equal(2);
        expect(paginatedResults._pagination.take).to.equal(5);
        expect(paginatedResults._pagination.count).to.equal(allResults._pagination.count);
      }
    });

    it('should filter by date range', async () => {
      const user = ctx.users[0];
      const fromDate = new Date('2022-01-01');
      const tillDate = new Date('2023-12-31');

      const result = await UserService.getUserFinancialMutations(
        user,
        { fromDate, tillDate },
        { take: 100, skip: 0 },
      );

      result.records.forEach((record) => {
        const createdAt = new Date(record.mutation.createdAt);
        expect(createdAt.getTime()).to.be.greaterThanOrEqual(fromDate.getTime());
        expect(createdAt.getTime()).to.be.lessThanOrEqual(tillDate.getTime());
      });
    });
  });

  describe('addUserRole', () => {
    it('should add role to user', async () => {
      const user = ctx.users[0];
      const role = ctx.roles[0];

      await UserService.addUserRole(user, role);

      const assignedRole = await AssignedRole.findOne({
        where: { userId: user.id, roleId: role.id },
      });

      expect(assignedRole).to.not.be.undefined;
    });

    it('should not error if user already has role', async () => {
      const user = ctx.users[0];
      const role = ctx.roles[0];

      await UserService.addUserRole(user, role);
      await UserService.addUserRole(user, role); // Add again

      const assignedRoles = await AssignedRole.find({
        where: { userId: user.id, roleId: role.id },
      });

      expect(assignedRoles.length).to.equal(1);
    });
  });

  describe('deleteUserRole', () => {
    it('should remove role from user', async () => {
      const user = ctx.users[0];
      const role = ctx.roles[0];

      await UserService.addUserRole(user, role);
      await UserService.deleteUserRole(user, role);

      const assignedRole = await AssignedRole.findOne({
        where: { userId: user.id, roleId: role.id },
      });

      expect(assignedRole).to.be.null;
    });

    it('should not error if user does not have role', async () => {
      const user = ctx.users[0];
      const role = ctx.roles[0];

      await UserService.deleteUserRole(user, role);
    });
  });

  describe('areInSameOrgan', () => {
    it('should return true if users are in same organ', async () => {
      if (ctx.organs.length > 0 && ctx.users.length >= 2) {
        const organ = ctx.organs[0];
        const memberUsers = ctx.users.filter((u) => u.type === UserType.MEMBER).slice(0, 2);

        if (memberUsers.length >= 2) {
          // Create organ memberships
          await OrganMembership.save({
            userId: memberUsers[0].id,
            organId: organ.id,
            index: 0,
          } as OrganMembership);

          await OrganMembership.save({
            userId: memberUsers[1].id,
            organId: organ.id,
            index: 1,
          } as OrganMembership);

          const result = await UserService.areInSameOrgan(memberUsers[0].id, memberUsers[1].id);

          expect(result).to.be.true;
        }
      }
    });

    it('should return false if users are not in same organ', async () => {
      if (ctx.users.length >= 2) {
        const user1 = ctx.users[0];
        const user2 = ctx.users[1];

        const result = await UserService.areInSameOrgan(user1.id, user2.id);

        expect(result).to.be.false;
      }
    });
  });

  describe('updateUserType', () => {
    it('should update userType', async () => {
      const user = ctx.users[0];
      const newType = UserType.ORGAN;

      await UserService.updateUserType(user, newType);

      await user.reload();

      expect(user.type).to.equal(newType);
    });
    describe('update userType to LOCAL_USER', async () => {
      it('should send email notification with reset link', async () => {
        const user = ctx.users[0];
        const newType = UserType.LOCAL_USER;

        await UserService.updateUserType(user, newType);

        expect(sendStub.calledOnce).to.be.true;

        const [messagedUser, message] = sendStub.getCall(0).args;
        expect(messagedUser.email).to.equal(user.email);
        expect(message).to.be.instanceOf(UserTypeUpdatedWithReset);
      });
    });
    describe('update userType to MEMBER', async () => {
      it('should send email notification', async () => {
        const user = ctx.users[0];
        const newType = UserType.MEMBER;

        await UserService.updateUserType(user, newType);

        expect(sendStub.calledOnce).to.be.true;

        const [messagedUser, message] = sendStub.getCall(0).args;
        expect(messagedUser.email).to.equal(user.email);
        expect(message).to.be.instanceOf(UserTypeUpdated);
      });

      it('should remove local authentication for the user', async () => {
        const user = ctx.users.find((u) => u.type === UserType.LOCAL_USER);
        const newType = UserType.MEMBER;

        let localAuth = await LocalAuthenticator.findOne({ where: { user: { id: user.id } }, relations: ['user'] });
        expect(localAuth).to.not.be.null;

        await UserService.updateUserType(user, newType);

        localAuth = await LocalAuthenticator.findOne({ where: { user: { id: user.id } }, relations: ['user'] });
        expect(localAuth).to.be.null;
      });
    });
  });
});