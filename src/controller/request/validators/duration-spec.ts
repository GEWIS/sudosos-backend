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
import {
  Specification, toFail, toPass, ValidationError,
} from '../../../helpers/specification-validation';
import DurationRequest from '../duration-request';

/**
 * Tests if the endDate property is a valid date.
 * @param d - Request to check
 */
function endNotNaN<T extends DurationRequest>(d: T) {
  if (Number.isNaN(Date.parse(d.endDate))) {
    return toFail(new ValidationError('End Date must be a valid Date.'));
  }
  return toPass(d);
}

/**
 * Tests if the startDate property is a valid date.
 * @param d - Request to check
 */
function startNotNaN<T extends DurationRequest>(d: T) {
  if (Number.isNaN(Date.parse(d.startDate))) {
    return toFail(new ValidationError('Start Date must be a valid Date.'));
  }
  return toPass(d);
}

/**
 * Tests if the endDate is after startDate
 * @param d - Request to check
 */
function endAfterStart<T extends DurationRequest>(d: T) {
  if (Date.parse(d.endDate) <= Date.parse(d.startDate)) {
    return toFail(new ValidationError('End Date must be after the Start Date.'));
  }
  return toPass(d);
}

function durationSpec<T extends DurationRequest>(): Specification<T, ValidationError> {
  return [
    endNotNaN,
    startNotNaN,
    endAfterStart,
  ];
}

export default durationSpec;
