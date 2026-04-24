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
 * This is the module page of the payment-request-response.
 *
 * @module stripe/payment-request
 */

import BaseResponseWithoutId from './base-response-without-id';
import { BaseUserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { PaginationResult } from '../../helpers/pagination';
import { PaymentRequestStatus } from '../../entity/payment-request/payment-request-status';

/**
 * PaymentRequest is keyed by UUID, not integer id, so it extends
 * `BaseResponseWithoutId` (no id field) and declares its own `id: string`.
 *
 * @typedef {object} BasePaymentRequestResponse
 * @property {string} id.required - UUID v4 identifier (also the public share-link id).
 * @property {string} createdAt - ISO-8601 creation timestamp.
 * @property {string} updatedAt - ISO-8601 last update timestamp.
 * @property {integer} version - Optimistic-locking version.
 * @property {BaseUserResponse} for.required - The user whose balance will be credited on payment.
 * @property {BaseUserResponse} createdBy.required - The user that issued this request.
 * @property {DineroObjectResponse} amount.required - Fixed, immutable amount.
 * @property {string} expiresAt.required - ISO-8601 timestamp after which payments stop being accepted.
 * @property {string} paidAt - ISO-8601 timestamp the request was marked paid (null if not paid).
 * @property {string} cancelledAt - ISO-8601 timestamp the request was cancelled (null if not cancelled).
 * @property {BaseUserResponse} cancelledBy - The user that cancelled the request (null if not cancelled).
 * @property {BaseUserResponse} fulfilledBy - The admin that marked the request paid out-of-band (null for Stripe-settled or unpaid requests).
 * @property {string} description - Optional human-readable description.
 * @property {string} status.required - enum:PENDING,PAID,EXPIRED,CANCELLED - Derived lifecycle status.
 */
export interface BasePaymentRequestResponse extends BaseResponseWithoutId {
  id: string;
  for: BaseUserResponse;
  createdBy: BaseUserResponse;
  amount: DineroObjectResponse;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelledBy: BaseUserResponse | null;
  fulfilledBy: BaseUserResponse | null;
  description: string | null;
  status: PaymentRequestStatus;
}

/**
 * Minimal response returned to unauthenticated callers of the public share
 * link endpoint. It deliberately omits `createdBy`, `cancelledBy`, and other
 * internal audit fields — anyone with the link can see it, so we leak as
 * little user info as possible.
 *
 * @typedef {object} PublicPaymentRequestResponse
 * @property {string} id.required - UUID v4 identifier.
 * @property {string} forDisplayName.required - Recipient display name (e.g. "John D.").
 * @property {DineroObjectResponse} amount.required - Fixed amount to be paid.
 * @property {string} expiresAt.required - ISO-8601 timestamp after which payments stop being accepted.
 * @property {string} description - Optional human-readable description.
 * @property {string} status.required - enum:PENDING,PAID,EXPIRED,CANCELLED - Derived lifecycle status.
 */
export interface PublicPaymentRequestResponse {
  id: string;
  forDisplayName: string;
  amount: DineroObjectResponse;
  expiresAt: string;
  description: string | null;
  status: PaymentRequestStatus;
}

/**
 * Response returned from the "start payment" endpoint. Contains just enough
 * to let the browser redirect into the Stripe Payment Element.
 *
 * @typedef {object} PaymentRequestStartResponse
 * @property {string} paymentRequestId.required - The PaymentRequest id the intent is linked to.
 * @property {string} stripeId.required - Stripe payment intent id.
 * @property {string} clientSecret.required - Stripe client secret for the intent.
 */
export interface PaymentRequestStartResponse {
  paymentRequestId: string;
  stripeId: string;
  clientSecret: string;
}

/**
 * @typedef {object} PaginatedBasePaymentRequestResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<BasePaymentRequestResponse>} records.required - Returned payment requests
 */
export interface PaginatedBasePaymentRequestResponse {
  _pagination: PaginationResult;
  records: BasePaymentRequestResponse[];
}
