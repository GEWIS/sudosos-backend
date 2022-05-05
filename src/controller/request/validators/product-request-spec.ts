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
import CreateProductParams, { ProductRequest } from '../product-request';
import {
  Specification,
  toFail,
  toPass,
  validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import ProductCategory from '../../../entity/product/product-category';
import stringSpec from './string-spec';
import { INVALID_PRODUCT_PRICE } from './validation-errors';

const validAlcohol = (p: CreateProductParams) => {
  if (p.alcoholPercentage < 0) {
    return toFail(new ValidationError('Alcohol percentage must be non-negative'));
  }
  return toPass(p);
};

const validCategory = async (p: CreateProductParams) => {
  const category = await ProductCategory.findOne(p.category);
  if (!category) {
    return toFail(new ValidationError(`${p.category} is an invalid product category.`));
  }
  return toPass(p);
};

const validPrice = (p: CreateProductParams) => {
  if (p.price.amount < 0) {
    return toFail(INVALID_PRODUCT_PRICE());
  }
  return toPass(p);
};

const productRequestSpec: Specification<CreateProductParams, ValidationError> = [
  [stringSpec(), 'name', new ValidationError('Name:')],
  validPrice,
  validCategory,
  validAlcohol,
];

async function verifyProductRequest(productRequest: ProductRequest) {
  return Promise.resolve(await validateSpecification<ProductRequest, ValidationError>(
    productRequest, productRequestSpec,
  ));
}

export default verifyProductRequest;
