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

/**
 * @typedef CreateInvoiceRequest
 * @property {integer} toId.required - The recipient of the Invoice.
 * @property {string} addressee.required - Name of the addressed.
 * @property {string} description.required - The description of the invoice.
 * @property {Array.<integer>} products - IDs of the transactions to add to the Invoice.
 */
export default interface CreateInvoiceRequest {
  toId: number,
  addressee: string,
  description: string,
  transactionIDs?: number[]
}
