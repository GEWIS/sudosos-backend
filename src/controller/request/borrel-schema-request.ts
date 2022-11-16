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

export interface BaseBorrelSchema {
  name: string,
  startDate: string,
  endDate: string,
  shiftIds?: number[],
}

export interface CreateBorrelSchemaParams extends BaseBorrelSchema {
  createdById: number,
}
/**
 * @typedef CreateBorrelSchemaRequest
 * @property {string} name.required - Name of the borrel.
 * @property {User.model} createdBy - Creator of the borrelschema.
 * @property {string} startDate.required - The starting date of the borrel.
 * @property {string} endDate.required - The end date of the borrel.
 * @property {Array<BorrelSchemaShift.model>} shifts - Filled in availability
 * per participant per borrel.
 */
export interface CreateBorrelSchemaRequest extends BaseBorrelSchema {
  createdById?: number,
}

export interface BaseUpdateBorrelSchema {
  name: string,
  startDate: string,
  endDate: string,
}

export interface UpdateBorrelSchema extends BaseUpdateBorrelSchema {
  shifts: number[],
}

export interface BaseBorrelSchemaShift {
  name: string,
}

export interface UpdateBorrelSchemaShift extends BaseBorrelSchemaShift {
  default: boolean,
}

/**
 * @typedef CreateBorrelSchemaShiftRequest
 * @property {string} name - Name of the shift.
 * @property {boolean} default - Indicator whether the shift is a regular shift.
 */

export interface CreateBorrelSchemaShiftRequest extends BaseBorrelSchemaShift {
  default: boolean,
}

export interface BaseBorrelSchemaAnswer {
  userId: number,
  shiftId: number,
  borrelSchemaId: number,
}
export interface BaseUpdateBorrelSchemaAnswer {
  shiftId: number,
  borrelSchemaId: number,
}
export interface UpdateBorrelSchemaAnswerAvailability extends BaseUpdateBorrelSchemaAnswer {
  availability: number,
}

export interface SelectBorrelSchemaAnswer extends BaseUpdateBorrelSchemaAnswer {
  selected: boolean,
}

/**
 * @typedef CreateBorrelSchemaAnswerRequest
 * @property {User.model} user - Participant that filled in their availability
 * @property {enum} availability - Filled in availability per slot.
 * @property {boolean} selected - Indicator whether the person has the related shift
 * during the related borrel.
 * @property {BorrelSchemaShift.model} shift - Shift that answers are related to.
 * @property {BorrelSchema.model} borrelSchema - Borrelschema that answers are related to
 */
export interface CreateBorrelSchemaAnswerRequest extends BaseBorrelSchemaAnswer {
  availability: number,
  selected: boolean,
}

export class UpdateBorrelSchemaAnswer {
}
