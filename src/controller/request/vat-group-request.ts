/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the vat-group-request.
 *
 * @module catalogue/vat
 */

/**
 * @typedef {object} UpdateVatGroupRequest
 * @property {string} name.required - Name of the VAT group
 * @property {boolean} deleted.required - Whether this group should be hidden
 * in the financial overviews when its value is zero
 * @property {boolean} hidden.required - Whether this group should
 * be hidden from transactions
 */
export interface UpdateVatGroupRequest {
  name: string,
  deleted: boolean,
  hidden: boolean,
}

/**
 * @typedef {allOf|UpdateVatGroupRequest} VatGroupRequest
 * @property {number} percentage.required - VAT percentage
 */
export interface VatGroupRequest extends UpdateVatGroupRequest {
  percentage: number,
}
