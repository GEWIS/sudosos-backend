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
import { DataSource } from 'typeorm';
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import DefaultRoles from '../../../src/rbac/default-roles';
import Role from '../../../src/entity/rbac/role';
import { UserFactory } from '../../helpers/user-factory';
import { expect } from 'chai';
import { assignRoles, seedRoles } from '../../seed/rbac';
import { truncateAllTables } from '../../setup';

describe('User', () => {
  let ctx: {
    connection: DataSource;
    roles: Role[],
  };

  before(async () => {
    const connection = await database.initialize();
    const roles = await DefaultRoles.synchronize();

    ctx = {
      connection,
      roles,
    };
  });

  afterEach(async () => {
    await truncateAllTables(ctx.connection);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#getAssignedRoles', () => {
    it('should return all assigned roles this user has', async () => {
      const { user } = await UserFactory();

      const customRoles = await seedRoles([{
        name: 'Everyone',
        permissions: {},
        assignmentCheck: async () => true,
      }]);
      await assignRoles(user, customRoles);

      const actualRoles = await user.getAssignedRoles();
      expect(actualRoles.length).to.equal(customRoles.length);
      expect(actualRoles.map((r) => r.id)).to.deep.equalInAnyOrder(customRoles.map((r) => r.role.id));
      actualRoles.forEach((r) => {
        expect(r.permissions).to.be.undefined;
      });
    });
    it('should return permissions if explicitly requested', async () => {
      const { user } = await UserFactory();

      const customRoles = await seedRoles([{
        name: 'Everyone 2',
        permissions: {
          Product: { eat: { all: new Set(['*']) } },
        },
        assignmentCheck: async () => true,
      }]);
      await assignRoles(user, customRoles);

      const actualRoles = await user.getAssignedRoles(true);
      expect(actualRoles.length).to.equal(1);
      expect(actualRoles[0].permissions).to.not.be.undefined;
      expect(actualRoles[0].permissions).to.be.lengthOf(1);
    });
  });

  describe('#getTypeRoles', () => {
    it('should return all type roles this user belongs to', async () => {
      const builder = await UserFactory();
      const { user } = builder;
      const roles = ctx.roles.filter((r) => r.userTypes.includes(user.type));
      // Sanity check
      expect(roles.length).to.be.greaterThan(0);

      const actualRoles = await user.getTypeRoles();
      expect(actualRoles.length).to.equal(roles.length);
      expect(actualRoles.map((r) => r.id)).to.deep.equalInAnyOrder(roles.map((r) => r.id));
      actualRoles.forEach((r) => {
        expect(r.permissions).to.be.undefined;
      });
    });
    it('should return permissions if explicitly requested', async () => {
      const { user } = await UserFactory();
      const roles = ctx.roles.filter((r) => r.userTypes.includes(user.type));
      // Sanity check
      expect(roles.length).to.be.greaterThan(0);

      const actualRoles = await user.getTypeRoles(true);
      actualRoles.forEach((r) => {
        expect(r.permissions).to.not.be.undefined;
        expect(r.permissions.length).to.be.greaterThan(0);
      });
    });
  });

  describe('#getRoles', () => {
    it('should return all roles this user belongs to', async () => {
      const { user } = await UserFactory();
      const roles = ctx.roles.filter((r) => r.userTypes.includes(user.type));
      // Sanity check
      expect(roles.length).to.be.greaterThan(0);

      const customRoles = await seedRoles([{
        name: 'Everyone 3',
        permissions: {
          Product: { eat: { all: new Set(['*']) } },
        },
        assignmentCheck: async () => true,
      }]);
      await assignRoles(user, customRoles);

      const actualRoles = await user.getRoles();
      const expectedRoles = [...roles, customRoles[0].role];
      expect(actualRoles.length).to.equal(expectedRoles.length);
      expect(actualRoles.map((r) => r.id)).to.deep.equalInAnyOrder(expectedRoles.map((r) => r.id));
      actualRoles.forEach((r) => {
        expect(r.permissions).to.be.undefined;
      });
    });
    it('should return permissions if explicitly requested', async () => {
      const { user } = await UserFactory();
      const roles = ctx.roles.filter((r) => r.userTypes.includes(user.type));
      // Sanity check
      expect(roles.length).to.be.greaterThan(0);

      const customRoles = await seedRoles([{
        name: 'Everyone 4',
        permissions: {
          Product: { eat: { all: new Set(['*']) } },
        },
        assignmentCheck: async () => true,
      }]);
      await assignRoles(user, customRoles);

      const actualRoles = await user.getRoles(true);
      actualRoles.forEach((r) => {
        expect(r.permissions).to.not.be.undefined;
        expect(r.permissions.length).to.be.greaterThan(0);
      });
    });
  });
});
