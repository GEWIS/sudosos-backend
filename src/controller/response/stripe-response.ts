/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */

import BaseResponse from './base-response';
import { DineroObjectResponse } from './dinero-response';

/**
 * @typedef {BaseResponse} StripePaymentIntentResponse
 * @property {string} stripeId.required - ID of the intent in Stripe.
 * @property {string} clientSecret.required - The client secret of the created Payment Intent.
 */
export interface StripePaymentIntentResponse extends BaseResponse {
  stripeId: string;
  clientSecret: string;
}

/**
 * @typedef {BaseResponse} StripeDepositResponse
 * @property {string} stripeId.required - The ID of the payment intent in Stripe
 * @property {string} depositStatus.required - Current status of the deposit
 * @property {DineroObjectResponse.model} amount.required - The amount deposited
 */
export interface StripeDepositResponse extends BaseResponse {
  stripeId: string;
  depositStatus: string;
  amount: DineroObjectResponse
}
