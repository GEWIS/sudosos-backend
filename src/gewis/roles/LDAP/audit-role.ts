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
import User from '../../../entity/user/user';
import AssignedRole from '../../../entity/roles/assigned-role';
import { star } from '../register-default-roles';

/**
 * Define a Audit Committee role, which indicates that the user
 * is a part of the Audit Committee.
 */
export const AUDIT_ROLE = {
  name: 'SudoSOS - Audit',
  permissions: {
    Invoice: {
      get: { all: star, own: star },
    },
    Transaction: {
      get: { all: star, own: star },
    },
    Transfer: {
      get: { all: star, own: star },
    },
  },
  assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - Audit', user: { id: user.id } } }) !== undefined,
};
