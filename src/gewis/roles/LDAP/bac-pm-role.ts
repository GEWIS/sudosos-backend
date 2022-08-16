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
import { admin } from '../register-default-roles';

/**
 * Define a BAC Treasurer role, which indicates that the user
 * is the BAC Treasurer.
 */
export const BAC_PM_ROLE = {
  name: 'SudoSOS - BAC PM',
  permissions: {
    Container: {
      ...admin,
    },
    Invoice: {
      ...admin,
    },
    PayoutRequest: {
      ...admin,
    },
    PointOfSale: {
      ...admin,
    },
    ProductCategory: {
      ...admin,
    },
    Product: {
      ...admin,
    },
    Transaction: {
      ...admin,
    },
    Transfer: {
      ...admin,
    },
    VatGroup: {
      ...admin,
    },
  },
  assignmentCheck: async (user: User) => await AssignedRole.findOne({ where: { role: 'SudoSOS - BAC PM', user: { id: user.id } } }) !== undefined,
};
