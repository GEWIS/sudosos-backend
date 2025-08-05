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
import { describe } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { DataSource } from 'typeorm';
import UserService from '../../../src/service/user-service';
import { LocalUserTypes } from '../../../src/entity/user/user';
import WelcomeWithReset from '../../../src/mailer/messages/welcome-with-reset';
import WelcomeToSudosos from '../../../src/mailer/messages/welcome-to-sudosos';
import Mailer from '../../../src/mailer';
import AuthenticationService from '../../../src/service/authentication-service';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

describe('UserService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource
  };
  let sendStub: sinon.SinonStub;
  let createResetTokenStub: sinon.SinonStub;

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    ctx = { connection };
  });

  beforeEach(() => {
    // Setup mailer stub
    sendStub = sinon.stub().resolves();
    sinon.stub(Mailer, 'getInstance').returns({ send: sendStub } as any);

    // Setup authentication service stub
    createResetTokenStub = sinon.stub(AuthenticationService.prototype, 'createResetToken')
      .resolves({ token: 'reset-token' } as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('createUser', () => {
    it('should send WelcomeWithReset for local user types', async () => {
      const localType = LocalUserTypes[0];
      const result = await UserService.createUser({
        type: localType,
        email: 'test@local.com',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      expect(result).to.not.be.undefined;
      expect(sendStub.calledOnce).to.be.true;

      const [user, message] = sendStub.getCall(0).args;
      expect(user.email).to.equal('test@local.com');
      expect(message).to.be.instanceOf(WelcomeWithReset);
      expect(createResetTokenStub.calledOnce).to.be.true;
    });

    it('should send WelcomeToSudosos for non-local user types', async () => {
      // Use a valid non-local user type
      const nonLocalType = 'NON_LOCAL_USER_TYPE';
      const result = await UserService.createUser({
        type: nonLocalType,
        email: 'test@nonlocal.com',
        firstName: 'Test',
        lastName: 'User',
      } as any);

      expect(result).to.not.be.undefined;
      expect(sendStub.calledOnce).to.be.true;

      const [user, message] = sendStub.getCall(0).args;
      expect(user.email).to.equal('test@nonlocal.com');
      expect(message).to.be.instanceOf(WelcomeToSudosos);
      expect(createResetTokenStub.called).to.be.false;
    });
  });
});