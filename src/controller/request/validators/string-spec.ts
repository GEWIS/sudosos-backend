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

/**
 * Checks if the string attribute is not an empty string.
 */
export const nonZeroString = (p: string) => {
  if (p === '') {
    return toFail(new ValidationError('must be a non-zero length string.'));
  }
  return toPass(p);
};

function stringSpec(): Specification<string, ValidationError> {
  return [
    nonZeroString,
  ] as Specification<string, ValidationError>;
}

export default stringSpec;
