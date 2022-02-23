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

export interface UpdateInvoiceParams {
  invoiceId: number,
  addressee: string,
  description: string,
  state?: InvoiceState,
  byId: number,
}

export interface BaseInvoice {
  toId: number,
  addressee: string,
  description: string,
  customEntries?: InvoiceEntryRequest[],
  transactionIDs?: number[],
  fromDate?: string,
}

export interface CreateInvoiceParams extends BaseInvoice {
  byId: number,
}

/**
 * @typedef CreateInvoiceRequest
 * @property {integer} toId.required - The recipient of the Invoice.
 * @property {integer} byId - The creator of the Invoice, defaults to the ID of the requester.
 * @property {string} addressee.required - Name of the addressed.
 * @property {string} description.required - The description of the invoice.
 * @property {Array.<InvoiceEntryRequest>} customEntries - Custom entries to be added to the invoice
 * @property {Array.<integer>} transactionIDs - IDs of the transactions to add to the Invoice.
 * @property {string} fromDate - For creating an Invoice for all transactions from a specific date.
 */
export interface CreateInvoiceRequest extends BaseInvoice{
  byId?: number,
}
