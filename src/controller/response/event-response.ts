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
import { BaseUserResponse } from './user-response';

/**
 * @typedef {BaseResponse} BaseEventResponse
 * @property {string} name - Name of the borrel.
 * @property {BaseUserResponse.model} createdBy - Creator of the event.
 * @property {string} startDate - The starting date of the borrel.
 * @property {string} endDate - The end date of the borrel.
 */
export interface BaseEventResponse extends BaseResponse {
  createdBy: BaseUserResponse,
  name: string,
  startDate: string,
  endDate: string,
}

/**
 * @typedef {BaseResponse} BaseEventShiftResponse
 * @property {string} name - Name of the shift.
 */
export interface BaseEventShiftResponse extends BaseResponse {
  name: string,
}

/**
 * @typedef {BaseEventShiftResponse} EventShiftResponse
 * @property {Array<string>} roles - Which roles can fill in this shift.
 */
export interface EventShiftResponse extends BaseEventShiftResponse {
  roles: string[],
}

/**
 * @typedef {BaseEventResponse} EventResponse
 * @property {Array<EventAnswerResponse.name>} answers - Filled in availability
 */
export interface EventResponse extends BaseEventResponse {
  answers: EventAnswerResponse[],
}

/**
 * @typedef {EventResponse} BaseEventAnswerResponse
 * @property {BaseUserResponse.model} user - Participant that filled in their availability
 * @property {string} availability - Filled in availability per slot.
 */
export interface BaseEventAnswersResponse {
  user: BaseUserResponse,
  availability: string,
  selected: boolean,
}

/**
 * @typedef {BaseEventAnswerResponse} EventAnswerResponse
 * @property {boolean} selected
 * @property {BaseEventShiftResponse} shift
 * @property {EventResponse} event
 */
export interface EventAnswerResponse extends BaseEventAnswersResponse {
  shift: BaseEventShiftResponse,
}

/**
 * @typedef PaginatedEventResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<BaseEventResponse.model>} records - Returned borrel Schemas
 */
export interface PaginatedBaseEventResponse {
  _pagination: PaginationResult,
  records: BaseEventResponse[],
}
