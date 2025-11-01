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
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { DataSource } from 'typeorm';
import database from '../../../src/database/database';
import { finishTestDB } from '../../helpers/test-helpers';
import POSTokenVerifier from '../../../src/helpers/pos-token-verifier';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';
import JsonWebToken from '../../../src/authentication/json-web-token';
import User from '../../../src/entity/user/user';

describe('POSTokenVerifier', (): void => {
  let mockRequest: RequestWithToken;
  let settingsStore: ServerSettingsStore;
  let connection: DataSource;

  before(async (): Promise<void> => {
    connection = await database.initialize();
    ServerSettingsStore.deleteInstance();
    settingsStore = await ServerSettingsStore.getInstance().initialize();
  });

  after(async (): Promise<void> => {
    await finishTestDB(connection);
  });

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
  });

  afterEach(async (): Promise<void> => {
    // Reset settings to default
    await settingsStore.setSetting('strictPosToken', false);
  });

  describe('verify', (): void => {
    it('should return true when strictPosToken is false and token has no posId', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = undefined;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.true;
    });

    it('should return true when strictPosToken is false and token posId matches', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = 123;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.true;
    });

    it('should return false when strictPosToken is false and token posId does not match', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', false);
      mockRequest.token.posId = 456;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.false;
    });

    it('should return true when strictPosToken is true and token posId matches', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = 123;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.true;
    });

    it('should return false when strictPosToken is true and token has no posId', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = undefined;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.false;
    });

    it('should return false when strictPosToken is true and token posId does not match', async (): Promise<void> => {
      await settingsStore.setSetting('strictPosToken', true);
      mockRequest.token.posId = 456;

      const result = await POSTokenVerifier.verify(mockRequest, 123);
      expect(result).to.be.false;
    });
  });
});
