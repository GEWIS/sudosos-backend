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

/**
 * This is the module page of the inactive-administrative-cost-spec.
 *
 * @module internal/spec/inactive-administrative-cost-spec
 */

import { CreateInactiveAdministrativeCostRequest } from '../inactive-administrative-cost-request';
import { INVALID_USER_ID } from './validation-errors';
import { toFail, toPass } from '../../../helpers/specification-validation';
import User from '../../../entity/user/user';

/**
 * Check whether the given user is a valid user
 */
export default async function verifyValidUserId<T extends CreateInactiveAdministrativeCostRequest>(p: T) {
  if (p.forId == null) return toFail(INVALID_USER_ID());

  const user = await User.findOne({ where: { id: p.forId } });

  return user != undefined ? toPass(p) : toFail(INVALID_USER_ID());
}