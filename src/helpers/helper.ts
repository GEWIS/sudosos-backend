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
import ContainerRequest, { ContainerRequestID } from '../controller/request/container-request';
import { ProductRequestID } from '../controller/request/product-request';
import UpdatePointOfSaleRequest from '../controller/request/update-point-of-sale-request';

export default function splitTypes<S, T>(array: any[], split: string) {
  const type: S[] = [];
  const remainder: T[] = [];
  array.forEach((item) => {
    console.error(item);
    if (typeof item === split) {
      type.push(item);
    } else {
      remainder.push(item);
    }
  });
  return { type, remainder };
}

export function getIdsAndRequests<T extends ContainerRequestID | ProductRequestID>(
  update: ContainerRequest | UpdatePointOfSaleRequest,
) {
  let array;
  if (Object.prototype.hasOwnProperty.call(update, 'products')) {
    array = (update as ContainerRequest).products;
  } else {
    array = (update as UpdatePointOfSaleRequest).containers;
  }
  const split = splitTypes<number, T>(array, 'number');
  const ids: number[] = split.type;
  const requests: T[] = split.remainder;
  requests.forEach((c) => ids.push(c.id));
  return { ids, requests };
}
