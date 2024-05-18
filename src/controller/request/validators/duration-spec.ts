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
 */

import {
  Specification, toFail, toPass, ValidationError,
} from '../../../helpers/specification-validation';
import Duration from '../duration';
import { INVALID_DATE, INVALID_DATE_DURATION } from './validation-errors';

/**
 * Tests if the string is a valid date.
 * @param d
 */
export function validDate(d: string) {
  if (Number.isNaN(Date.parse(d))) {
    return toFail(INVALID_DATE());
  }
  return toPass(d);
}

/**
 * Tests if the string is valid date or undefined
 * @param d
 */
export function validOrUndefinedDate(d: string) {
  if (!d) return toPass(d);
  return validDate(d);
}

/**
 * Tests if the endDate is after startDate
 * @param d - Request to check
 */
function endAfterStart<T extends Duration>(d: T) {
  if (Date.parse(d.endDate) <= Date.parse(d.startDate)) {
    return toFail(INVALID_DATE_DURATION());
  }
  return toPass(d);
}

function durationSpec<T extends Duration>(): Specification<T, ValidationError> {
  return [
    [[validDate], 'startDate', new ValidationError('startDate:')],
    [[validDate], 'endDate', new ValidationError('endDate:')],
    endAfterStart,
  ];
}

export default durationSpec;
