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
import { SwaggerSpecification } from 'swagger-model-validator';
import { expect } from 'chai';
import User, { UserType } from '../../src/entity/user/user';
import ProductRevision from '../../src/entity/product/product-revision';
import ContainerRevision from '../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';

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

export function verifyProductEntity(
  spec: SwaggerSpecification, product: ProductRevision,
): void {
  const validation = spec.validateModel('Product', product, false, true);
  expect(validation.valid).to.be.true;

  expect(product.product.id).to.be.greaterThan(-1);
  expect(product.name).to.not.be.empty;
  expect(product.price.getAmount()).to.be.greaterThan(50);
  expect(product.price.getCurrency()).to.equal('EUR');
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
  expect(pointOfSale.startDate).to.be.instanceOf(Date);
  expect(pointOfSale.endDate).to.be.instanceOf(Date);
  expect(pointOfSale.endDate.getTime()).to.be.greaterThan(pointOfSale.startDate.getTime());
  expect(pointOfSale.containers).to.be.instanceOf(Array);
}
