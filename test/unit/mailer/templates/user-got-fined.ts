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
import UserGotFined from '../../../../src/mailer/messages/user-got-fined';
import { Language } from '../../../../src/mailer/mail-message';
import { UserGotFinedOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('UserGotFinedTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;
  const referenceDate = new Date('2024-01-15T10:00:00Z');
  const balance = dinero({ amount: -500 });
  const fine = dinero({ amount: 200 });
  const totalFine = dinero({ amount: 500 });
  const opts = new UserGotFinedOptions(referenceDate, fine, totalFine, balance);

  it('builds an English email including the formatted fine amount in the subject', () => {
    const options = new UserGotFined(opts).getOptions(user, Language.ENGLISH);
    expect(options.subject).to.include(fine.toFormat());
    expect(options.subject).to.include('fined');
    expect(options.to).to.equal(user.email);
    expect(options.html).to.include(balance.toFormat());
    expect(options.html).to.include(totalFine.toFormat());
    expect(options.text).to.include(fine.toFormat());
  });

  it('builds a Dutch email including the formatted fine amount in the subject', () => {
    const options = new UserGotFined(opts).getOptions(user, Language.DUTCH);
    expect(options.subject).to.include(fine.toFormat());
    expect(options.subject).to.include('boete');
    expect(options.html).to.include(balance.toFormat());
    expect(options.html).to.include(totalFine.toFormat());
    expect(options.text).to.include('had je een saldo van');
    expect(options.text).to.include(fine.toFormat());
  });

  it('throws for an unknown language', () => {
    const tpl = new UserGotFined(opts);
    expect(() => tpl.getOptions(user, 'jp-JP' as any)).to.throw('Unknown language');
  });
});
