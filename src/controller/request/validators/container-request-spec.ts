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
import Product from '../../../entity/product/product';
import {
  createArrayRule,
  Specification,
  toFail,
  toPass, validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import verifyProductRequest from './product-request-spec';
import {
  BaseContainerParams,
  ContainerParams,
} from '../container-request';
import stringSpec from './string-spec';
import { ProductRequest } from '../product-request';
import { INVALID_PRODUCT_ID } from './validation-errors';

/**
 * Validates that param is either a valid Product ID or ProductRequest
 */
async function validProductRequestOrId(p: number | ProductRequest) {
  if (typeof p === 'number') {
    const product = await Product.findOne({ where: { id: p } });
    if (!product) return toFail(INVALID_PRODUCT_ID(p));
    return toPass(p);
  }
  return Promise.resolve(await verifyProductRequest(p));
}

/**
 * Specification of a baseContainerRequestSpec
 * Again we use a function since otherwise it tends to resuse internal ValidationErrors.
 */
const baseContainerRequestSpec: <T extends BaseContainerParams>()
=> Specification<T, ValidationError> = () => [
  [stringSpec(), 'name', new ValidationError('Name:')],
  // Turn our validProduct function into an array subspecification.
  [[createArrayRule([validProductRequestOrId])], 'products', new ValidationError('Products:')],
];

export default async function verifyContainerRequest(containerRequest:
ContainerParams) {
  return Promise.resolve(await validateSpecification(
    containerRequest, baseContainerRequestSpec(),
  ));
}
