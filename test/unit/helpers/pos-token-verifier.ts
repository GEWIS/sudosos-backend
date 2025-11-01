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

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import POSTokenVerifier, { PosAuthenticationError } from '../../../src/helpers/pos-token-verifier';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import JsonWebToken from '../../../src/authentication/json-web-token';
import User from '../../../src/entity/user/user';

describe('POSTokenVerifier', (): void => {
  let mockRequest: RequestWithToken;
  let settingsStore: ServerSettingsStore;

  beforeEach(async (): Promise<void> => {
    // Create a mock user
    const user = Object.assign(new User(), {
      id: 1,
      firstName: 'Test',
      lastName: 'User',
    } as User);

    // Create a mock token
    const token = new JsonWebToken();
    token.user = user;
    token.roles = ['admin'];
    token.lesser = true;
    token.posId = 123;

    // Create mock request
    mockRequest = {
      token,
    } as RequestWithToken;

    // Get settings store instance
    settingsStore = ServerSettingsStore.getInstance();
  });

  afterEach(async (): Promise<void> => {
    // Reset settings to default
    await settingsStore.setSetting('strictPosToken', false);
  });

  describe('verify', (): void => {
    it('should pass verification when strictPosToken is false and token has no posId', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = undefined;

      // Should not throw
      await POSTokenVerifier.verify(mockRequest, 123);
    });

    it('should pass verification when strictPosToken is false and token posId matches', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = 123;

      // Should not throw
      await POSTokenVerifier.verify(mockRequest, 123);
    });

    it('should throw PosAuthenticationError when strictPosToken is false and token posId does not match', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = 456;

      try {
        await POSTokenVerifier.verify(mockRequest, 123);
        expect.fail('Expected PosAuthenticationError to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(PosAuthenticationError);
        expect(error.message).to.equal('Token posId does not match provided posId');
      }
    });

    it('should pass verification when strictPosToken is true and token posId matches', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = 123;

      // Should not throw
      await POSTokenVerifier.verify(mockRequest, 123);
    });

    it('should throw PosAuthenticationError when strictPosToken is true and token has no posId', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = undefined;

      try {
        await POSTokenVerifier.verify(mockRequest, 123);
        expect.fail('Expected PosAuthenticationError to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(PosAuthenticationError);
        expect(error.message).to.equal('Token must contain posId in strict mode');
      }
    });

    it('should throw PosAuthenticationError when strictPosToken is true and token posId does not match', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = 456;

      try {
        await POSTokenVerifier.verify(mockRequest, 123);
        expect.fail('Expected PosAuthenticationError to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(PosAuthenticationError);
        expect(error.message).to.equal('Token posId does not match provided posId');
      }
    });
  });
});
