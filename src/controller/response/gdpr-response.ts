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
import { BaseUserResponse, UserResponse } from './user-response';
import { TransactionResponse } from './transaction-response';
import { TransferResponse } from './transfer-response';
import { ProductResponse } from './product-response';
import { ContainerResponse } from './container-response';
import { PointOfSaleResponse } from './point-of-sale-response';
import { InvoiceResponse } from './invoice-response';
import { EventResponse } from './event-response';

/**
 * @typedef {UserResponse} GdprResponse
 * @property {BaseUserResponse} associatedUsers.required
 * @property {string} nfcAuthenticator
 * @property {string} eanAuthenticator
 * @property {Array<string>} roles.required
 * @property {Array<TransactionResponse>} transactions.required
 * @property {Array<TransferResponse>} transfers.required
 * @property {Array<InvoiceResponse>} invoices.required
 * @property {Array<string>} bannerImages.required
 * @property {Array<string>} productImages.required
 * @property {Array<ProductResponse>} ownedProducts.required
 * @property {Array<ContainerResponse>} ownedContainers.required
 * @property {Array<PointOfSaleResponse>} ownedPointsOfSale.required
 * @property {Array<EventResponse>} events.required
 */
export interface GdprResponse extends UserResponse {
  associatedUsers: BaseUserResponse[];
  nfcAuthenticator?: string;
  eanAuthenticator?: string;
  roles: string[];

  transactions: TransactionResponse[];
  transfers: TransferResponse[];
  invoices: InvoiceResponse[];

  bannerImages: string[];
  productImages: string[];

  ownedProducts: ProductResponse[];
  ownedContainers: ContainerResponse[];
  ownedPointsOfSale: PointOfSaleResponse[];

  events: EventResponse[];
}