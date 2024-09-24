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
 * This is the module page of the pagination.
 *
 * @module helpers
 */

import { Request } from 'express';

export const PAGINATION_DEFAULT = 25;
export const PAGINATION_MAX = 500;

export const defaultPagination = () => (
  parseInt(process.env.PAGINATION_DEFAULT, 10) || PAGINATION_DEFAULT);
export const maxPagination = () => (
  parseInt(process.env.PAGINATION_MAX, 10) || PAGINATION_MAX);

export interface PaginationParameters {
  take?: number;
  skip?: number;
}

/**
 * @typedef {object} PaginationResult
 * @property {integer} take.required Number of records queried
 * @property {integer} skip.required Number of skipped records
 * @property {integer} count.required Total number of resulting records
 */
export interface PaginationResult {
  take?: number;
  skip?: number;
  count: number;
}

/**
 * Check whether the possible take and skip query parameters are valid
 * @param req
 */
export function validateRequestPagination(req: Request): boolean {
  const urlParams = req.query || {};

  if (urlParams.take) {
    const t = parseInt(urlParams.take as string, 10);
    if (Number.isNaN(t) || t.toString().length !== urlParams.take.length
      || t < 0 || !Number.isInteger(t)) return false;
  }
  if (urlParams.skip) {
    const s = parseInt(urlParams.skip as string, 10);
    if (Number.isNaN(s) || s.toString().length !== urlParams.skip.length
      || s < 0 || !Number.isInteger(s)) return false;
  }

  return true;
}

/**
 * Extract possible pagination parameters from the request and put them in the take and skip
 * variables. If one of them (or all of them) is not defined, default values are set.
 *
 * @param req
 * @throws {Error} pagination query parameters are not positive integers or undefined
 */
export function parseRequestPagination(req: Request): { take: number, skip: number } {
  if (!validateRequestPagination(req)) throw Error('Invalid pagination parameters');

  const maxTake = maxPagination();

  // Set the default take and skip to the values set in the environment variables.
  // If these are not set, choose 25 and 0 respectively
  let [take, skip] = [
    defaultPagination(),
    0,
  ];

  const urlParams = req.query || {};

  // Parse and validate the take URL parameter
  if (urlParams.take != null && typeof urlParams.take !== 'object') {
    const parsedTake = parseInt(urlParams.take, 10);
    if (!Number.isNaN(parsedTake) && parsedTake >= 0) take = Math.min(parsedTake, maxTake);
  }

  // Parse and validate the take URL parameter
  if (urlParams.skip != null && typeof urlParams.skip !== 'object') {
    const parsedSkip = parseInt(urlParams.skip, 10);
    if (!Number.isNaN(parsedSkip) && parsedSkip >= 0) skip = parsedSkip;
  }

  return { take, skip };
}
