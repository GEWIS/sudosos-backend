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

import RoleResponse from '../controller/response/rbac/role-response';
import { RoleDefinitions } from '../rbac/role-manager';
import EntityResponse from '../controller/response/rbac/entity-response';
import ActionResponse from '../controller/response/rbac/action-response';
import RelationResponse from '../controller/response/rbac/relation-response';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';

export default class RBACService {
  /**
   * Converts the RoleDefinitions object to an Roleresponse, which can be
   * returned in the API response.
   * @param roles - The role definitions to parse
   */
  public static asRoleResponse(roles: Role[]): RoleResponse[] {
    return roles.map((role): RoleResponse => {
      const entities = role.permissions?.reduce((e: string[], permission) => {
        if (e.includes(permission.entity)) return e;
        return [...e, permission.entity];
      }, []);
      return {
        role: role.name,
        // Map every entity permission to response
        entities: entities?.map((entityName): EntityResponse => {
          const entityPermissions = role.permissions.filter((p) => p.entity === entityName);
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
        }),
      };
    });
  }
}
