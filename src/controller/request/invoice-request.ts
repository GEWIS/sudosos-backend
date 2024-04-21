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

import InvoiceEntryRequest from './invoice-entry-request';
import { InvoiceState } from '../../entity/invoices/invoice-status';

export interface BaseUpdateInvoice {
  addressee?: string,
  description?: string,
}

export interface UpdateInvoiceParams extends BaseUpdateInvoice {
  byId: number,
  invoiceId: number,
  state?: InvoiceState,
  street?: string;
  postalCode?:string;
  city?: string;
  country?: string;
  reference?: string;
}

/**
 * @typedef{object}  UpdateInvoiceRequest
 * @property {integer} byId - The user who updates the Invoice, defaults to the ID of the requester.
 * @property {string} addressee - Name of the addressed.
 * @property {string} description - The description of the invoice.
 * @property {string} state - enum:CREATED,SENT,PAID,DELETED - The state to set of the invoice,
 */
export interface UpdateInvoiceRequest extends BaseUpdateInvoice {
  byId?: number,
  state?: keyof typeof InvoiceState,
}

export interface BaseInvoice {
  forId: number,
  reference: string,
  description?: string,
  customEntries?: InvoiceEntryRequest[],
  transactionIDs?: number[],
  fromDate?: string,
  isCreditInvoice: boolean,
}

export interface CreateInvoiceParams extends BaseInvoice {
  byId: number,
  street: string;
  postalCode:string;
  city: string;
  country: string;
  addressee: string,
}

/**
 * @typedef {object} CreateInvoiceRequest
 * @property {integer} forId.required - The recipient of the Invoice.
 * @property {integer} byId - The creator of the Invoice, defaults to the ID of the requester.
 * @property {string} addressee - Name of the addressed, defaults to the fullname of the person being invoiced.
 * @property {string} description - The description of the invoice.
 * @property {string} reference.required - The reference of the invoice.
 * @property {Array<InvoiceEntryRequest>} customEntries - Custom entries to be added to the invoice
 * @property {Array<integer>} transactionIDs - IDs of the transactions to add to the Invoice.
 * @property {string} fromDate - For creating an Invoice for all transactions from a specific date.
 * @property {boolean} isCreditInvoice.required - If the invoice is an credit Invoice
 *  If an invoice is a credit invoice the relevant subtransactions are defined as all the sub transactions which have `subTransaction.toId == forId`.
 * @property {string} street - Street to use on the invoice, overwrites the users default.
 * @property {string} postalCode - Postal code to use on the invoice, overwrites the users default.
 * @property {string} city - City to use on the invoice, overwrites the users default.
 * @property {string} country - Country to use on the invoice, overwrites the users default.
 */
export interface CreateInvoiceRequest extends BaseInvoice {
  byId?: number,
  street?: string;
  postalCode?:string;
  city?: string;
  country?: string;
  addressee?: string,
}
