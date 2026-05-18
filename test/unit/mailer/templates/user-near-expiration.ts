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
import UserNearExpiration from '../../../../src/mailer/messages/user-near-expiration';
import { Language } from '../../../../src/mailer/mail-message';
import { UserNearExpirationOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('UserNearExpirationTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;
  const opts = new UserNearExpirationOptions(new Date('2025-12-31T12:00:00Z'));
  let originalFR: string | undefined;

  beforeAll(() => {
    originalFR = process.env.FINANCIAL_RESPONSIBLE;
  });

  afterAll(() => {
    if (originalFR === undefined) {
      delete process.env.FINANCIAL_RESPONSIBLE;
    } else {
      process.env.FINANCIAL_RESPONSIBLE = originalFR;
    }
  });

  describe('without a configured financial responsible', () => {
    beforeAll(() => { delete process.env.FINANCIAL_RESPONSIBLE; });

    it('builds an English email with a generic contact line', () => {
      const options = new UserNearExpiration(opts).getOptions(user, Language.ENGLISH);
      expect(options.subject).to.equal('Your SudoSOS account will expire soon');
      expect(options.to).to.equal(user.email);
      expect(options.text).to.include('within 30 days');
      expect(options.html).to.include('contact the Treasurer of the BAr Committee.');
      expect(options.html).to.not.include('mailto:treasurer');
    });

    it('builds a Dutch email with a generic contact line', () => {
      const options = new UserNearExpiration(opts).getOptions(user, Language.DUTCH);
      expect(options.subject).to.equal('Uw SudoSOS-account verloopt binnenkort');
      expect(options.text).to.include('binnen 30 dagen');
      expect(options.html).to.include('penningmeester van de BAr Commissie.');
      expect(options.html).to.not.include('mailto:treasurer');
    });
  });

  describe('with a configured financial responsible', () => {
    beforeAll(() => { process.env.FINANCIAL_RESPONSIBLE = 'treasurer@example.test'; });
    afterAll(() => { delete process.env.FINANCIAL_RESPONSIBLE; });

    it('renders an English mailto link to the treasurer', () => {
      const options = new UserNearExpiration(opts).getOptions(user, Language.ENGLISH);
      expect(options.html).to.include('mailto:treasurer@example.test');
      expect(options.text).to.include('treasurer@example.test');
    });

    it('renders a Dutch mailto link to the treasurer', () => {
      const options = new UserNearExpiration(opts).getOptions(user, Language.DUTCH);
      expect(options.html).to.include('mailto:treasurer@example.test');
      expect(options.text).to.include('treasurer@example.test');
    });
  });

  it('throws for an unknown language', () => {
    const tpl = new UserNearExpiration(opts);
    expect(() => tpl.getOptions(user, 'fr-FR' as any)).to.throw('Unknown language');
  });
});
