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
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { ProductCategoryResponse } from './product-category-response';
import { PaginationResult } from '../../helpers/pagination';
import { DineroObjectResponse } from './dinero-response';
import { BaseVatGroupResponse } from './vat-group-response';

/**
 * @typedef {allOf|BaseResponse} BaseProductResponse
 * @property {string} name.required - The name of the product.
 * @property {DineroObjectResponse} priceInclVat.required - The price of the product.
 * @property {BaseVatGroupResponse} vat.required - The VAT percentage
 */
export interface BaseProductResponse extends BaseResponse {
  name: string,
  priceInclVat: DineroObjectResponse,
  vat: BaseVatGroupResponse,
}

/**
 * @typedef {allOf|BaseProductResponse} ProductResponse
 * @property {integer} revision.required - The product revision ID
 * @property {BaseUserResponse} owner.required - The owner of the product.
 * @property {ProductCategoryResponse} category.required -
 *           The category the product belongs to.
 * @property {DineroObjectResponse} priceExclVat.required - The price of the product
 *           excluding VAT
 * @property {string} image - The URL to the picture representing this product.
 * @property {number} alcoholPercentage.required - The percentage of alcohol in this product.
 */
export interface ProductResponse extends BaseProductResponse {
  revision: number,
  owner: BaseUserResponse,
  priceExclVat: DineroObjectResponse,
  category: ProductCategoryResponse,
  image?: string,
  alcoholPercentage: number,
}

/**
 * @typedef {object} PaginatedProductResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<ProductResponse>} records.required - Returned products
 */
export interface PaginatedProductResponse {
  _pagination: PaginationResult,
  records: ProductResponse[],
}
