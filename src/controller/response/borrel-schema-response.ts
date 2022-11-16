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
import { PaginationResult } from '../../helpers/pagination';
import BaseResponse from './base-response';
import { UserResponse } from './user-response';

/**
 * @typedef {BaseResponse} BaseBorrelSchemaResponse
 * @property {string} name - Name of the borrel.
 * @property {UserResponse.model} createdBy - Creator of the borrelschema.
 * @property {string} startDate - The starting date of the borrel.
 * @property {string} endDate - The end date of the borrel.
 */
export interface BaseBorrelSchemaResponse extends BaseResponse {
  createdBy: UserResponse,
  name: string,
  startDate: string,
  endDate: string,
}

/**
 * @typedef {BaseResponse} BaseBorrelSchemaShiftResponse
 * @property {string} name - Name of the shift.
 */
export interface BaseBorrelSchemaShiftResponse extends BaseResponse {
  name: string,
}

/**
 * @typedef {BaseBorrelSchemaShiftResponse} BorrelSchemaShiftResponse
 * @property {boolean} default - Indicator whether the shift is a regular shift.
 */
export interface BorrelSchemaShiftResponse extends BaseBorrelSchemaShiftResponse {
  default: boolean,
}

/**
 * @typedef {BaseBorrelSchemaResponse} BorrelSchemaResponse
 * @property {Array<BaseBorrelSchemaShiftResponse.name>} shifts - Filled in availability
 */
export interface BorrelSchemaResponse extends BaseBorrelSchemaResponse {
  shifts: BaseBorrelSchemaShiftResponse[],
}

/**
 * @typedef {BorrelSchemaResponse} BaseBorrelSchemaAnswerResponse
 * @property {UserResponse.model} user - Participant that filled in their availability
 * @property {string} availability - Filled in availability per slot.
 */
export interface BaseBorrelSchemaAnswersResponse {
  user: UserResponse,
  availability: number,
}

/**
 * @typedef {BaseBorrelSchemaAnswerResponse} BorrelSchemaAnswerResponse
 * @property {boolean} selected
 * @property {BaseBorrelSchemaShiftResponse} shift
 * @property {BorrelSchemaResponse} borrelSchema
 */
export interface BorrelSchemaAnswerResponse extends BaseBorrelSchemaAnswersResponse {
  selected: boolean,
  shift: BaseBorrelSchemaShiftResponse,
  borrelSchema: BorrelSchemaResponse,
}

/**
 * @typedef PaginatedBorrelSchemaResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<BorrelSchemaResponse.model>} records - Returned borrel Schemas
 */
export interface PaginatedBorrelSchemaResponse {
  _pagination: PaginationResult,
  records: BorrelSchemaResponse[],
}
