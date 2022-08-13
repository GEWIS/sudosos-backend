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
export const all: ActionDefinition = { all: new Set<string>(['*']) };
export const own: ActionDefinition  = { own: new Set<string>(['*']) };

export function RoleFactory(entities: string[], type: UserType) {
  let permission: EntityDefinition;
  if (type === UserType.LOCAL_ADMIN) {
    permission = {
      create: { ...all, ...own },
      get: { ...all, ...own },
      update: { ...all, ...own },
      delete: { ...all, ...own },
    };
  } else if (type === UserType.MEMBER) {
    permission = {
      create: own,
      get: own,
      update: own,
      delete: own,
    };
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
