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
 *
 *  @license
 */

/**
 * This is the module page of the invoice-entry-request.
 *
 * @module invoices
 */

import { DineroObjectRequest } from './dinero-request';

/**
 * @typedef {object} InvoiceEntryRequest
 * @property {string} description.required - The description of the entry
 * @property {integer} amount.required - Amount of item sold.
 * @property {DineroObjectRequest} priceInclVat.required - The price per item.
 * @property {number} vatPercentage.required - The percentage of VAT applied to this item
 */
export default interface InvoiceEntryRequest {
  description: string,
  amount: number,
  priceInclVat: DineroObjectRequest,
  vatPercentage: number,
}
