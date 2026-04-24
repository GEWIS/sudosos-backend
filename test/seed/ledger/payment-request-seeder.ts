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

import WithManager from '../../../src/database/with-manager';
import User from '../../../src/entity/user/user';
import PaymentRequest from '../../../src/entity/payment-request/payment-request';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';

/**
 * Seeds a mix of PaymentRequest rows covering the four derived statuses:
 * PENDING, PAID, CANCELLED, EXPIRED. Used by the test suite to assert
 * filtering/pagination and by dev seeding to give the dashboard something
 * to render.
 *
 * Rows are created by index % 4 so the distribution is deterministic and
 * independent of the order `users` is passed in.
 */
export default class PaymentRequestSeeder extends WithManager {
  /**
   * Seed `count` (default 8) PaymentRequest rows spread across the given
   * users. Each user gets at least one request when `count >= users.length`.
   *
   * @param users - Candidate beneficiaries. Must include at least one admin
   *   to act as `createdBy`.
   * @param admin - The user that appears as `createdBy` on every row.
   * @param count - How many rows to create. Defaults to 8.
   */
  public async seed(users: User[], admin: User, count = 8): Promise<PaymentRequest[]> {
    if (users.length === 0) return [];

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const rows: PaymentRequest[] = [];

    for (let i = 0; i < count; i += 1) {
      const recipient = users[i % users.length];
      const amount = DineroTransformer.Instance.from(500 + i * 100);
      const r = new PaymentRequest();
      r.for = recipient;
      r.createdBy = admin;
      r.amount = amount;
      r.description = `Seed PaymentRequest #${i + 1}`;

      // i % 4 === 0 -> PENDING (future expiry, not paid/cancelled)
      // i % 4 === 1 -> PAID    (paidAt set)
      // i % 4 === 2 -> CANCELLED
      // i % 4 === 3 -> EXPIRED (past expiry, not paid/cancelled)
      switch (i % 4) {
        case 0:
          r.expiresAt = new Date(now + 7 * oneDay);
          break;
        case 1:
          r.expiresAt = new Date(now + 7 * oneDay);
          r.paidAt = new Date(now - oneDay);
          break;
        case 2:
          r.expiresAt = new Date(now + 7 * oneDay);
          r.cancelledAt = new Date(now - oneDay);
          r.cancelledBy = admin;
          break;
        case 3:
        default:
          r.expiresAt = new Date(now - oneDay);
          break;
      }

      // eslint-disable-next-line no-await-in-loop
      const saved = await this.manager.getRepository(PaymentRequest).save(r);
      rows.push(saved);
    }

    return rows;
  }
}
