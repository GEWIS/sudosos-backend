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
 */

import {
  createArrayRule,
  Specification, toFail,
  toPass, validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import Container from '../../../entity/container/container';
import { BasePointOfSaleParams, CreatePointOfSaleParams, UpdatePointOfSaleParams } from '../point-of-sale-request';
import { ContainerParams } from '../container-request';
import stringSpec from './string-spec';
import {
  INVALID_CONTAINER_ID,
} from './validation-errors';
import { userMustExist } from './general-validators';
import { verifyContainerRequest } from './container-request-spec';

/**
 * Tests if the given param is either a valid container ID or ContainerRequest
 * @param p
 */
async function validContainerRequestOrId(p: number | ContainerParams) {
  if (typeof p === 'number') {
    const product = await Container.findOne({ where: { id: p } });
    if (!product) return toFail(INVALID_CONTAINER_ID(p));
    return toPass(p);
  }
  return Promise.resolve(await verifyContainerRequest(p));
}

/**
 * Specification of a basePointOfSale
 * Again we use a function since otherwise it tends to resuse internal ValidationErrors.
 */
const basePointOfSaleRequestSpec:<T extends BasePointOfSaleParams>() =>
Specification<T, ValidationError> = () => [
  [stringSpec(), 'name', new ValidationError('Name:')],
  [[createArrayRule([validContainerRequestOrId])], 'containers', new ValidationError('Containers:')],
];

/**
 * Specification of a createPointOfSaleRequest
 */
const createPointOfSaleRequestSpec
: () => Specification<CreatePointOfSaleParams, ValidationError> = () => [
  ...(basePointOfSaleRequestSpec<CreatePointOfSaleParams>()),
  [[userMustExist], 'ownerId', new ValidationError('ownerId:')],
];

export async function verifyCreatePointOfSaleRequest(createPointOfSaleRequest:
CreatePointOfSaleParams) {
  return Promise.resolve(await validateSpecification(
    createPointOfSaleRequest, createPointOfSaleRequestSpec(),
  ));
}

export async function verifyUpdatePointOfSaleRequest(updatePointOfSaleRequest:
UpdatePointOfSaleParams) {
  return Promise.resolve(await validateSpecification(
    updatePointOfSaleRequest, basePointOfSaleRequestSpec(),
  ));
}
