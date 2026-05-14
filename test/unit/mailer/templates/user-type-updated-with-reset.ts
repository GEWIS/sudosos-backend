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

import { expect } from 'chai';
import UserTypeUpdatedWithReset from '../../../../src/mailer/messages/user-type-updated-with-reset';
import { Language } from '../../../../src/mailer/mail-message';
import { UserTypeUpdatedWithResetOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('UserTypeUpdatedWithResetTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;

  it('builds an English email with the from/to user types and the reset link', () => {
    const opts = new UserTypeUpdatedWithResetOptions(
      user.email,
      'MEMBER',
      'LOCAL_USER',
      'https://sudosos.test',
    );
    const options = new UserTypeUpdatedWithReset(opts).getOptions(user, Language.ENGLISH);
    expect(options.subject).to.equal('Account Type Changed - Set Password');
    expect(options.to).to.equal(user.email);
    expect(options.html).to.include('changed from MEMBER to LOCAL_USER');
    expect(options.html).to.include('https://sudosos.test/passwordreset?email=samuel@example.test');
    expect(options.text).to.include('changed from MEMBER to LOCAL_USER');
    expect(options.text).to.include('https://sudosos.test/passwordreset?email=samuel@example.test');
  });

  it('builds a Dutch email with the from/to user types and the reset link', () => {
    const opts = new UserTypeUpdatedWithResetOptions(
      user.email,
      'MEMBER',
      'LOCAL_USER',
      'https://sudosos.test',
    );
    const options = new UserTypeUpdatedWithReset(opts).getOptions(user, Language.DUTCH);
    expect(options.subject).to.equal('Account type gewijzigd - Wachtwoord instellen');
    expect(options.html).to.include('gewijzigd van MEMBER naar LOCAL_USER');
    expect(options.html).to.include('https://sudosos.test/passwordreset?email=samuel@example.test');
    expect(options.text).to.include('gewijzigd van MEMBER naar LOCAL_USER');
  });

  it('falls back to process.env.url when no url is given in the options', () => {
    const originalUrl = process.env.url;
    process.env.url = 'https://from-env.test';
    try {
      const opts = new UserTypeUpdatedWithResetOptions(
        user.email,
        'MEMBER',
        'LOCAL_USER',
      );
      const options = new UserTypeUpdatedWithReset(opts).getOptions(user, Language.ENGLISH);
      expect(options.html).to.include('https://from-env.test/passwordreset?email=samuel@example.test');
    } finally {
      if (originalUrl === undefined) delete process.env.url;
      else process.env.url = originalUrl;
    }
  });

  it('throws for an unknown language', () => {
    const opts = new UserTypeUpdatedWithResetOptions(
      user.email,
      'MEMBER',
      'LOCAL_USER',
      'https://sudosos.test',
    );
    const tpl = new UserTypeUpdatedWithReset(opts);
    expect(() => tpl.getOptions(user, 'kr-KR' as any)).to.throw('Unknown language');
  });
});
