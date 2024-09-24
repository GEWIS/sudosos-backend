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
 * This is the module page of the event-response.
 *
 * @module events
 */

/**
 * This is the module page of the event-response.
 *
 * @module events
 */

import { PaginationResult } from '../../helpers/pagination';
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { EventType } from '../../entity/event/event';

/**
 * @typedef {allOf|BaseResponse} BaseEventResponse
 * @property {string} name.required - Name of the borrel.
 * @property {BaseUserResponse} createdBy.required - Creator of the event.
 * @property {string} startDate.required - The starting date of the event.
 * @property {string} endDate.required - The end date of the event.
 * @property {string} type.required - The tpye of event.
 */
export interface BaseEventResponse extends BaseResponse {
  createdBy: BaseUserResponse,
  name: string,
  startDate: string,
  endDate: string,
  type: EventType,
}

/**
 * @typedef {allOf|BaseResponse} BaseEventShiftResponse
 * @property {string} name.required - Name of the shift.
 */
export interface BaseEventShiftResponse extends BaseResponse {
  name: string,
}

/**
 * @typedef {allOf|BaseEventShiftResponse} EventShiftResponse
 * @property {Array<string>} roles.required - Which roles can fill in this shift.
 */
export interface EventShiftResponse extends BaseEventShiftResponse {
  roles: string[],
}

/**
 * @typedef {allOf|EventShiftResponse} EventInShiftResponse
 * @property {Array<BaseEventAnswerResponse>} answers - Answers for this shift.
 */
export interface EventInShiftResponse extends EventShiftResponse {
  answers: BaseEventAnswerResponse[];
}

/**
 * @typedef {object} PaginatedEventShiftResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<EventShiftResponse>} records.required - Returned event shifts
 */
export interface PaginatedEventShiftResponse {
  _pagination: PaginationResult,
  records: EventShiftResponse[],
}

/**
 * @typedef {allOf|BaseEventResponse} EventResponse
 * @property {Array<EventInShiftResponse>} shifts.required - Shifts for this event
 */
export interface EventResponse extends BaseEventResponse {
  shifts: EventInShiftResponse[],
}

/**
 * @typedef {object} BaseEventAnswerResponse
 * @property {BaseUserResponse} user.required - Participant that filled in their availability
 * @property {string} availability - Filled in availability per slot.
 * @property {boolean} selected.required - Whether this user is selected for the shift in the event
 */
export interface BaseEventAnswerResponse {
  user: BaseUserResponse,
  availability: string,
  selected: boolean,
}

/**
 * @typedef {object} PaginatedBaseEventResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BaseEventResponse>} records.required - Returned borrel Schemas
 */
export interface PaginatedBaseEventResponse {
  _pagination: PaginationResult,
  records: BaseEventResponse[],
}

/**
 * @typedef {allOf|BaseUserResponse} EventPlanningSelectedCount
 * @property {integer} count.required - Number of times this user was selected for this shift
 */
export interface EventPlanningSelectedCount extends BaseUserResponse {
  count: number;
}
