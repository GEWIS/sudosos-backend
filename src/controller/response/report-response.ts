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
 * This is the module page of the report-response.
 *
 * @module reports
 */

import { DineroObjectResponse } from './dinero-response';
import { VatGroupResponse } from './vat-group-response';
import { BaseProductResponse } from './product-response';
import { ProductCategoryResponse } from './product-category-response';
import { BasePointOfSaleResponse } from './point-of-sale-response';
import { BaseContainerResponse } from './container-response';

/**
 * @typedef {object} ReportEntryResponse
 * @property {DineroObjectResponse} totalExclVat.required - totalExclVat
 * @property {DineroObjectResponse} totalInclVat.required - totalInclVat
 */
export interface ReportEntryResponse {
  totalExclVat: DineroObjectResponse,
  totalInclVat: DineroObjectResponse
}

/**
 * @typedef {allOf|ReportEntryResponse} ReportProductEntryResponse
 * @property {integer} count.required - count
 * @property {BaseProductResponse} product.required - product
 */
export interface ReportProductEntryResponse extends ReportEntryResponse {
  count: number,
  product: BaseProductResponse,
}

/**
 * @typedef {allOf|ReportEntryResponse} ReportVatEntryResponse
 * @property {VatGroupResponse} vat.required - vat
 */
export interface ReportVatEntryResponse extends ReportEntryResponse {
  vat: VatGroupResponse,
}

/**
 * @typedef {allOf|ReportEntryResponse} ReportCategoryEntryResponse
 * @property {ProductCategoryResponse} category.required - category
 */
export interface ReportCategoryEntryResponse extends ReportEntryResponse {
  category: ProductCategoryResponse,
}

/**
 * @typedef {allOf|ReportEntryResponse} ReportPosEntryResponse
 * @property {BasePointOfSaleResponse} pos.required - pos
 */
export interface ReportPosEntryResponse extends ReportEntryResponse {
  pos: BasePointOfSaleResponse,
}

/**
 * @typedef {allOf|ReportEntryResponse} ReportContainerEntryResponse
 * @property {BaseContainerResponse} container.required - container
 */
export interface ReportContainerEntryResponse extends ReportEntryResponse {
  container: BaseContainerResponse,
}

/**
 * @typedef {object} ReportDataResponse
 * @property {Array<ReportProductEntryResponse>} products - products
 * @property {Array<ReportCategoryEntryResponse>} categories - categories
 * @property {Array<ReportVatEntryResponse>} vat - vat
 * @property {Array<ReportPosEntryResponse>} pos - pos
 * @property {Array<ReportContainerEntryResponse>} containers - containers
 */
export interface ReportDataResponse {
  products?: ReportProductEntryResponse[],
  categories?: ReportCategoryEntryResponse[],
  vat?: ReportVatEntryResponse[],
  pos?: ReportPosEntryResponse[],
  containers?: ReportContainerEntryResponse[],
}

/**
 * @typedef {object} ReportResponse
 * @property {integer} forId.required - forId
 * @property {string} fromDate.required - fromDate
 * @property {string} tillDate.required - tillDate
 * @property {ReportDataResponse} data.required - data
 * @property {DineroObjectResponse} totalExclVat.required - totalExclVat
 * @property {DineroObjectResponse} totalInclVat.required - totalInclVat
 */
export interface ReportResponse {
  forId: number,
  fromDate: string,
  tillDate: string,
  data: ReportDataResponse,
  totalExclVat: DineroObjectResponse,
  totalInclVat: DineroObjectResponse,
}
