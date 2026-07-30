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
import InactiveAdministrativeCostNotification from '../../../../src/mailer/messages/inactive-administrative-cost-notification';
import { Language } from '../../../../src/mailer/mail-message';
import { InactiveAdministrativeCostNotificationOptions } from '../../../../src/notifications/notification-options';
import User from '../../../../src/entity/user/user';

describe('InactiveAdministrativeCostNotificationTemplate', () => {
  const user = { firstName: 'Samuel', email: 'samuel@example.test' } as User;
  const administrativeCostValue = dinero({ amount: 1000 });
  const opts = new InactiveAdministrativeCostNotificationOptions(administrativeCostValue);

  it('builds an English email with the formatted amount exactly once and no misleading currency word', () => {
    const options = new InactiveAdministrativeCostNotification(opts).getOptions(user, Language.ENGLISH);
    expect(options.html).to.include(administrativeCostValue.toFormat());
    expect(options.text).to.include(administrativeCostValue.toFormat());
    expect(options.html).to.not.include('euros');
    expect(options.text).to.not.include('euros');
  });

  it('builds a Dutch email with the formatted amount exactly once and no misleading currency word', () => {
    const options = new InactiveAdministrativeCostNotification(opts).getOptions(user, Language.DUTCH);
    expect(options.html).to.include(administrativeCostValue.toFormat());
    expect(options.text).to.include(administrativeCostValue.toFormat());
    expect(options.html).to.not.include('euro van');
    expect(options.text).to.not.include('euro van');
  });
});
