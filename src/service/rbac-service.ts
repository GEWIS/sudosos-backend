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
import RoleResponse from '../controller/response/rbac/role-response';
import { RoleDefinitions } from '../rbac/role-manager';
import EntityResponse from '../controller/response/rbac/entity-response';
import ActionResponse from '../controller/response/rbac/action-response';
import RelationResponse from '../controller/response/rbac/relation-response';

export default class RBACService {
  /**
   * Converts the RoleDefinitions object to an Roleresponse, which can be
   * returned in the API response.
   * @param definitions - The definitions to parse
   */
  public static asRoleResponse(definitions: RoleDefinitions): RoleResponse[] {
    return Object.keys(definitions).map((roleName): RoleResponse => {
      const role = definitions[roleName];
      return {
        role: roleName,
        // Map every entity permission to response
        entities: Object.keys(role.permissions).map((entityName): EntityResponse => {
          const entity = role.permissions[entityName];
          return {
            entity: entityName,
            // Map every action permission to response
            actions: Object.keys(entity).map((actionName): ActionResponse => {
              const action = entity[actionName];
              return {
                action: actionName,
                // Map every relation permission to response
                relations: Object.keys(action).map((relationName): RelationResponse => ({
                  relation: relationName,
                  attributes: [...action[relationName]],
                })),
              };
            }),
          };
        }),
      };
    });
  }
}
