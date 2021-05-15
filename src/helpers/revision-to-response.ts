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
import ProductRevision from '../entity/product/product-revision';
import { BaseProductResponse } from '../controller/response/product-response';
import { BaseContainerResponse } from '../controller/response/container-response';
import ContainerRevision from '../entity/container/container-revision';
import { BasePointOfSaleResponse } from '../controller/response/point-of-sale-response';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';

export function parseProductToBaseResponse(
  product: ProductRevision, timestamps: boolean,
): BaseProductResponse {
  return {
    id: product.product.id,
    name: product.name,
    price: product.price,
    createdAt: timestamps ? product.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? product.updatedAt.toISOString() : undefined,
  } as BaseProductResponse;
}

export function parseContainerToBaseResponse(
  container: ContainerRevision, timestamps: boolean,
): BaseContainerResponse {
  return {
    id: container.container.id,
    name: container.name,
    createdAt: timestamps ? container.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? container.updatedAt.toISOString() : undefined,
  } as BaseContainerResponse;
}

export function parsePOSToBasePOS(
  pos: PointOfSaleRevision, timestamps: boolean,
): BasePointOfSaleResponse {
  return {
    id: pos.pointOfSale.id,
    name: pos.name,
    createdAt: timestamps ? pos.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? pos.updatedAt.toISOString() : undefined,
  } as BasePointOfSaleResponse;
}
