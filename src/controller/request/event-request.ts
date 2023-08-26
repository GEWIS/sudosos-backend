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
import { Availability } from '../../entity/event/event-shift-answer';

export interface BaseEvent {
  name: string,
  startDate: string,
  endDate: string,
  shiftIds?: number[],
}

export interface CreateEventParams extends BaseEvent {
  createdById: number,
}
/**
 * @typedef CreateEventRequest
 * @property {string} name.required - Name of the borrel.
 * @property {User.model} createdBy - Creator of the event.
 * @property {string} startDate.required - The starting date of the borrel.
 * @property {string} endDate.required - The end date of the borrel.
 * @property {Array<EventShift.model>} shifts - Filled in availability
 * per participant per borrel.
 */
export interface CreateEventRequest extends BaseEvent {
  createdById?: number,
}

export interface BaseUpdateEvent {
  name: string,
  startDate: string,
  endDate: string,
}

export interface UpdateEvent extends BaseUpdateEvent {
  shiftIds: number[],
}

export interface EventShiftRequest {
  name: string,
  roles: string[],
}

/**
 * @typedef CreateEventShiftRequest
 * @property {string} name - Name of the shift.
 */

export interface EventAnswerRequest {
  availability: Availability,
  selected: boolean,
}
