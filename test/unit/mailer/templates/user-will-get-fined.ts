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
import dinero from 'dinero.js';
import UserWillGetFined from '../../../../src/mailer/messages/user-will-get-fined';
import { Language } from '../../../../src/mailer/mail-message';
import { UserWillGetFinedOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('UserWillGetFinedTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;
  const fine = dinero({ amount: 200 });
  const balance = dinero({ amount: -150 });

  describe('with a recent reference date (within 15 minutes)', () => {
    const recent = new Date(Date.now() - 60 * 1000);
    const opts = new UserWillGetFinedOptions(recent, fine, balance);

    it('uses the "currently" phrasing in English', () => {
      const options = new UserWillGetFined(opts).getOptions(user, Language.ENGLISH);
      expect(options.subject).to.include('Next time you will get fined');
      expect(options.html).to.include('Currently, you have');
      expect(options.text).to.include('Currently, you have');
    });

    it('uses the "moment van schrijven" phrasing in Dutch', () => {
      const options = new UserWillGetFined(opts).getOptions(user, Language.DUTCH);
      expect(options.html).to.include('Op het moment van schrijven heb');
      expect(options.text).to.include('Op het moment van schrijven heb');
    });
  });

  describe('with an older reference date', () => {
    const older = new Date('2024-01-15T10:00:00Z');
    const opts = new UserWillGetFinedOptions(older, fine, balance);

    it('uses the historical date phrasing in English', () => {
      const options = new UserWillGetFined(opts).getOptions(user, Language.ENGLISH);
      expect(options.html).to.include('On ');
      expect(options.html).to.include('you had');
    });

    it('uses the historical date phrasing in Dutch', () => {
      const options = new UserWillGetFined(opts).getOptions(user, Language.DUTCH);
      expect(options.html).to.include('Op ');
      expect(options.html).to.include('had je een saldo');
    });
  });

  it('includes the fine amount and a positive balance with the bold formatting branch', () => {
    const positiveBalance = dinero({ amount: 100 });
    const opts = new UserWillGetFinedOptions(new Date('2024-01-15T10:00:00Z'), fine, positiveBalance);
    const options = new UserWillGetFined(opts).getOptions(user, Language.ENGLISH);
    expect(options.html).to.include(fine.toFormat());
    expect(options.html).to.include(positiveBalance.toFormat());
    expect(options.html).to.not.include('color: red');
  });

  it('throws for an unknown language', () => {
    const opts = new UserWillGetFinedOptions(new Date(), fine, balance);
    const tpl = new UserWillGetFined(opts);
    expect(() => tpl.getOptions(user, 'jp-JP' as any)).to.throw('Unknown language');
  });
});
