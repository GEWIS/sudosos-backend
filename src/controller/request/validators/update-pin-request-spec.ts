/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the update-pin-request-spec.
 *
 * @module internal/spec/update-pin-request-spec
 */

import {
  Specification, toFail, toPass, validateSpecification, ValidationError,
} from '../../../helpers/specification-validation';
import UpdatePinRequest from '../update-pin-request';
import { INVALID_PIN } from './validation-errors';

/**
 * Rule that a PIN must be a number of size exactly 4
 * @param p
 */
const validPin = async (p: string) => {
  if (!(p.toString().length === 4) || !Number.isInteger(Number(p))) {
    return toFail(INVALID_PIN());
  }
  return toPass(p);
};

/**
 * We make it a function since we use a SubSpecification
 *    Otherwise it reuses the validationerror internal in memory.
 */
const updatePinRequestSpec: () => Specification<UpdatePinRequest, ValidationError> = () => [
  [[validPin], 'pin', new ValidationError('')],
];

/**
 * Logical validation of the updatePinRequest
 * @param updatePinRequest - Request to validate
 */
async function verifyUpdatePinRequest(updatePinRequest: UpdatePinRequest) {
  return Promise.resolve(await validateSpecification<UpdatePinRequest, ValidationError>(
    updatePinRequest, updatePinRequestSpec(),
  ));
}

export default verifyUpdatePinRequest;
