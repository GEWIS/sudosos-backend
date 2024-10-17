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

/**
 * This is the module page of the rbac-service.
 *
 * @module rbac
 */

import RoleResponse from '../controller/response/rbac/role-response';
import PermissionResponse from '../controller/response/rbac/permission-response';
import ActionResponse from '../controller/response/rbac/action-response';
import RelationResponse from '../controller/response/rbac/relation-response';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import { ActionDefinition, EntityDefinition, PermissionDefinition } from '../rbac/role-definitions';
import PermissionRule from '../rbac/permission-rule';
import { PaginationParameters } from '../helpers/pagination';
import { DeepPartial, FindManyOptions, FindOptionsRelations } from 'typeorm';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { UpdateRoleRequest } from '../controller/request/rbac-request';

interface RoleFilterParameters {
  roleId?: number;

  systemDefault?: boolean;

  returnPermissions?: boolean;
}

export default class RBACService {
  public static findPermission(permissions: PermissionRule[], toFind: PermissionRule): PermissionRule | undefined {
    return permissions.find((p2) => toFind.entity === p2.entity
      && toFind.action === p2.action
      && toFind.relation === p2.relation
      && JSON.stringify(toFind.attributes) === JSON.stringify(p2.attributes));
  }

  /**
   * Map list of permissions to an entity response
   * @param permissions
   */
  public static asPermissionResponse(permissions: Permission[]): PermissionResponse[] {
    const entities = permissions.reduce((e: string[], permission) => {
      if (e.includes(permission.entity)) return e;
      return [...e, permission.entity];
    }, []);

    return entities.map((entityName): PermissionResponse => {
      const entityPermissions = permissions.filter((p) => p.entity === entityName);
      const actions = entityPermissions.reduce((a: string[], permission) => {
        if (a.includes(permission.action)) return a;
        return [...a, permission.action];
      }, []);
      return {
        entity: entityName,
        // Map every action permission to response
        actions: actions.map((actionName): ActionResponse => {
          const actionPermissions = entityPermissions.filter((p) => p.action === actionName);
          const relationPermissions = actionPermissions.reduce((r: Permission[], permission) => {
            if (r.some((r2) => r2.relation === permission.relation)) return r;
            return [...r, permission];
          }, []);
          return {
            action: actionName,
            // Map every relation permission to response
            relations: relationPermissions.map((relationPerm): RelationResponse => ({
              relation: relationPerm.relation,
              attributes: relationPerm.attributes,
            })),
          };
        }),
      };
    });
  }

  /**
   * Converts a Role object to an RoleResponse, which can be
   * returned in the API response. If any permissions are
   * present, those are parsed as well.
   * @param role - The role definitions to parse
   */
  public static asRoleResponse(role: Role): RoleResponse {
    return {
      id: role.id,
      name: role.name,
      systemDefault: role.systemDefault,
      userTypes: role.userTypes ?? [],
      // Map every entity permission to response
      permissions: role.permissions ? this.asPermissionResponse(role.permissions) : undefined,
    };
  }

  /**
   * Convert a human-readable permission definition to a list of
   * database permission rules
   * @param def
   */
  public static definitionToRules(def: PermissionDefinition): PermissionRule[] {
    const permissions: PermissionRule[] = [];
    Object.keys(def).forEach(entity => {
      Object.keys(def[entity]).forEach((action) => {
        Object.keys(def[entity][action]).forEach((relation) => {
          const attributes = Array.from(def[entity][action][relation]);
          permissions.push({ entity, action, relation, attributes });
        });
      });
    });
    return permissions;
  }

  /**
   * Convert a list of database permission rules to a human-readable
   * permissions object
   * @param rules
   */
  public static rulesToDefinition(rules: PermissionRule[]): PermissionDefinition {
    return rules.reduce((permDef: PermissionDefinition, permission1, i1, rolePermissions) => {
      if (permDef[permission1.entity]) return permDef;

      permDef[permission1.entity] = rolePermissions
        .filter((p) => p.entity === permission1.entity)
        .reduce((entDef: EntityDefinition, permission2, i2, entityPermissions) => {
          if (entDef[permission2.entity]) return entDef;

          entDef[permission2.action] = entityPermissions
            .filter((p) => p.action === permission2.action)
            .reduce((actDef: ActionDefinition, permission3) => {
              if (actDef[permission3.relation]) return;

              actDef[permission3.relation] = new Set(permission3.attributes);
              return actDef;

            }, {});
          return entDef;

        }, {});
      return permDef;
    }, {});
  }

  /**
   * Get a tuple with a list of all roles and the total number of
   * roles matching the parameters
   * @param params
   * @param take
   * @param skip
   */
  public static async getRoles(params: RoleFilterParameters = {}, { take, skip }: PaginationParameters = {}): Promise<[Role[], number]> {
    const options = this.getOptions(params);
    return Role.findAndCount({ ...options, take, skip });
  }

  /**
   * Create an new role with the given parameters
   * @param params
   */
  public static async createRole(params: UpdateRoleRequest) {
    return Role.save({ ...params, permissions: [] });
  }

  /**
   * Update an existing role with the given parameters
   * @param roleId
   * @param params
   */
  public static async updateRole(roleId: number, params: UpdateRoleRequest): Promise<Role> {
    const role = await Role.findOne({ where: { id: roleId } });
    if (role == null) throw new Error('Role not found.');
    if (role.systemDefault) throw new Error('Cannot update system default role.');

    role.name = params.name;
    await role.save();

    const [[r]] = await this.getRoles({ roleId, returnPermissions: true });
    return r;
  }

  /**
   * Remove an existing role. Cannot delete system default roles
   * @param roleId
   */
  public static async removeRole(roleId: number) {
    const [[role]] = await this.getRoles({ roleId });
    if (!role) throw new Error('Role not found.');
    if (role.systemDefault) throw new Error('Cannot delete system default role.');

    await Role.remove(role);
  }

  /**
   * Add zero or more new permissions
   * @param roleId
   * @param permissions
   */
  public static async addPermissions(roleId: number, permissions: PermissionRule[]) {
    const [[role]] = await this.getRoles({ roleId, returnPermissions: true });
    if (!role) throw new Error('Role not found.');

    return Permission.save(permissions.map((p): DeepPartial<Permission> => ({
      ...p,
      role,
      roleId: role.id,
    })));
  }

  /**
   * Remove an existing permission
   * @param roleId
   * @param permissionRule
   */
  public static async removePermission(roleId: number, permissionRule: Omit<PermissionRule, 'attributes'>) {
    const match = (await Permission.findOne({ where: {
      roleId,
      entity: permissionRule.entity,
      action: permissionRule.action,
      relation: permissionRule.relation,
    }, relations: { role: true } }));
    if (!match) {
      throw new Error('Permission not found.');
    }
    if (match.role.systemDefault) {
      throw new Error('Cannot change permissions of system default role.');
    }
    await Permission.remove(match);
  }

  /**
   * Build findOptions object
   * @param params
   */
  public static getOptions(params: RoleFilterParameters): FindManyOptions<Role> {
    const filterMapping: FilterMapping = {
      roleId: 'id',
      systemDefault: 'systemDefault',
    };

    const relations: FindOptionsRelations<Role> = {
      permissions: params.returnPermissions,
    };

    return {
      where: {
        ...QueryFilter.createFilterWhereClause(filterMapping, params),
      },
      relations,
    };
  }
}
