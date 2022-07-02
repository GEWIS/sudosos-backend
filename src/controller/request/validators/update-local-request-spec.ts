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
  Specification, toPass, validateSpecification, ValidationError,
} from '../../../helpers/specification-validation';
import UpdateLocalRequest from '../update-local-request';

/**
 * Defines rules of a good password
 * @param p
 */
const validPassword = async (p: string) =>
// TODO Make a good set of rules for updating passwords
  toPass(p)
;

/**
 * We make it a function since we use a SubSpecification
 *    Otherwise it reuses the validationerror internal in memory.
 */
const updateLocalRequestSpec: () => Specification<UpdateLocalRequest, ValidationError> = () => [
  [[validPassword], 'password', new ValidationError('')],
];

/**
 * Logical validation of the updateLocalRequest
 * @param updateLocalRequest - Request to validate
 */
async function verifyUpdateLocalRequest(updateLocalRequest: UpdateLocalRequest) {
  return Promise.resolve(await validateSpecification<UpdateLocalRequest, ValidationError>(
    updateLocalRequest, updateLocalRequestSpec(),
  ));
}

export default verifyUpdateLocalRequest;
