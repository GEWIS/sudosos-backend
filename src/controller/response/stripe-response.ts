/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
import { StripePaymentIntentState } from '../../entity/stripe/stripe-payment-intent-status';
import { BaseUserResponse } from './user-response';

/**
 * @typedef {object} StripePublicKeyResponse
 * @property {string} publicKey.required - Stripe public key
 * @property {string} returnUrl.required - Redirect url after payment
 */
export interface StripePublicKeyResponse {
  publicKey: string;
  returnUrl: string;
}

/**
 * @typedef {allOf|BaseResponse} StripePaymentIntentResponse
 * @property {string} stripeId.required - ID of the intent in Stripe.
 * @property {string} clientSecret.required - The client secret of the created Payment Intent.
 */
export interface StripePaymentIntentResponse extends BaseResponse {
  stripeId: string;
  clientSecret: string;
}

// TODO find a fix for integer enums.
//  * @property {integer} state.required - enum:1,2,3,4 - State of the Stripe deposit. It can be 1 ('CREATED'), 2 ('PROCESSING'), 3 ('SUCCEEDED'), or 4 ('FAILED')
//  @see https://github.com/BRIKEV/express-jsdoc-swagger/issues/257
/**
 * @typedef {allOf|BaseResponse} StripePaymentIntentStatusResponse
 * @property {integer} state.required - State of the Stripe deposit. It can be 1 ('CREATED'), 2 ('PROCESSING'), 3 ('SUCCEEDED'), or 4 ('FAILED')
 */
export interface StripePaymentIntentStatusResponse extends BaseResponse {
  state: StripePaymentIntentState;
}

/**
 * @typedef {allOf|BaseResponse} StripeDepositResponse
 * @property {string} stripeId.required - The ID of the payment intent in Stripe
 * @property {Array<StripePaymentIntentStatusResponse>} depositStatus.required - Current status of the deposit
 * @property {DineroObjectResponse} amount.required - The amount deposited
 * @property {BaseUserResponse} to.required - User that deposited money
 */
export interface StripeDepositResponse extends BaseResponse {
  stripeId: string;
  depositStatus: StripePaymentIntentStatusResponse[];
  amount: DineroObjectResponse;
  to: BaseUserResponse;
}
