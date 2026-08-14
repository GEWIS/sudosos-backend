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

import WithManager from '../../src/database/with-manager';
import Role from '../../src/entity/rbac/role';
import User from '../../src/entity/user/user';
import AssignedRole from '../../src/entity/rbac/assigned-role';

export default class RoleSeeder extends WithManager {
  public async seed(users: User[]): Promise<{ roles: Role[], roleAssignments: AssignedRole[] }> {
    const roles = await this.manager.save(Role, [
      { name: 'BAC' },
      { name: 'BAC feut' },
      { name: 'BAC PM' },
      { name: 'Bestuur' },
      { name: 'Kasco' },
    ]);

    const roleAssignments = (await Promise.all(users.map(async (user, i) => {
      if (i % 3 === 0) return undefined;
      return this.manager.save(AssignedRole, {
        user,
        role: roles[i % 5],
      });
    }))).filter((r) => r != null);

    return { roles, roleAssignments };
  }
}
