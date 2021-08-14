/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
import User from '../../../src/entity/user/user';
import RoleManager, { ActionDefinition, AllowedAttribute } from '../../../src/rbac/role-manager';

describe('RoleManager', (): void => {
  let ctx: {
    wildcard: Set<AllowedAttribute>,
    attrOne: Set<AllowedAttribute>,
    attrTwo: Set<AllowedAttribute>,
    attrBoth: Set<AllowedAttribute>,
    own: string,
    created: string,
    rels: string[],
    action: ActionDefinition,
    manager: RoleManager,
  };

  beforeEach(async () => {
    // Initialize context
    ctx = {
      wildcard: new Set(['*']),
      attrOne: new Set(['attrOne']),
      attrTwo: new Set(['attrTwo']),
      attrBoth: new Set(['attrOne', 'attrTwo']),
      own: 'own',
      created: 'created',
      rels: ['own', 'created'],
      action: {},
      manager: undefined,
    };
    ctx.action.own = ctx.attrOne;
    ctx.action.created = ctx.wildcard;
    ctx.action.all = ctx.attrTwo;
    ctx.manager = new RoleManager();
    ctx.manager.registerRole({
      name: 'Role1',
      permissions: {
        Entity1: {
          create: {
            own: ctx.attrOne,
          },
        },
      },
      assignmentCheck: async () => true,
    });
    ctx.manager.registerRole({
      name: 'Role2',
      permissions: {
        Entity2: {
          create: {
            all: ctx.attrOne,
          },
        },
      },
      assignmentCheck: async () => true,
    });
  });

  describe('#registerRole', () => {
    it('should throw when role is already registered', () => {
      const func = () => ctx.manager.registerRole({
        name: 'Role1',
        permissions: {},
        assignmentCheck: async () => false,
      });
      expect(func).to.throw('Role with the same name already exists.');
    });
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
    it('should return true when any role has allowed', () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'Entity1', [...ctx.attrOne]);
      expect(r).to.be.true;
    });
    it('should return true when all relation is defined', () => {
      const r = ctx.manager.can(['Role2'], 'create', 'own', 'Entity2', [...ctx.attrOne]);
      expect(r).to.be.true;
    });
    it('should support multiple relations as argument', () => {
      const r = ctx.manager.can(['Role2'], 'create', ['own', 'created'], 'Entity2', [...ctx.attrOne]);
      expect(r).to.be.true;
    });
    it('should support querying all relation', () => {
      const r = ctx.manager.can(['Role2'], 'create', 'all', 'Entity2', [...ctx.attrOne]);
      expect(r).to.be.true;
    });
    it('should support single string role as argument', () => {
      const r = ctx.manager.can('Role1', 'create', 'own', 'Entity1', [...ctx.attrOne]);
      expect(r).to.be.true;
    });
    it('should return false when no role has allowed', () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'Entity1', [...ctx.attrTwo]);
      expect(r).to.be.false;
    });
    it('should ignore undefined role', () => {
      const r = ctx.manager.can(['undefined'], 'create', 'own', 'Entity1', [...ctx.attrTwo]);
      expect(r).to.be.false;
    });
    it('should ignore undefined entity', () => {
      const r = ctx.manager.can(['Role1'], 'create', 'own', 'undefined', [...ctx.attrTwo]);
      expect(r).to.be.false;
    });
    it('should ignore undefined action', () => {
      const r = ctx.manager.can(['Role1'], 'undefined', 'own', 'Entity1', [...ctx.attrTwo]);
      expect(r).to.be.false;
    });
  });

  describe('#getRoles', () => {
    it('should return list of role names', async () => {
      const user = new User();
      ctx.manager.registerRole({
        name: 'Everybody',
        permissions: {},
        assignmentCheck: async () => true,
      });
      const roles = await ctx.manager.getRoles(user);
      expect(roles.length).to.equal(3);
      expect(roles).to.contain('Role1');
      expect(roles).to.contain('Role2');
      expect(roles).to.contain('Everybody');
    });
    it('should not return role which fails assignment check', async () => {
      const user = new User();
      ctx.manager.registerRole({
        name: 'Nobody',
        permissions: {},
        assignmentCheck: async () => false,
      });
      const roles = await ctx.manager.getRoles(user);
      expect(roles.length).to.equal(2);
      expect(roles).to.contain('Role1');
      expect(roles).to.contain('Role2');
    });
  });
});
