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

/**
 * @typedef CreateProductRequest
 * @property {number} ownerId.required - ID of the owner
 * @property {string} name.required - Name of the product
 * @property {DineroObjectRequest} price.required - Price of the product
 * @property {number} price.required  - Price of the product
 * @property {number} category.required  - Category of the product
 * @property {number} alcoholPercentage.required  - Alcohol percentage of the product in 2 decimals
 */
export default interface CreateProductRequest {
  ownerId: number;
  name: string;
  price: DineroObjectRequest;
  category: number;
  alcoholPercentage: number;
}

/**
 * @typedef {CreateProductRequest} UpdateProductRequest
 * @property {integer} id.required - The id of the product to update
 */
export interface UpdateProductRequest extends CreateProductRequest {
  id: number;
}

export type ProductRequest = UpdateProductRequest | CreateProductRequest;
