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
 * This is the module page of the vat-group-response.
 *
 * @module catalogue/vat
 */

import { DineroObject } from 'dinero.js';
import { PaginationResult } from '../../helpers/pagination';
import VatGroup, { VatDeclarationPeriod } from '../../entity/vat-group';
import BaseResponse from './base-response';

/**
 * @typedef {allOf|BaseResponse} BaseVatGroupResponse
 * @property {number} percentage.required - Percentage of VAT
 * @property {boolean} hidden.required - Whether VAT should be hidden
 */
export interface BaseVatGroupResponse extends BaseResponse {
  percentage: number,
  hidden: boolean,
}

/**
 * @typedef {allOf|BaseVatGroupResponse} VatGroupResponse
 * @property {string} name.required - Name of the VAT group
 * @property {boolean} deleted.required - Whether this group is soft-deleted
 */
export interface VatGroupResponse extends BaseVatGroupResponse {
  name: string,
  deleted: boolean,
}

/**
 * @typedef {object} PaginatedVatGroupResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<VatGroupResponse>} records.required - Returned VAT groups
 */
export interface PaginatedVatGroupResponse {
  _pagination: PaginationResult,
  records: VatGroup[],
}

/**
 * @typedef {object} VatDeclarationRow
 * @property {number} id.required - ID of the VAT group
 * @property {string} name.required - Name of the VAT group
 * @property {number} percentage.required - Percentage of VAT in this group
 * @property {Array<DineroObject>} values.required - Amount of VAT to be paid to the tax administration
 * per period
 */
export interface VatDeclarationRow {
  id: number;
  name: string;
  percentage: number;
  values: DineroObject[];
}

/**
 * @typedef {object} VatDeclarationResponse
 * @property {number} calendarYear.required - Calendar year of this result table
 * @property {string} period.required - The used VAT declaration period the rows below are based upon
 * @property {Array<VatDeclarationRow>} rows.required - The rows of the result table
 */
export interface VatDeclarationResponse {
  calendarYear: number;
  period: VatDeclarationPeriod,
  rows: VatDeclarationRow[],
}
