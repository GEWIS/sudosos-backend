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
 * This is the module page of the string-spec.
 *
 * @module internal/spec/string-spec
 */

import {
  Specification, toFail, toPass, ValidationError,
} from '../../../helpers/specification-validation';
import { MAX_STRING_SIZE, ZERO_LENGTH_STRING } from './validation-errors';

/**
 * Checks if the string attribute is not an empty string.
 */
export const nonZeroString = (p: string) => {
  if (p === '') {
    return toFail(ZERO_LENGTH_STRING());
  }
  return toPass(p);
};

export const maxLength = (length: number) => (p: string) => {
  if (p && p.length > length) {
    return toFail(MAX_STRING_SIZE());
  }
  return toPass(p);
};

function stringSpec(): Specification<string, ValidationError> {
  return [
    nonZeroString,
  ] as Specification<string, ValidationError>;
}

export default stringSpec;
