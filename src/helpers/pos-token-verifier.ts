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
 * This is the module page of the pos-token-verifier.
 *
 * @module internal/helpers
 */

import { RequestWithToken } from '../middleware/token-middleware';
import ServerSettingsStore from '../server-settings/server-settings-store';

/**
 * Utility class for verifying POS tokens in lesser authentication scenarios.
 * This class handles the verification logic for ensuring that lesser tokens
 * (PIN/NFC authentication) are properly associated with the correct POS.
 */
export default class POSTokenVerifier {
  /**
   * Verifies POS token for lesser tokens.
   * 
   * @param req - The request containing the token to verify
   * @param posId - The POS identifier to verify against
   * @returns true if verification passes, false otherwise
   */
  public static async verify(req: RequestWithToken, posId: number): Promise<boolean> {
    const settingsStore = ServerSettingsStore.getInstance();
    const strictPosToken = settingsStore.getSetting('strictPosToken');

    if (strictPosToken) {
      // Strict mode: require the token to have a posId
      if (!req.token.posId) {
        return false;
      }
      
      // Verify the posId matches
      return req.token.posId === posId;
    } else {
      // Non-strict mode: if token has posId, it must match
      if (req.token.posId && req.token.posId !== posId) {
        return false;
      }
      return true;
    }
  }
}
