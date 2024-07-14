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

import { expect } from 'chai';
import RoleManager, { ActionDefinition, AllowedAttribute } from '../../../src/rbac/role-manager';
import { assignRoles, SeededRole, seedRoles } from '../../seed/rbac';
import { DataSource } from 'typeorm';
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import { UserFactory } from '../../helpers/user-factory';

describe('RoleManager', (): void => {
  let ctx: {
    connection: DataSource,
    wildcard: Set<AllowedAttribute>,
    attrOne: Set<AllowedAttribute>,
    attrTwo: Set<AllowedAttribute>,
    attrBoth: Set<AllowedAttribute>,
    own: string,
    created: string,
    rels: string[],
    action: ActionDefinition,
    manager: RoleManager,
    roles: SeededRole[],
  };

  before(async () => {
    // Initialize context
    ctx = {
      connection: await database.initialize(),
      wildcard: new Set(['*']),
      attrOne: new Set(['attrOne']),
      attrTwo: new Set(['attrTwo']),
      attrBoth: new Set(['attrOne', 'attrTwo']),
      own: 'own',
      created: 'created',
      rels: ['own', 'created'],
      action: {},
      manager: undefined,
      roles: [],
    };
    ctx.action.own = ctx.attrOne;
    ctx.action.created = ctx.wildcard;
    ctx.action.all = ctx.attrTwo;
    ctx.roles = await seedRoles([{
      name: 'Role1',
      permissions: {
        Entity1: {
          create: {
            own: ctx.attrOne,
          },
        },
      },
      assignmentCheck: async () => true,
    }, {
      name: 'Role2',
      permissions: {
        Entity2: {
          create: {
            all: ctx.attrOne,
          },
        },
      },
      assignmentCheck: async () => true,
    }]);
    ctx.manager = await new RoleManager().initialize();
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('#processAttributes', () => {
    it('should result in empty set when wildcard is allowed', () => {
      const remaining = new Set(ctx.attrOne);
      RoleManager.processAttributes(ctx.wildcard, remaining);
      expect(remaining.size).to.equal(0);
    });
    it('should result in empty set when attribute is allowed', () => {
      const remaining = new Set(ctx.attrOne);
      RoleManager.processAttributes(ctx.attrOne, remaining);
      expect(remaining.size).to.equal(0);
    });
    it('should result in remaining when partly not allowed', () => {
      const remaining = new Set(ctx.attrBoth);
      RoleManager.processAttributes(ctx.attrOne, remaining);
      expect(remaining.size).to.equal(1);
      expect(remaining).to.contain('attrTwo');
    });
    it('should result in unmodified when attribute is not allowed', () => {
      const remaining = new Set(ctx.wildcard);
      RoleManager.processAttributes(ctx.attrOne, remaining);
      expect(remaining.size).to.equal(1);
      expect(remaining).to.contain('*');
    });
  });

  describe('#processRelations', () => {
    it('should result in empty set when any role has allowed', () => {
      const remaining = new Set(ctx.attrOne);
      RoleManager.processRelations(ctx.action, ctx.rels, remaining);
      expect(remaining.size).to.equal(0);
    });
    it('should result in remaining when partly not allowed', () => {
      const remaining = new Set(ctx.attrBoth);
      remaining.add('*');
      RoleManager.processRelations(ctx.action, [ctx.own, 'all'], remaining);
      expect(remaining.size).to.equal(1);
      expect(remaining).to.contain('*');
    });
    it('should ignore undefined relation', () => {
      const remaining = new Set(ctx.attrOne);
      RoleManager.processRelations(ctx.action, ['undefined'], remaining);
      expect(remaining.size).to.equal(1);
    });
  });

  describe('#can', () => {
    it('should return true when any role has allowed', async () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'Entity1', [...ctx.attrOne]);
      await expect(r).to.eventually.be.true;
    });
    it('should return true when all relation is defined', async () => {
      const r = ctx.manager.can(['Role2'], 'create', 'own', 'Entity2', [...ctx.attrOne]);
      await expect(r).to.eventually.be.true;
    });
    it('should support multiple relations as argument', async () => {
      const r = ctx.manager.can(['Role2'], 'create', ['own', 'created'], 'Entity2', [...ctx.attrOne]);
      await expect(r).to.eventually.be.true;
    });
    it('should support querying all relation', async () => {
      const r = ctx.manager.can(['Role2'], 'create', 'all', 'Entity2', [...ctx.attrOne]);
      await expect(r).to.eventually.be.true;
    });
    it('should support single string role as argument', async () => {
      const r = ctx.manager.can('Role1', 'create', 'own', 'Entity1', [...ctx.attrOne]);
      await expect(r).to.eventually.be.true;
    });
    it('should return false when no role has allowed', async () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'Entity1', [...ctx.attrTwo]);
      await expect(r).to.eventually.be.false;
    });
    it('should ignore undefined role', async () => {
      const r = ctx.manager.can(['undefined'], 'create', 'own', 'Entity1', [...ctx.attrTwo]);
      await expect(r).to.eventually.be.false;
    });
    it('should ignore undefined entity', async () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'undefined', [...ctx.attrTwo]);
      await expect(r).to.eventually.be.false;
    });
    it('should ignore undefined action', async () => {
      const r = ctx.manager.can(['Role1'], 'undefined', 'own', 'Entity1', [...ctx.attrTwo]);
      await expect(r).to.eventually.be.false;
    });
  });

  describe('#getRoles', () => {
    it('should return list of role names', async () => {
      const { user } = await UserFactory();
      const [role] = await seedRoles([{
        name: 'Everybody',
        permissions: {},
        assignmentCheck: async () => true,
      }]);
      await assignRoles(user, [...ctx.roles, role]);
      await ctx.manager.loadRolesFromDatabase();

      const roles = await ctx.manager.getRoles(user);
      expect(roles.length).to.equal(3);
      expect(roles).to.contain('Role1');
      expect(roles).to.contain('Role2');
      expect(roles).to.contain('Everybody');
    });
    it('should not return role which fails assignment check', async () => {
      const { user } = await UserFactory();
      const [role] = await seedRoles([{
        name: 'Nobody',
        permissions: {},
        assignmentCheck: async () => false,
      }]);
      await assignRoles(user, [...ctx.roles, role]);
      await ctx.manager.loadRolesFromDatabase();

      const roles = await ctx.manager.getRoles(user);
      expect(roles.length).to.equal(2);
      expect(roles).to.contain('Role1');
      expect(roles).to.contain('Role2');
    });
  });
});
