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
import ProductCategory from '../../entity/product/product-category';
import ProductRevision from '../../entity/product/product-revision';
import Dinero from 'dinero.js';
import { TransactionFilterParameters } from '../../service/transaction-service';
import { BaseProductResponse } from './product-response';
import { DineroObjectResponse } from './dinero-response';
import { ProductCategoryResponse } from './product-category-response';
import VatGroup from '../../entity/vat-group';
import { BaseVatGroupResponse } from './vat-group-response';

export interface TransactionReportEntry {
  count: number,
  product: ProductRevision,
}

export interface TransactionReportVatEntry {
  vat: VatGroup,
  totalExclVat: number,
  totalInclVat: Dinero.Dinero
}

export interface TransactionReportCategoryEntry {
  category: ProductCategory,
  totalExclVat: number,
  totalInclVat: Dinero.Dinero
}

export interface TransactionReportData {
  entries: TransactionReportEntry[],
  categories: TransactionReportCategoryEntry[],
  vat: TransactionReportVatEntry[],
}

export interface TransactionReport {
  parameters: TransactionFilterParameters,
  data: TransactionReportData,
}

/**
 * @typedef TransactionFilterParameters
 * @property {Array.<number>} transactionId
 * @property {number} fromId
 * @property {number} createdById
 * @property {number} toId
 * @property {number} pointOfSaleId
 * @property {number} pointOfSaleRevision
 * @property {number} containerId
 * @property {number} containerRevision
 * @property {number} productId
 * @property {number} productRevision
 * @property {string} fromDate
 * @property {string} tillDate
 * @property {number} invoiceId
 */

/**
 * @typedef TransactionReportVatEntryResponse
 * @property {BaseVatGroupResponse.model} vat.required - The vat group of this entry
 * @property {DineroObjectResponse.model} totalInclVat.required - The price of this entry incl. vat
 * @property {DineroObjectResponse.model} totalExclVat.required - The price of this entry excl. vat
 */
export interface TransactionReportVatEntryResponse {
  vat: BaseVatGroupResponse,
  totalExclVat: DineroObjectResponse,
  totalInclVat: DineroObjectResponse,
}

/**
 * @typedef TransactionReportCategoryEntryResponse
 * @property {ProductCategoryResponse.model} category.required - The category of this entry
 * @property {DineroObjectResponse.model} totalInclVat.required - The price of this entry incl. vat
 * @property {DineroObjectResponse.model} totalExclVat.required - The price of this entry excl. vat
 */
export interface TransactionReportCategoryEntryResponse {
  category: ProductCategoryResponse,
  totalExclVat: DineroObjectResponse,
  totalInclVat: DineroObjectResponse,
}

/**
 * @typedef TransactionReportEntryResponse
 * @property {integer} count.required - The amount of times this product is in the report
 * @property {BaseProductResponse.model} product.required - The product for this entry
 * @property {DineroObjectResponse.model} totalInclVat.required - The price of this entry incl. vat
 * @property {DineroObjectResponse.model} totalExclVat.required - The price of this entry excl. vat
 */
export interface TransactionReportEntryResponse {
  count: number,
  product: BaseProductResponse,
  totalInclVat: DineroObjectResponse,
  totalExclVat: DineroObjectResponse,
}

/**
 * @typedef TransactionReportDataResponse
 * @property {Array.<TransactionReportEntryResponse>} entries.required - The entries grouped by product
 * @property {Array.<TransactionReportCategoryEntryResponse>} categories.required - The entries grouped by category
 * @property {Array.<TransactionReportVatEntryResponse>} vat.required - The entries grouped by vat
 */
export interface TransactionReportDataResponse {
  entries: TransactionReportEntryResponse[],
  categories: TransactionReportCategoryEntryResponse[],
  vat: TransactionReportVatEntryResponse[],
}

/**
 * @typedef TransactionReportResponse
 * @property {TransactionFilterParameters.model} parameters.required - The parameters used for the report
 * @property {TransactionReportDataResponse.model} data.required - The data that makes up the report
 * @property {DineroObjectResponse.model} totalExclVat.required - The total amount of money excl. vat of this report
 * @property {DineroObjectResponse.model} totalInclVat.required - The total amount of money inc. vat of this report
 */
export interface TransactionReportResponse {
  parameters: TransactionFilterParameters,
  data: TransactionReportDataResponse,
  totalExclVat: DineroObjectResponse,
  totalInclVat: DineroObjectResponse,
}
