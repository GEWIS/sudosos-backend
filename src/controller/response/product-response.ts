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
import { DineroObject } from 'dinero.js';
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { ProductCategoryResponse } from './product-category-response';
import { PaginationResult } from '../../helpers/pagination';
import { BaseVatGroupResponse } from './vat-group-response';

/**
 * @typedef {BaseResponse} BaseProductResponse
 * @property {string} name.required - The name of the product.
 * @property {DineroObject.model} priceInclVat.required - The price of the product.
 */
export interface BaseProductResponse extends BaseResponse {
  name: string,
  priceInclVat: DineroObject,
}

/**
 * @typedef {BaseProductResponse} ProductResponse
 * @property {BaseUserResponse.model} owner.required - The owner of the product.
 * @property {DineroObject.model} priceExclVat.required - The price of the product excluding VAT
 * @property {BaseVatGroupResponse.model} vat.required - The VAT percentage
 * @property {ProductCategoryResponse.model} category.required
 *  - The category the product belongs to.
 * @property {string} image - The URL to the picture representing this product.
 * @property {integer} revision - The product revision ID
 * @property {integer} alcoholPercentage - The percentage of alcohol in this product.
 */
export interface ProductResponse extends BaseProductResponse {
  owner: BaseUserResponse,
  priceExclVat: DineroObject
  vat: BaseVatGroupResponse,
  category: ProductCategoryResponse,
  image: String,
  revision: number,
  alcoholPercentage: number,
}

/**
 * @typedef PaginatedProductResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<ProductResponse>} records - Returned products
 */
export interface PaginatedProductResponse {
  _pagination: PaginationResult,
  records: ProductResponse[],
}
