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
 * This is the module page of the payment-request-request.
 *
 * @module stripe/payment-request
 */

import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} CreatePaymentRequestRequest
 * @property {integer} forId.required - The ID of the user whose balance will be credited on payment.
 * @property {DineroObjectRequest} amount.required - Fixed, immutable amount to be paid.
 * @property {string} expiresAt.required - ISO-8601 timestamp after which the request stops accepting payments.
 * @property {string} description - Optional human-readable description (e.g. invoice reference).
 */
export interface CreatePaymentRequestRequest {
  forId: number;
  amount: DineroObjectRequest;
  expiresAt: string;
  description?: string;
}

/**
 * @typedef {object} MarkFulfilledExternallyRequest
 * @property {string} reason.required - Why this request is being marked paid out-of-band (audit trail).
 */
export interface MarkFulfilledExternallyRequest {
  reason: string;
}
