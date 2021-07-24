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

import { FindManyOptions, QueryBuilder, SelectQueryBuilder } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';

export function validatePaginationQueryParams(req: RequestWithToken): boolean {
  const urlParams = req.query || {};

  if (urlParams.take) {
    const t = parseInt(urlParams.take as string, 10);
    if (Number.isNaN(t) || t.toString().length !== urlParams.take.length) return false;
  }
  if (urlParams.skip) {
    const s = parseInt(urlParams.skip as string, 10);
    if (Number.isNaN(s) || s.toString().length !== urlParams.skip.length) return false;
  }

  return true;
}

/**
 * Parses the request and returns pagination elements when present.
 * @param req Http request which was made
 * @returns {skip, take} skip and take parameters when present in response otherwise default values
 */
export function parseRequestPagination(req: RequestWithToken): { take?: number, skip?: number } {
  let take;
  let skip;
  const urlParams = req.query || {};

  const maxTake = parseInt(process.env.PAGINATION_MAX, 10) || 500;

  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  const [defaultTake, defaultSkip] = [
    parseInt(process.env.PAGINATION_DEFAULT, 10) || 25,
    0,
  ];

  // Parse and validate the take URL parameter
  if (urlParams.take != null && typeof urlParams.take !== 'object') {
    const parsedTake = parseInt(urlParams.take, 10);
    if (!Number.isNaN(parsedTake)) take = parsedTake;
  }

  // Parse and validate the take URL parameter
  if (urlParams.skip != null && typeof urlParams.skip !== 'object') {
    const parsedSkip = parseInt(urlParams.skip, 10);
    if (!Number.isNaN(parsedSkip)) skip = parsedSkip;
  }

  if (take !== undefined) {
    take = take < maxTake ? take : maxTake;
  } else {
    take = defaultTake;
  }

  skip = skip === undefined ? defaultSkip : skip;

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
  const parsed = parseRequestPagination(req);

  // If no value has been given by the user, we simply keep using the default
  if (parsed.take !== undefined) {
    take = parsed.take < maxTake ? parsed.take : maxTake;
  }

  // If no value has been given by the user, we simply keep using the default
  if (parsed.skip !== undefined) skip = parsed.skip;

  return { skip, take };
}

/**
 * Add specific pagination to a QueryBuilder object
 * @param query SelectQueryBuilder object, pagination gets added to this object
 * @param take Optional number, amount of records to retrieve, will be filled with default if not
 * provided
 * @param skip Optional number, amount of records to skip, will be filled with default if not
 * provided
 * @returns The same QueryBuilder object as  but now with pagination added
 */
export function addPaginationToQueryBuilderRaw<T>(query: SelectQueryBuilder<T>,
  take?: number,
  skip?: number) {
  const maxTake = parseInt(process.env.PAGINATION_MAX, 10) || 500;

  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  const [defaultTake, defaultSkip] = [
    parseInt(process.env.PAGINATION_DEFAULT, 10) || 25,
    0,
  ];

  // We have to do two comparisons here. first, we need to check if a pagination
  // value has been given. If this is not the case, we pick the default. Then, we
  // have a maximum take value, so if the parsed value is larger, we return the max.
  if (take !== undefined) {
    query.limit(take < maxTake ? take : maxTake);
    query.take(take < maxTake ? take : maxTake);
  } else {
    query.limit(defaultTake);
    query.take(defaultTake);
  }

  // This could be done in one line, so why not?
  query.offset(skip === undefined ? defaultSkip : skip);
  query.skip(skip === undefined ? defaultSkip : skip);

  return query;
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
  // Parse the values in the URL parameters
  const parsed = parseRequestPagination(req);
  return addPaginationToQueryBuilderRaw(query, parsed.take, parsed.skip);
}
