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

import { DineroObject } from 'dinero.js';
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { TransferResponse } from './transfer-response';
import { PaginationResult } from '../../helpers/pagination';
import { InvoiceState } from '../../entity/invoices/invoice-status';

/**
 * @typedef {object} InvoiceStatusResponse
 * @property {BaseUserResponse} changedBy.required - The user that changed the invoice status.
 * @property {string} state.required - enum:CREATED,SENT,PAID,DELETED - The state of the invoice
 */
export interface InvoiceStatusResponse {
  state: keyof typeof InvoiceState,
  changedBy: BaseUserResponse,
}

/**
 * @typedef {object} InvoiceEntryResponse
 * @property {string} description.required - The description of the entry
 * @property {integer} amount.required - Amount of products sold.
 * @property {DineroObject} priceInclVat.required - The price per product.
 * @property {number} vatPercentage.required - The percentage of VAT applied to this entry
 */
export interface InvoiceEntryResponse {
  description: string,
  amount: number,
  priceInclVat: DineroObject
  vatPercentage: number;
}

/**
 * @typedef {allOf|BaseResponse} BaseInvoiceResponse
 * @property {BaseUserResponse} to.required - The person who was invoiced.
 * @property {string} addressee.required - Name of the addressed.
 * @property {string} reference.required - Reference of the invoice.
 * @property {string} description.required - Description of the invoice.
 * @property {string} street.required - Street of the invoice.
 * @property {string} postalCode.required - Postal code of the invoice.
 * @property {string} city.required -  City of the invoice.
 * @property {string} country.required -  Country of the invoice.
 * @property {InvoiceStatusResponse} currentState.required - The current state of the invoice.
 * @property {TransferResponse} transfer - Transfer linked to the invoice.
 * @property {string} pdf - Pdf url path linked to the invoice
 */
export interface BaseInvoiceResponse extends BaseResponse {
  to: BaseUserResponse,
  addressee: string,
  reference: string,
  description: string,
  currentState: InvoiceStatusResponse,
  street: string;
  postalCode: string;
  city: string;
  country: string;
  transfer?: TransferResponse,
  pdf?: string,
}

/**
 * @typedef {allOf|BaseInvoiceResponse} InvoiceResponse
 * @property {Array<InvoiceEntryResponse>} invoiceEntries.required - The entries of the invoice
 */
export interface InvoiceResponse extends BaseInvoiceResponse {
  invoiceEntries: InvoiceEntryResponse[],
}

/**
 * @typedef {allOf|BaseInvoiceResponse} InvoiceResponseTypes
 * @property {Array<InvoiceEntryResponse>} invoiceEntries - The entries of the invoice
 */
export interface InvoiceResponseTypes extends BaseInvoiceResponse {
  invoiceEntries?: InvoiceEntryResponse[],
}

/**
 * @typedef {object} PaginatedInvoiceResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<InvoiceResponseTypes>} records.required - Returned Invoices
 */
export interface PaginatedInvoiceResponse {
  _pagination: PaginationResult,
  records: InvoiceResponseTypes[],
}
