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
import CreateProductParams, { BaseProductParams } from '../product-request';
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
import VatGroup from '../../../entity/vat-group';
import { ownerIsOrgan } from './general-validators';
import { DineroObjectRequest } from '../dinero-request';

const validAlcohol = (alcoholPercentage: number) => {
  if (alcoholPercentage < 0) {
    return toFail(new ValidationError('Alcohol percentage must be non-negative'));
  }
  return toPass(alcoholPercentage);
};

const validCategory = async (categoryId: number) => {
  const category = await ProductCategory.findOne(categoryId);
  if (!category) {
    return toFail(new ValidationError(`${categoryId} is an invalid product category.`));
  }
  return toPass(categoryId);
};

const validVatGroup = async (vat: number) => {
  const vatGroup = await VatGroup.find({ where: { id: vat } });
  if (!vatGroup || vatGroup.length === 0 || vatGroup[0].deleted) {
    return toFail(new ValidationError(`${vat} is an invalid VAT group.`));
  }
  return toPass(vat);
};

const validPrice = (priceInclVat: DineroObjectRequest) => {
  if (priceInclVat.amount < 0) {
    return toFail(INVALID_PRODUCT_PRICE());
  }
  return toPass(priceInclVat);
};

const baseProductRequestSpec: <T extends BaseProductParams>()
=> Specification<T, ValidationError> = () => [
  [stringSpec(), 'name', new ValidationError('Name:')],
  [[validPrice], 'priceInclVat', new ValidationError('priceInclVat:')],
  [[validCategory], 'category', new ValidationError('category:')],
  [[validVatGroup], 'vat', new ValidationError('vat:')],
  [[validAlcohol], 'alcoholPercentage', new ValidationError('alcoholPercentage:')],
];

const createProductRequestSpec: Specification<CreateProductParams, ValidationError> = [
  ...baseProductRequestSpec<CreateProductParams>(),
  [[ownerIsOrgan], 'ownerId', new ValidationError('ownerId:')],
];

export async function verifyProductRequest(productRequest: BaseProductParams) {
  return Promise.resolve(await validateSpecification<BaseProductParams, ValidationError>(
    productRequest, baseProductRequestSpec<BaseProductParams>(),
  ));
}

export async function verifyCreateProductRequest(productRequest: CreateProductParams) {
  return Promise.resolve(await validateSpecification<CreateProductParams, ValidationError>(
    productRequest, createProductRequestSpec,
  ));
}
