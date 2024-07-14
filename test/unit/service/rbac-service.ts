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
import { PermissionDefinition } from '../../../src/rbac/role-manager';
import RBACService from '../../../src/service/rbac-service';
import { expect } from 'chai';
import PermissionRule from '../../../src/rbac/permission-rule';

const all = { all: new Set<string>(['*']) };
const own = { own: new Set<string>(['*']) };

describe('RBACService', () => {
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
});
