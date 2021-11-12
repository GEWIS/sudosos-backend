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
import { DineroObject } from 'dinero.js';
import BaseResponse from './base-response';
import { BaseUserResponse, UserResponse } from './user-response';
import { InvoiceState } from '../../entity/invoices/invoice-status';

/**
 * @typedef InvoiceStatusResponse
 * @property {string} dateChanged.required - Date when the state of the invoice was changed.
 * @property {BaseUserResponse.model} changedBy.required - The user that changed the invoice status.
 * @property {enum} state.required - The state of the invoice.
 */
export interface InvoiceStatusResponse {
  dateChanged: string,
  state: InvoiceState,
  changedBy: BaseUserResponse,
}

/**
 * @typedef InvoiceEntryResponse
 * @property {string} description.required - The description of the entry
 * @property {integer} amount.required - Amount of products sold.
 * @property {DineroObject.model} price.required - The price per product.
 */
export interface InvoiceEntryResponse {
  description: string,
  amount: number,
  price: DineroObject
}

/**
 * @typedef {BaseResponse} BaseInvoiceResponse
 * @property {BaseUserResponse} to.required - The person who was invoiced.
 * @property {string} addressee - Name of the addressed.
 * @property {string} description - Description of the invoice.
 * @property {InvoiceStatusResponse} currentState - The current state of the invoice.
 */
export interface BaseInvoiceResponse extends BaseResponse {
  to: BaseUserResponse,
  addressee: string,
  description: string,
  currentState: InvoiceStatusResponse,
}

/**
 * @typedef {BaseInvoiceResponse} InvoiceResponse
 * @property {Array.<InvoiceEntryResponse>} invoiceEntries - The entries of the invoice
 */
export interface InvoiceResponse extends BaseInvoiceResponse{
  invoiceEntries: InvoiceEntryResponse[]
}
