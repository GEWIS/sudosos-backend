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
 * Crypto-related test helpers.
 *
 * Lives in `test/helpers/` rather than `test/setup.ts` so it can be imported
 * by non-Vitest callers (e.g. `cli/dev-seed.ts`) without triggering Vitest's
 * setup-time side effects (env mutations, env Proxy, hook registration).
 */

import * as util from 'util';
import { generateKeyPair } from 'crypto';

/**
 * Generates a basic RSA keypair.
 */
export async function generateKeys(): Promise<{ publicKey: string, privateKey: string }> {
  return util.promisify(generateKeyPair).bind(null, 'rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })();
}
