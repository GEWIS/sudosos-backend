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

import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import User, { UserType } from '../../src/entity/user/user';
import ProductRevision from '../../src/entity/product/product-revision';
import ContainerRevision from '../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';
import { BaseTransactionResponse } from '../../src/controller/response/transaction-response';
import { BaseUserResponse, UserResponse } from '../../src/controller/response/user-response';
import { BasePointOfSaleResponse } from '../../src/controller/response/point-of-sale-response';

export function verifyUserEntity(
  spec: SwaggerSpecification, user: User,
): void {
  const validation = spec.validateModel('User', user, false, true);
  expect(validation.valid).to.be.true;

  expect(user.id).to.be.greaterThan(-1);
  expect(user.firstName).to.not.be.empty;
  expect(user.active).to.not.be.null;
  expect(user.deleted).to.be.false;
  expect(Object.values(UserType)).to.include(user.type);
}

export function verifyBaseUserResponse(
  spec: SwaggerSpecification, userResponse: BaseUserResponse,
): void {
  const validation = spec.validateModel('BaseUserResponse', userResponse, true, false);
  expect(validation.valid).to.be.true;
  expect(userResponse.id).to.be.at.least(0);
  expect(userResponse.firstName).to.be.not.empty;
  expect(userResponse.lastName).to.be.not.undefined;
  expect(userResponse.lastName).to.be.not.null;
  expect(userResponse.nickname).to.satisfy((nick: string) => nick == null || nick.length >= 1);
}

export function verifyUserResponse(
  spec: SwaggerSpecification, userResponse: UserResponse, canBeDeleted?: boolean,
): void {
  const validation = spec.validateModel('UserResponse', userResponse, true, false);
  expect(validation.valid).to.be.true;
  expect(userResponse.id).to.be.at.least(0);
  expect(userResponse.firstName).to.be.not.empty;
  expect(userResponse.lastName).to.be.not.undefined;
  expect(userResponse.lastName).to.be.not.null;
  expect(userResponse.nickname).to.satisfy((nick: string) => nick == null || nick.length >= 1);
  expect(userResponse.active).to.not.be.null;
  if (canBeDeleted) {
    expect(userResponse.deleted).to.be.a('boolean');
  } else {
    expect(userResponse.deleted).to.be.false;
  }
}

export function verifyProductEntity(
  spec: SwaggerSpecification, product: ProductRevision,
): void {
  const validation = spec.validateModel('Product', product, false, true);
  expect(validation.valid).to.be.true;

  expect(product.product.id).to.be.greaterThan(-1);
  expect(product.name).to.not.be.empty;
  expect(product.priceInclVat.getAmount()).to.be.greaterThan(50);
  expect(product.priceInclVat.getCurrency()).to.equal('EUR');
}

export function verifyContainerEntity(
  spec: SwaggerSpecification, container: ContainerRevision,
): void {
  const validation = spec.validateModel('Container', container, false, true);
  expect(validation.valid).to.be.true;

  expect(container.container.id).to.be.greaterThan(-1);
  expect(container.name).to.be.not.empty;
  expect(container.container.owner).to.be.instanceOf(User);
  expect(container.products).to.be.instanceOf(Array);
}

export function verifyPOSEntity(
  spec: SwaggerSpecification, pointOfSale: PointOfSaleRevision,
): void {
  const validation = spec.validateModel('PointOfSale', pointOfSale, false, true);
  expect(validation.valid).to.be.true;

  expect(pointOfSale.pointOfSale.id).to.be.greaterThan(-1);
  expect(pointOfSale.name).to.be.not.empty;
  expect(pointOfSale.pointOfSale.owner).to.be.instanceOf(User);
  expect(pointOfSale.containers).to.be.instanceOf(Array);
}

export function verifyBasePOSResponse(
  spec: SwaggerSpecification, posResponse: BasePointOfSaleResponse,
): void {
  const validation = spec.validateModel('BasePointOfSaleResponse', posResponse, false, true);
  expect(validation.valid).to.be.true;

  expect(posResponse.id).to.be.at.least(0);
  expect(posResponse.name).to.be.not.empty;
}

export function verifyBaseTransactionEntity(
  spec: SwaggerSpecification, baseTransaction: BaseTransactionResponse,
): void {
  const validation = spec.validateModel('BaseTransactionResponse', baseTransaction, true, true);
  expect(validation.valid).to.be.true;

  expect(baseTransaction.id).to.be.greaterThan(-1);
  expect(baseTransaction.value.amount).to.be.at.least(0);
  expect(baseTransaction.createdAt).to.be.not.undefined;
  expect(baseTransaction.createdAt).to.be.not.null;
  verifyBaseUserResponse(spec, baseTransaction.from);
  verifyBaseUserResponse(spec, baseTransaction.createdBy);
  verifyBasePOSResponse(spec, baseTransaction.pointOfSale);
}
