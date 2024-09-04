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


import InvoiceEntryRequest from './invoice-entry-request';
import { InvoiceState } from '../../entity/invoices/invoice-status';

export interface BaseUpdateInvoice {
  addressee?: string,
  description?: string,
  street?: string;
  postalCode?:string;
  city?: string;
  country?: string;
  reference?: string;
  attention?: string,
  date?: string,
}

export interface UpdateInvoiceParams extends BaseUpdateInvoice {
  byId: number,
  invoiceId: number,
  state?: InvoiceState,
}

/**
 * @typedef {object}  UpdateInvoiceRequest
 * @property {integer} byId - The user who updates the Invoice, defaults to the ID of the requester.
 * @property {string} addressee - Name of the addressed.
 * @property {string} description - The description of the invoice.
 * @property {string} state - enum:CREATED,SENT,PAID,DELETED - The state to set of the invoice,
 * @property {string} street - Street to use on the invoice.
 * @property {string} postalCode - Postal code to use on the invoice.
 * @property {string} city - City to use on the invoice.
 * @property {string} country - Country to use on the invoice.
 * @property {string} reference - Reference to use on the invoice.
 * @property {string} attention - Attention to use on the invoice.
 * @property {string} date - Date to use on the invoice.
 */
export interface UpdateInvoiceRequest extends BaseUpdateInvoice {
  byId?: number,
  state?: keyof typeof InvoiceState,
}

export interface InvoiceTransactionsRequest {
  forId: number,
  fromDate?: Date,
  tillDate?: Date,
}

export interface BaseInvoice {
  forId: number,
  customEntries?: InvoiceEntryRequest[],
  transactionIDs: number[],
}

export interface CreateInvoiceParams extends BaseInvoice {
  byId: number,
  street: string;
  postalCode:string;
  reference: string,
  description: string,
  city: string;
  country: string;
  addressee: string,
  date: Date,
  attention?: string,
}

/**
 * @typedef {object} CreateInvoiceRequest
 * @property {integer} forId.required - The recipient of the Invoice.
 * @property {integer} byId - The creator of the Invoice, defaults to the ID of the requester.
 * @property {string} addressee - Name of the addressed, defaults to the fullname of the person being invoiced.
 * @property {string} description.required - The description of the invoice.
 * @property {string} reference.required - The reference of the invoice.
 * @property {Array<InvoiceEntryRequest>} customEntries - Custom entries to be added to the invoice
 * @property {Array<integer>} transactionIDs.required - IDs of the transactions to add to the Invoice.
 * @property {string} street - Street to use on the invoice, overwrites the users default.
 * @property {string} postalCode - Postal code to use on the invoice, overwrites the users default.
 * @property {string} city - City to use on the invoice, overwrites the users default.
 * @property {string} country - Country to use on the invoice, overwrites the users default.
 * @property {string} date - Date to use on the invoice, overwrites the creation date.
 * @property {string} attention - Attention to use on the invoice.
 */
export interface CreateInvoiceRequest extends BaseInvoice {
  byId?: number,
  street?: string;
  postalCode?:string;
  city?: string;
  country?: string;
  addressee?: string,
  date?: Date,
  attention?: string,
  reference: string,
  description: string,
}
