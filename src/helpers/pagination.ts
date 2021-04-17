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

import { FindManyOptions, SelectQueryBuilder } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';

function parseReqSkipTake(req: RequestWithToken): { take?: number, skip?: number } {
  let take;
  let skip;
  const urlParams = req.query;

  // Parse and validate the take URL parameter
  if (urlParams.take != null) {
    const parsedTake = parseInt(urlParams.take, 10);
    if (!Number.isNaN(parsedTake)) take = parsedTake;
  }

  // Parse and validate the take URL parameter
  if (urlParams.skip != null) {
    const parsedSkip = parseInt(urlParams.skip, 10);
    if (!Number.isNaN(parsedSkip)) skip = parsedSkip;
  }

  return { take, skip };
}

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
export function addPaginationForFindOptions(req: RequestWithToken): FindManyOptions {
  const maxTake = parseInt(process.env.PAGINATION_MAX, 10) || 500;

  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  let [take, skip] = [
    parseInt(process.env.PAGINATION_DEFAULT, 10) || 25,
    0,
  ];

  // Parse the values in the URL parameters
  const parsed = parseReqSkipTake(req);

  // If no value has been given by the user, we simply keep using the default
  if (parsed.take !== undefined) {
    take = parsed.take < maxTake ? parsed.take : maxTake;
  }

  // If no value has been given by the user, we simply keep using the default
  if (parsed.skip !== undefined) skip = parsed.skip;

  return { skip, take };
}

/**
 * Add pagination to a QueryBuilder object
 * @param req RequestWithToken object, as received in the controller
 * @param query QueryBuilder object the pagination needs to be applied to
 * @returns The same QueryBuilder object as before,
 * but now with pagination added
 */
export function addPaginationToQueryBuilder<T>(
  req: RequestWithToken, query: SelectQueryBuilder<T>,
) {
  const maxTake = parseInt(process.env.PAGINATION_MAX, 10) || 500;

  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  const [take, skip] = [
    parseInt(process.env.PAGINATION_DEFAULT, 10) || 25,
    0,
  ];

  // Parse the values in the URL parameters
  const parsed = parseReqSkipTake(req);

  // We have to do two comparisons here. first, we need to check if a pagination
  // value has been given. If this is not the case, we pick the default. Then, we
  // have a maximum take value, so if the parsed value is larger, we return the max.
  if (parsed.take !== undefined) {
    query.limit(parsed.take < maxTake ? parsed.take : maxTake);
  } else {
    query.limit(take);
  }

  // This could be done in one line, so why not?
  query.offset(parsed.skip === undefined ? skip : parsed.skip);

  return query;
}
