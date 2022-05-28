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

import { DineroObjectRequest } from './dinero-request';

export interface BaseProductParams {
  priceInclVat: DineroObjectRequest;
  vat: number;
  category: number;
  alcoholPercentage: number;
  name: string;
}

export default interface CreateProductParams extends BaseProductParams{
  ownerId: number;
}

export interface UpdateProductParams extends BaseProductParams {
  id: number;
}

export type ProductRequest = UpdateProductParams | CreateProductParams;

/**
 * @typedef CreateProductRequest
 * @property {number} ownerId - ID of the owner
 * @property {string} name.required - Name of the product
 * @property {DineroObjectRequest.model} priceInclVat.required - Price of the product
 * @property {number} vat.required - VAT group ID of the product
 * @property {number} category.required  - Category of the product
 * @property {number} alcoholPercentage.required  - Alcohol percentage of the product in 2 decimals
 */
export interface CreateProductRequest extends BaseProductParams {
  ownerId?: number,
}

/**
 * @typedef UpdateProductRequest
 * @property {string} name.required - Name of the product
 * @property {DineroObjectRequest.model} priceInclVat.required - Price of the product
 * @property {number} vat.required - VAT group ID of the product
 * @property {number} category.required  - Category of the product
 * @property {number} alcoholPercentage.required  - Alcohol percentage of the product in 2 decimals
 */
export type UpdateProductRequest = BaseProductParams;
