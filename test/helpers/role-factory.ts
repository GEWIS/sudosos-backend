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
import { ActionDefinition, EntityDefinition, PermissionDefinition, RoleDefinition } from '../../src/rbac/role-manager';
import User, { UserType } from '../../src/entity/user/user';

export const allDefinition: ActionDefinition = { all: new Set<string>(['*']) };
export const ownDefintion: ActionDefinition  = { own: new Set<string>(['*']) };
export const organDefinition: ActionDefinition = { organ: new Set<string>(['*']) };

export function RoleFactory(entities: string[], type: UserType, overwrite?: EntityDefinition) {
  let permission: EntityDefinition;
  if (!overwrite) {
    switch (type) {
      case UserType.LOCAL_ADMIN:
        permission = {
          create: { ...allDefinition, ...ownDefintion },
          get: { ...allDefinition, ...ownDefintion },
          update: { ...allDefinition, ...ownDefintion },
          delete: { ...allDefinition, ...ownDefintion },
        };
        break;
      case UserType.MEMBER:
        permission = {
          create: { ...organDefinition, ...ownDefintion },
          get: { ...organDefinition, ...ownDefintion },
          update: { ...organDefinition, ...ownDefintion },
          delete: { ...organDefinition, ...ownDefintion },
        };
        break;
    }
  } else {
    permission = overwrite;
  }
  const permissions: PermissionDefinition = {};
  entities.forEach((entity) => {
    permissions[entity] = { ...permission };
  });
  const role: RoleDefinition = {
    assignmentCheck: async (user: User) => user.type === type,
    name: UserType[type],
    permissions,
  };
  return role;
}
