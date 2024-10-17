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
 * This is the module page of the event-request.
 *
 * @module events
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */

import { Availability } from '../../entity/event/event-shift-answer';

/**
 * @typedef {object} CreateEventRequest
 * @property {string} name.required - Name of the event.
 * @property {string} startDate.required - The starting date of the event.
 * @property {string} endDate.required - The end date of the event.
 * @property {string} type - The type of the event.
 * @property {Array<integer>} shiftIds.required - IDs of shifts that are in this event
 * per participant per borrel.
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */

/**
 * @typedef {object} UpdateEventRequest
 * @property {string} name - Name of the event.
 * @property {string} startDate - The starting date of the event.
 * @property {string} endDate - The end date of the event.
 * @property {string} type - The type of the event.
 * @property {Array<integer>} shiftIds - IDs of shifts that are in this event
 * per participant per borrel.
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export interface EventRequest {
  name: string,
  startDate: string,
  endDate: string,
  type: string,
  shiftIds: number[],
}

/**
 * @typedef {object} CreateShiftRequest
 * @property {string} name.required - Name of the event
 * @property {Array<string>} roles.required - Roles that (can) have this shift
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */

/**
 * @typedef {object} UpdateShiftRequest
 * @property {string} name - Name of the event
 * @property {Array<string>} roles - Roles that (can) have this shift
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export interface EventShiftRequest {
  name: string,
  roles: string[],
}

/**
 * @typedef {object} EventAnswerAssignmentRequest
 * @property {boolean} selected.required - Whether this user is selected for the given shift at the given event
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export interface EventAnswerAssignmentRequest {
  selected: boolean,
}

/**
 * @typedef {object} EventAnswerAvailabilityRequest
 * @property {string} availability.required - New availability of the given user for the given event (YES, NO, LATER, NA)
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export interface EventAnswerAvailabilityRequest {
  availability: Availability,
}
