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

/**
 * @module stripe/payment-request
 */

/**
 * Derived status of a {@link PaymentRequest}.
 *
 * The status is **not stored** on the entity — it is computed from the
 * combination of `paidAt`, `cancelledAt`, and `expiresAt` against the
 * current clock. See {@link PaymentRequest.status}.
 */
export enum PaymentRequestStatus {
  /** Awaiting payment, not yet expired or cancelled. */
  PENDING = 'PENDING',
  /** A linked StripeDeposit succeeded and the credit Transfer was created. */
  PAID = 'PAID',
  /** `expiresAt` has passed without payment. */
  EXPIRED = 'EXPIRED',
  /** Explicitly cancelled by an authorized user. */
  CANCELLED = 'CANCELLED',
}
