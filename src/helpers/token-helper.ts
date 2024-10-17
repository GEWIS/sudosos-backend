/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
 * This is the module page of the token-helper.
 *
 * @module helpers
 */

import { RequestWithToken } from '../middleware/token-middleware';

/**
 * Checks if the given ID is part of the Token Organ List.
 * @param req - The request with token to validate against.
 * @param organId - The id of the organ to check.
 */
export default function userTokenInOrgan(req: RequestWithToken, organId: number) {
  if (!req.token.organs) return false;
  return (req.token.organs.find((organ) => organ.id === organId) !== undefined);
}
