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
 * This is the module page of the update-nfc-request-spec.
 *
 * @module internal/spec/update-nfc-request-spec
 */

import {
  Specification, toFail, toPass, validateSpecification, ValidationError,
} from '../../../helpers/specification-validation';
import UpdateNfcRequest from '../update-nfc-request';
import NfcAuthenticator from '../../../entity/authenticator/nfc-authenticator';
import { DUPLICATE_TOKEN, ZERO_LENGTH_STRING } from './validation-errors';

/**
 * nfcCode may not be empty
 * @param p
 */
const validNfc = async (p: string) => {
  if (p === '') return toFail(ZERO_LENGTH_STRING());
  const existCode = await NfcAuthenticator.count({ where: { nfcCode: p } });
  if (!(existCode == 0)) return toFail(DUPLICATE_TOKEN());
  return toPass(p);
};

/**
 * We make it a function since we use a SubSpecification
 *    Otherwise it reuses the validationerror internal in memory.
 */
const updateNfcRequestSpec: () => Specification<UpdateNfcRequest, ValidationError> = () => [
  [[validNfc], 'nfcCode', new ValidationError('')],
];

/**
 * Logical validation of the updateNFCRequest
 * @param updateNFCRequest - Request to validate
 */
async function verifyUpdateNFCRequest(updateNFCRequest: UpdateNfcRequest) {
  return Promise.resolve(await validateSpecification<UpdateNfcRequest, ValidationError>(
    updateNFCRequest, updateNfcRequestSpec(),
  ));
}

export default verifyUpdateNFCRequest;
