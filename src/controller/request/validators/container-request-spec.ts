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
import { getIdsAndRequests } from '../../../helpers/array-splitter';
import Product from '../../../entity/product/product';
import {
  Either,
  isFail,
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
import { INVALID_PRODUCT_IDS, PRODUCT_VALIDATION_FAIL } from './validation-errors';

async function validProducts<T extends BaseContainerParams>(c: T) {
  const { ids, requests } = getIdsAndRequests<ProductRequest>(c.products);

  const products = await Product.findByIds(ids);
  if (products.length !== ids.length) {
    return toFail(INVALID_PRODUCT_IDS());
  }

  const promises: Promise<Either<ValidationError, ProductRequest>>[] = [];
  requests.forEach((p) => {
    promises.push(verifyProductRequest(p).then((res) => res));
  });

  let results: Either<ValidationError, ProductRequest>[] = [];
  await Promise.all(promises).then((r) => { results = r; });

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (isFail(result)) return toFail(PRODUCT_VALIDATION_FAIL().join(result.fail));
  }

  return toPass(c);
}

function baseContainerRequestSpec<T extends BaseContainerParams>():
Specification<T, ValidationError> {
  return [
    [stringSpec(), 'name', new ValidationError('Name:')],
    validProducts,
  ];
}

export default async function verifyContainerRequest(containerRequest:
ContainerParams) {
  return Promise.resolve(await validateSpecification(
    containerRequest, baseContainerRequestSpec(),
  ));
}
