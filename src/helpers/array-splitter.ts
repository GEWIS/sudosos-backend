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
 * This is the module page of the array-splitter.
 *
 * @module internal/helpers
 */

import { ContainerParams } from '../controller/request/container-request';
import { ProductRequest } from '../controller/request/product-request';

export default function splitTypes<S, T>(array: any[], split: string) {
  const type: S[] = [];
  const remainder: T[] = [];
  array.forEach((item) => {
    if (typeof item === split) {
      type.push(item);
    } else {
      remainder.push(item);
    }
  });
  return { type, remainder };
}

type IdOrRequest<T = ContainerParams | ProductRequest> = (number | (T))[];

export function getIdsAndRequests<T>(
  array: IdOrRequest<T>,
) {
  const split = splitTypes<number, T>(array, 'number');
  const ids: number[] = split.type;
  const requests: T[] = split.remainder;
  requests.forEach((c) => { if ((c as any).id) ids.push((c as any).id); });
  return { ids, requests };
}

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
