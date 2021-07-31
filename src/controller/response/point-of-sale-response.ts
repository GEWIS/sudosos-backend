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
import User from '../../entity/user/user';
import { BaseContainerResponse, ContainerResponse } from './container-response';
import ProductOrdering from '../../entity/point-of-sale/product-ordering';

/**
 * @typedef {BaseResponse} BasePointOfSaleResponse
 * @property {string} name.required - The name of the point-of-sale.
 */
export interface BasePointOfSaleResponse extends BaseResponse {
  name: string,
}
/**
 * @typedef {BasePointOfSaleResponse} PointOfSaleResponse
 * @property {integer} revision - The revision of the point-of-sale.
 * @property {User.model} owner.required - The owner of the point-of-sale.
 * @property {BaseProductResponse} products.required - The products in the point-of-sale.
 */
export interface PointOfSaleResponse extends BasePointOfSaleResponse {
  revision: number,
  owner?: User,
  startDate: Date,
  endDate: Date,
  products?: BaseContainerResponse[] | ContainerResponse[],
  productOrder?: ProductOrdering,
  useAuthentication: boolean,
}
