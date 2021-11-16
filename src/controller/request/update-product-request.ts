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
import User from '../../entity/user/user';
import ProductCategory from '../../entity/product/product-category';

/**
 * @typedef UpdateProductRequest
 * @property {number} id.required
 * @property {string} name.required
 * @property {Dinero.model} price.required
 * @property {User.model} owner.required
 * @property {ProductCategory.model} category.required
 * @property {number} alcoholPercentage
 */
export default interface UpdateProductRequest {
  id: number,
  name: string,
  price: DineroObject,
  owner: User,
  category: ProductCategory,
  alcoholPercentage?: number,
}
