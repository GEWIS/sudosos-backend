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
import User, { UserType } from '../../entity/user/user';
import { star } from './register-default-roles';

/**
 * Define an Authorized Buyer role, which indicates that the user
 * is allowed to create transactions for other people.
 */
const authorizedBuyerUserTypes = new Set<UserType>([
  UserType.LOCAL_USER,
  UserType.MEMBER,
]);
export const AUTHORIZED_BUYER_ROLE = {
  name: 'AuthorizedBuyer',
  permissions: {
    Transaction: {
      create: { all: star },
    },
    Balance: {
      update: { own: star },
    },
    StripeDeposit: {
      create: { own: star, all: star },
    },
    User: {
      get: { all: star, own: star },
      acceptToS: { own: star },
    },
  },
  assignmentCheck: async (user: User) => authorizedBuyerUserTypes.has(user.type),
};
