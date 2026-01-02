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
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import RBACService from '../../../src/service/rbac-service';
import DefaultRoles from '../../../src/rbac/default-roles';
import { expect } from 'chai';
import Role from '../../../src/entity/rbac/role';
import Permission from '../../../src/entity/rbac/permission';
import PermissionRule from '../../../src/rbac/permission-rule';
import RoleUserType from '../../../src/entity/rbac/role-user-type';
import { UserType } from '../../../src/entity/user/user';

describe('DefaultRoles', () => {
  let ctx: {
    connection: DataSource,
  };

  before(async () => {
    ctx = {
      connection: await database.initialize(),
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  function findPermission(permissions: PermissionRule[], toFind: PermissionRule): PermissionRule | undefined {
    return permissions.find((p2) => toFind.entity === p2.entity
      && toFind.action === p2.action
      && toFind.relation === p2.relation
      && JSON.stringify(toFind.attributes) === JSON.stringify(p2.attributes));
  }

  describe('#definitions', () => {
    it('should not contain duplicate rules for same UserType', async () => {
      // Check all roles except SuperAdmin, because that one obviously has all permissions
      const definitions = DefaultRoles.definitions.filter((d) => d.name !== 'Super admin');

      // Check for all default roles
      definitions.forEach((definition) => {
        const otherDefs = definitions.filter((d) => d.name !== definition.name);
        const rules = RBACService.definitionToRules(definition.permissions);

        // Match each default role against all other default roles
        otherDefs.forEach((otherDef) => {
          // If there is no overlap between the user types of the two roles, we don't care that there are duplicates
          if (!otherDef.userTypes.some((u1) => definition.userTypes.includes(u1))) return;

          const otherRules = RBACService.definitionToRules(otherDef.permissions);
          rules.forEach((p1) => {
            // See whether the rule exists in both roles
            const match = findPermission(otherRules, p1);
            expect(
              match, `Roles "${definition.name}" and "${otherDef.name}" have the same RBAC rule: ${p1.entity} - ${p1.action} - ${p1.relation} - ${JSON.stringify(p1.attributes)}`,
            ).to.be.undefined;
          });
        });
      });
    });
  });

  describe('#synchronize', () => {
    afterEach(async () => {
      await truncateAllTables(ctx.connection);
    });

    it('should correctly process roles', async () => {
      const defaultRoles = DefaultRoles.definitions;
      const rulesPerRole = defaultRoles.map((d) => ({
        name: d.name,
        userTypes: d.userTypes,
        permissions: RBACService.definitionToRules(d.permissions),
      }));

      const roles = await DefaultRoles.synchronize();
      expect(roles.length).to.equal(rulesPerRole.length);
      roles.forEach((role) => {
        const definition = rulesPerRole.find((d) => d.name === role.name);
        expect(definition).to.not.be.undefined;
        expect(role.systemDefault).to.be.true;
        expect(role.userTypes).to.deep.equalInAnyOrder(definition.userTypes);
        expect(role.permissions).to.deep.equalInAnyOrder(definition.permissions.map((p) => ({
          ...p, roleId: role.id,
        })));
      });
    });
    it('should correctly put roles in database', async () => {
      const defaultRoles = DefaultRoles.definitions;
      const rulesPerRole = defaultRoles.map((d) => ({
        name: d.name,
        userTypes: d.userTypes,
        permissions: RBACService.definitionToRules(d.permissions),
      }));

      await DefaultRoles.synchronize();
      expect(await Role.count()).to.equal(defaultRoles.length);
      for (const roleDefinition of rulesPerRole) {
        const { name, permissions, userTypes } = roleDefinition;
        const role = await Role.findOne({ where: { name }, relations: { permissions: true } });
        expect(role.userTypes).to.deep.equalInAnyOrder(userTypes);
        role.permissions.forEach((p1) => {
          const match = findPermission(permissions, p1);
          expect(match).to.not.be.undefined;
        });
      }
    });
    it('should correctly remove old permissions', async () => {
      const roles = await DefaultRoles.synchronize();
      const [role] = roles;

      const extraPermission = await Permission.save({
        role: role,
        roleId: role.id,
        entity: 'TEST ENTITY',
        action: 'TEST ACTION',
        relation: 'all',
        attributes: ['*'],
      });

      let dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      let match = findPermission(dbRole.permissions, extraPermission);
      expect(match).to.not.be.undefined;

      await DefaultRoles.synchronize();

      dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      match = findPermission(dbRole.permissions, extraPermission);
      expect(match).to.be.undefined;
    });
    it('should correctly remove old UserTypes', async () => {
      const userType = UserType.LOCAL_ADMIN;
      const roles = await DefaultRoles.synchronize();
      const role = roles.find((r) => !r.userTypes.includes(userType));

      await RoleUserType.save({
        role,
        roleId: role.id,
        userType,
      });

      let dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole.userTypes).to.include(userType);

      await DefaultRoles.synchronize();

      dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole.userTypes).to.not.include(userType);
    });
  });
});
