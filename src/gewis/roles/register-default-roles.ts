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
import RoleManager from '../../rbac/role-manager';
import { SELLER_ROLE } from './seller-role';
import { USER_ROLE } from './user-role';
import { LOCAL_USER_ROLE } from './local-user-role';
import { INVOICE_ROLE } from './invoice-role';
import { BUYER_ROLE } from './buyer-role';
import { AUTHORIZED_BUYER_ROLE } from './authorized-buyer-role';
import { BOARD_ROLE } from './LDAP/board-role';
import { BAC_ROLE } from './LDAP/bac-role';
import { BAC_PM_ROLE } from './LDAP/bac-pm-role';
import { AUDIT_ROLE } from './LDAP/audit-role';

export const star = new Set(['*']);
export const admin = {
  get: { own: star, all: star },
  update: { own: star, all: star },
  create: { own: star, all: star },
  delete: { own: star, all: star },
  approve: { own: star, all: star },
};

export function register(roleManager: RoleManager) {
  const localRoles = [ SELLER_ROLE, USER_ROLE, LOCAL_USER_ROLE, INVOICE_ROLE, BUYER_ROLE, AUTHORIZED_BUYER_ROLE];
  const ldapRoles = [ BOARD_ROLE, BAC_ROLE, BAC_PM_ROLE, AUDIT_ROLE];
  localRoles.forEach((r) => roleManager.registerRole(r));
  ldapRoles.forEach((r) => roleManager.registerRole(r));
}
