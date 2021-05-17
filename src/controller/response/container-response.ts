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
import { ProductResponse } from './product-response';
import BaseResponse from './base-response';
import User from '../../entity/user/user';

/**
 * @typedef {BaseResponse} BaseContainerResponse
 * @property {string} name.required - The name of the container.
 */
export interface BaseContainerResponse extends BaseResponse {
  name: string,
}
/**
 * @typedef {BaseContainerResponse} ContainerResponse
 * @property {number} revision - The revision of the container.
 * @property {User.model} owner.required - The owner of the container.
 * @property {BaseProductResponse} products.required - The products in the container.
 */
export interface ContainerResponse extends BaseContainerResponse {
  revision: number,
  owner: User,
  products: ProductResponse[],
}
