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
import PasswordReset from '../../../../src/mailer/messages/password-reset';
import { Language } from '../../../../src/mailer/mail-message';
import { WelcomeWithResetOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('PasswordResetTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;
  const resetTokenInfo = { password: 'abc123' } as any;

  it('builds an English email with a reset link using the supplied url', () => {
    const opts = new WelcomeWithResetOptions(
      user.email,
      resetTokenInfo,
      'https://sudosos.test',
    );
    const options = new PasswordReset(opts).getOptions(user, Language.ENGLISH);
    expect(options.subject).to.equal('Password reset');
    expect(options.to).to.equal(user.email);
    expect(options.html).to.include('https://sudosos.test/passwordreset?token=abc123&email=samuel@example.test');
    expect(options.text).to.include('https://sudosos.test/passwordreset?token=abc123&email=samuel@example.test');
  });

  it('builds a Dutch email with a reset link using the supplied url', () => {
    const opts = new WelcomeWithResetOptions(
      user.email,
      resetTokenInfo,
      'https://sudosos.test',
    );
    const options = new PasswordReset(opts).getOptions(user, Language.DUTCH);
    expect(options.subject).to.equal('Wachtwoord resetten');
    expect(options.html).to.include('https://sudosos.test/passwordreset?token=abc123&email=samuel@example.test');
    expect(options.text).to.include('https://sudosos.test/passwordreset?token=abc123&email=samuel@example.test');
  });

  it('falls back to process.env.url when no url is given in the options', () => {
    const originalUrl = process.env.url;
    process.env.url = 'https://from-env.test';
    try {
      const opts = new WelcomeWithResetOptions(user.email, resetTokenInfo);
      const options = new PasswordReset(opts).getOptions(user, Language.ENGLISH);
      expect(options.html).to.include('https://from-env.test/passwordreset?token=abc123&email=samuel@example.test');
    } finally {
      if (originalUrl === undefined) delete process.env.url;
      else process.env.url = originalUrl;
    }
  });

  it('throws for an unknown language', () => {
    const opts = new WelcomeWithResetOptions(user.email, resetTokenInfo, 'https://sudosos.test');
    const tpl = new PasswordReset(opts);
    expect(() => tpl.getOptions(user, 'kr-KR' as any)).to.throw('Unknown language');
  });
});
