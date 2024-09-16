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

import { PermissionDefinition } from '../../../src/rbac/role-definitions';
import RBACService from '../../../src/service/rbac-service';
import { expect } from 'chai';
import PermissionRule from '../../../src/rbac/permission-rule';
import { DataSource } from 'typeorm';
import { SeededRole } from '../../seed/rbac-seeder';
import User, { UserType } from '../../../src/entity/user/user';
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import { UpdateRoleRequest } from '../../../src/controller/request/rbac-request';
import Role from '../../../src/entity/rbac/role';
import { RbacSeeder, UserSeeder } from '../../seed';

const all = { all: new Set<string>(['*']) };
const own = { own: new Set<string>(['*']) };

describe('RBACService', () => {
  let ctx: {
    connection: DataSource;
    users: User[];
    roles: SeededRole[];
    newRules: PermissionRule[];
  };

  before(async () => {
    const connection = await database.initialize();
    const users = await new UserSeeder().seed();

    const roles = await new RbacSeeder().seed([{
      name: 'system-default-role',
      systemDefault: true,
      userTypes: [UserType.LOCAL_USER],
      permissions: {
        Product: { get: all, create: all },
      },
      assignmentCheck: async () => true,
    }, {
      name: 'custom-role',
      permissions: {
        Product: { get: all },
      },
      assignmentCheck: async () => true,
    }, {
      name: 'custom-role-2',
      permissions: {
        Product: { get: own },
      },
      assignmentCheck: async () => true,
    }]);

    const newRules: PermissionRule[] = [{
      entity: 'User',
      action: 'get',
      relation: 'all',
      attributes: ['*'],
    }, {
      entity: 'User',
      action: 'create',
      relation: 'all',
      attributes: ['*'],
    }];

    ctx = {
      connection,
      users,
      roles,
      newRules,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#definitionToRules and #rulesToDefinition', () => {
    function testConversion(definition: PermissionDefinition, rules: PermissionRule[]) {
      const convertedRules = RBACService.definitionToRules(definition);
      expect(convertedRules.length).to.equal(rules.length);
      expect(convertedRules).to.deep.equal(rules);

      const convertedDefinition = RBACService.rulesToDefinition(rules);
      expect(convertedDefinition).to.deep.equal(definition);
    }

    it('should correctly convert single definition', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: all,
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert single definition with multiple attributes', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: { all: new Set<string>(['boardName', 'boardRating']) },
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['boardName', 'boardRating'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert entity and action with two relations', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: { ...all, ...own },
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'User', action: 'get', relation: 'own', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert entity with two actions', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: all,
          create: all,
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'User', action: 'create', relation: 'all', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert entity with two actions and two relations', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: { ...all, ...own },
          create: { ...all, ...own },
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'User', action: 'get', relation: 'own', attributes: ['*'] },
        { entity: 'User', action: 'create', relation: 'all', attributes: ['*'] },
        { entity: 'User', action: 'create', relation: 'own', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert multiple entities', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: all,
        },
        Product: {
          get: all,
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'Product', action: 'get', relation: 'all', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
    it('should correctly convert multiple entities with multiple actions', async () => {
      const definition: PermissionDefinition = {
        User: {
          get: all,
          create: all,
        },
        Product: {
          get: all,
          create: all,
        },
      };
      const rules: PermissionRule[] = [
        { entity: 'User', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'User', action: 'create', relation: 'all', attributes: ['*'] },
        { entity: 'Product', action: 'get', relation: 'all', attributes: ['*'] },
        { entity: 'Product', action: 'create', relation: 'all', attributes: ['*'] },
      ];
      testConversion(definition, rules);
    });
  });

  describe('#getRoles', () => {
    it('should return all roles', async () => {
      const [roles] = await RBACService.getRoles();
      expect(roles.length).to.equal(ctx.roles.length);

      roles.forEach((role) => {
        const match = ctx.roles.find((r) => r.role.id === role.id);
        expect(match).to.not.be.undefined;
        expect(role.name).to.equal(match.role.name);
        expect(role.systemDefault).to.equal(match.role.systemDefault);
        expect(role.userTypes).to.deep.equal(match.role.userTypes);
        expect(role.permissions).to.be.undefined;
      });
    });
    it('should only return system default roles', async () => {
      const [roles] = await RBACService.getRoles({ systemDefault: true });
      const actualRoles = ctx.roles.filter((r) => r.role.systemDefault);
      expect(roles.length).to.equal(actualRoles.length);
      actualRoles.forEach((role) => {
        expect(role.role.systemDefault).to.be.true;
      });
    });
    it('should not return system default roles', async () => {
      const [roles] = await RBACService.getRoles({ systemDefault: false });
      const actualRoles = ctx.roles.filter((r) => !r.role.systemDefault);
      expect(roles.length).to.equal(actualRoles.length);
      actualRoles.forEach((role) => {
        expect(role.role.systemDefault).to.be.false;
      });
    });
    it('should return permissions', async () => {
      const [roles] = await RBACService.getRoles({ returnPermissions: true });
      expect(roles.length).to.equal(ctx.roles.length);

      roles.forEach((role) => {
        const match = ctx.roles.find((r) => r.role.id === role.id);
        expect(match).to.not.be.undefined;
        expect(match.role.permissions).to.not.be.undefined;
        expect(match.role.permissions.length).to.equal(match.role.permissions.length);
      });
    });
    it('should get role with given ID', async () => {
      const roleId = ctx.roles[0].role.id;
      const [roles, count] = await RBACService.getRoles({ roleId });
      expect(roles.length).to.equal(1);
      expect(count).to.equal(1);
      expect(roles[0].id).to.equal(roleId);
    });
    it('should adhere to pagination', async () => {
      let [roles, count] = await RBACService.getRoles();
      expect(roles.length).to.equal(ctx.roles.length);
      expect(count).to.equal(ctx.roles.length);

      let take = 2;
      [roles, count] = await RBACService.getRoles({}, { take });
      expect(roles.length).to.equal(take);
      expect(count).to.equal(ctx.roles.length);

      const skip = ctx.roles.length - 1;
      take = 2;
      [roles, count] = await RBACService.getRoles({}, { skip, take });
      expect(roles.length).to.equal(1);
      expect(count).to.equal(ctx.roles.length);
    });
  });

  describe('#createRole', () => {
    it('should create a new role', async () => {
      const newRoleParams: UpdateRoleRequest = {
        name: 'New role',
      };
      const role = await RBACService.createRole(newRoleParams);
      expect(role.name).to.equal(newRoleParams.name);

      const dbRole = await Role.findOne({ where: { id: role.id } });
      expect(dbRole).to.not.be.null;
      expect(dbRole.name).to.equal(role.name);

      // Cleanup
      await Role.delete(role.id);
    });
  });

  describe('#updateRole', () => {
    it('should update an existing role', async () => {
      const updateRoleRequest: UpdateRoleRequest = {
        name: 'Updated role',
      };

      const existingRole = ctx.roles.find((r) => !r.role.systemDefault).role;
      const role = await RBACService.updateRole(existingRole.id, updateRoleRequest);
      expect(role.name).to.equal(updateRoleRequest.name);

      const dbRole = await Role.findOne({ where: { id: role.id } });
      expect(dbRole).to.not.be.null;
      expect(dbRole.name).to.equal(role.name);

      // Cleanup
      await Role.update(role.id, { name: existingRole.name });
    });
    it('should throw when role does not exist', async () => {
      const roleId = ctx.roles.length + 1;
      await expect(RBACService.updateRole(roleId, { name: 'yee' }))
        .to.eventually.be.rejectedWith('Role not found.');
    });
    it('should throw when role is system default', async () => {
      const roleId = ctx.roles.find((r) => r.role.systemDefault).role.id;
      await expect(RBACService.updateRole(roleId, { name: 'yee' }))
        .to.eventually.be.rejectedWith('Cannot update system default role.');
    });
  });

  describe('#removeRole', async () => {
    it('should delete an existing role', async () => {
      const [newRole] = await new RbacSeeder().seed([{
        name: 'Role to delete',
        permissions: {},
        assignmentCheck: async () => true,
      }]);
      let dbRole = await Role.findOne({ where: { id: newRole.role.id } });
      expect(dbRole).to.not.be.null;

      await RBACService.removeRole(newRole.role.id);

      dbRole = await Role.findOne({ where: { id: newRole.role.id } });
      expect(dbRole).to.be.null;
    });
    it('should throw when role does not exist', async () => {
      const roleId = ctx.roles.length + 1;
      await expect(RBACService.removeRole(roleId))
        .to.eventually.be.rejectedWith('Role not found.');
    });
    it('should throw when role is system default', async () => {
      const roleId = ctx.roles.find((r) => r.role.systemDefault).role.id;
      await expect(RBACService.removeRole(roleId))
        .to.eventually.be.rejectedWith('Cannot delete system default role.');
    });
  });

  describe('#addPermissions', async () => {
    it('should correctly create two new permissions', async () => {
      const [{ role }] = await new RbacSeeder().seed([{
        name: 'Test role add perms',
        permissions: {},
        assignmentCheck: async () => true,
      }]);

      let dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole.permissions).to.be.lengthOf(0);

      const permissions = await RBACService.addPermissions(dbRole.id, ctx.newRules);
      expect(permissions).to.be.lengthOf(ctx.newRules.length);

      dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole.permissions).to.be.lengthOf(ctx.newRules.length);
      dbRole.permissions.forEach((perm => {
        const match = ctx.newRules.find((r) => r.action === perm.action
        && r.entity === perm.entity
        && r.relation === perm.relation);
        expect(match).to.not.be.undefined;
        expect(perm.relation).to.deep.equal(match.relation);
      }));

      // Cleanup
      await Role.delete(role.id);
    });
    it('should throw when role does not exist', async () => {
      const roleId = ctx.roles.length + 1;
      await expect(RBACService.addPermissions(roleId, ctx.newRules))
        .to.eventually.be.rejectedWith('Role not found.');
    });
  });

  describe('#deletePermission', () => {
    it('should correctly delete a permission', async () => {
      const { role } = ctx.roles.filter((r) => !r.role.systemDefault)[0];
      const permission = role.permissions[0];

      // Sanity check
      let dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole).to.not.be.null;
      expect(dbRole.permissions).to.be.length(role.permissions.length);

      // PermissionRule is subset of Permission, so this call works
      await RBACService.removePermission(role.id, permission);

      dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole).to.not.be.null;
      expect(dbRole.permissions).to.be.length(role.permissions.length - 1);
      const match = dbRole.permissions.find((perm) => perm.entity === permission.entity
        && perm.action === permission.action
        && perm.relation === permission.relation);
      expect(match).to.be.undefined;
    });
    it('should throw when role does not exist', async () => {
      const roleId = ctx.roles.length + 1;
      const { role } = ctx.roles.filter((r) => !r.role.systemDefault)[1];
      const permission = role.permissions[0];
      await expect(RBACService.removePermission(roleId, permission)).to.eventually.be.rejectedWith('Permission not found.');
    });
    it('should throw when permission does not exist', async () => {
      const { role } = ctx.roles.filter((r) => !r.role.systemDefault)[0];
      await expect(RBACService.removePermission(role.id, {
        entity: '39', action: 'Destroy', relation: 'all',
      })).to.eventually.be.rejectedWith('Permission not found.');
    });
    it('should throw when deleting permission from systemDefault role', async () => {
      const { role } = ctx.roles.filter((r) => r.role.systemDefault)[0];
      const permission = role.permissions[0];
      await expect(RBACService.removePermission(role.id, permission)).to.eventually.be.rejectedWith('Cannot change permissions of system default role.');
    });
  });
});
