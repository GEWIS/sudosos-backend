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
 * This is the module page of the product-category-response.
 *
 * @module catalogue/product-categories
 */

import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} ProductCategoryResponse
 * @property {string} name.required - The name of the productCategory.
 * @property {ProductCategoryResponse} parent - The name of the productCategory.
 */
export interface ProductCategoryResponse extends BaseResponse {
  name: string,
  parent?: ProductCategoryResponse,
}

/**
 * @typedef {object} PaginatedProductCategoryResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array<ProductCategoryResponse>} records.required - Returned product categories
 */
export interface PaginatedProductCategoryResponse {
  _pagination: PaginationResult,
  records: ProductCategoryResponse[],
}
