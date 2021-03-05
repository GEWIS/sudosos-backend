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

import { FindManyOptions } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';

/**
 * Get a FindManyOptions object that includes pagination parameters,
 * based on pagination parameters in the request URL
 *
 * To make pagination appear in Swagger, add the following two lines to your function definition:
 * // @param {integer} take.query - How many users the endpoint should return
 * // @param {integer} skip.query - How many users should be skipped (for pagination)
 *
 * @param req RequestWithToken object, as received in the controller
 * @returns FindManyOptions skip and take parameters for the findoptions for TypeORM.
 *  This should be concatenated with the rest of the parameters
 */
export default function addPagination(req: RequestWithToken): FindManyOptions {
  const maxTake = parseInt(process.env.PAGINATION_MAX, 10) ?? 500;

  const urlParams = req.query;
  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  let [take, skip] = [
    parseInt(process.env.PAGINATION_DEFAULT, 10) ?? 25,
    0,
  ];

  // Parse and validate the take URL parameter
  if (urlParams.take != null) {
    const parsedTake = parseInt(urlParams.take, 10);
    if (!Number.isNaN(parsedTake)) {
      // If more entries than the maximum have been requested, set the take to the maximum
      // Otherwise, we can just return the requested take
      take = parsedTake < maxTake ? parsedTake : maxTake;
    }
  }

  // Parse and validate the skip URL parameter
  if (urlParams.skip != null) {
    const parsedSkip = parseInt(urlParams.skip, 10);
    if (!Number.isNaN(parsedSkip)) skip = parsedSkip;
  }

  return { skip, take } as any as FindManyOptions;
}
