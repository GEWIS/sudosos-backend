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
 * @typedef ProductRequest
 * @property {string} name - Name of the product
 * @property {number} price - Price of the product in 2 decimals
 * @property {number} category - Category of the product
 * @property {string} picture - URL of the product image
 * @property {number} alcoholPercentage - Alcohol percentage of the product in 2 decimals
 */
export default interface ProductRequest {
  name: string;
  price: number;
  category: number;
  picture: string;
  alcoholPercentage: number;
}

/**
 * @typedef ProductUpdateRequest
 * @property {string} [name] - Name of the product
 * @property {number} [price] - Price of the product in 2 decimals
 * @property {number} [category] - Category of the product
 * @property {string} [picture] - URL of the product image
 * @property {number} [alcoholPercentage] - Alcohol percentage of the product in 2 decimals
 */
export type ProductUpdateRequest = Partial<ProductRequest>;
