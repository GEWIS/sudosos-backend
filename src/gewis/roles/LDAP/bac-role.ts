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
 * Define a BAC role, which indicates that the user
 * is a member of the BAr Committee group in AD.
 */
export const BAC_ROLE = {
  name: 'SudoSOS - BAC',
  permissions: {
    Transaction: {
      get: { own: star, all: star },
      create: { own: star, all: star },
      update: { own: star, all: star },
      delete: { own: star, all: star },
    },
    BorrelkaartGroup: {
      get: { all: star },
      update: { all: star },
      delete: { all: star },
      create: { all: star },
    },
    ProductCategory: {
      get: { all: star },
      update: { all: star },
      delete: { all: star },
      create: { all: star },
    },
  },
  assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - BAC', user: { id: user.id } } }) !== undefined,
};
