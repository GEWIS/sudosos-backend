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
import { BaseUserResponse } from './user-response';
import { TransferResponse } from './transfer-response';
import { PaginationResult } from '../../helpers/pagination';
import { InvoiceState } from '../../entity/invoices/invoice-status';

/**
 * @typedef InvoiceStatusResponse
 * @property {BaseUserResponse.model} changedBy.required - The user that changed the invoice status.
 * @property {string} state.required - The state of the invoice,
 * can be either CREATED, SENT, PAID or DELETED.
 */
export interface InvoiceStatusResponse {
  state: keyof typeof InvoiceState,
  changedBy: BaseUserResponse,
}

/**
 * @typedef InvoiceEntryResponse
 * @property {string} description.required - The description of the entry
 * @property {integer} amount.required - Amount of products sold.
 * @property {DineroObject.model} priceInclVat.required - The price per product.
 * @property {number} vatPercentage.required - The percentage of VAT applied to this entry
 */
export interface InvoiceEntryResponse {
  description: string,
  amount: number,
  priceInclVat: DineroObject
  vatPercentage: number;
}

/**
 * @typedef {BaseResponse} BaseInvoiceResponse
 * @property {BaseUserResponse.model} to.required - The person who was invoiced.
 * @property {string} addressee - Name of the addressed.
 * @property {string} description - Description of the invoice.
 * @property {TransferResponse.model} transfer - Transfer linked to the invoice.
 * @property {InvoiceStatusResponse.model} currentState - The current state of the invoice.
 */
export interface BaseInvoiceResponse extends BaseResponse {
  to: BaseUserResponse,
  addressee: string,
  description: string,
  transfer: TransferResponse,
  currentState: InvoiceStatusResponse,
}

/**
 * @typedef {BaseInvoiceResponse} InvoiceResponse
 * @property {Array.<InvoiceEntryResponse.model>} invoiceEntries - The entries of the invoice
 */
export interface InvoiceResponse extends BaseInvoiceResponse{
  invoiceEntries: InvoiceEntryResponse[]
}

/**
 * @typedef PaginatedInvoiceResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<BaseInvoiceResponse.model | InvoiceResponse.model>} records - Returned Invoices
 */
export interface PaginatedInvoiceResponse {
  _pagination: PaginationResult,
  records: (BaseInvoiceResponse | InvoiceResponse)[],
}
