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
import {
  Either, isFail, Specification, toFail,
  toPass, validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import { getIdsAndRequests } from '../../../helpers/array-splitter'; import Container from '../../../entity/container/container';
import { BasePointOfSaleParams, CreatePointOfSaleParams, UpdatePointOfSaleParams } from '../point-of-sale-request';
import durationSpec from './duration-spec';
import { ContainerParams } from '../container-request';
import verifyContainerRequest from './container-request-spec';
import stringSpec from './string-spec';
import { CONTAINER_VALIDATION_FAIL, INVALID_CONTAINER_IDS } from './validation-errors';
import { userMustExist } from './general-validators';

async function validContainers<T extends BasePointOfSaleParams>(p: T) {
  const { ids, requests } = getIdsAndRequests<ContainerParams>(p.containers);

  const containers = await Container.findByIds(ids);
  if (containers.length !== ids.length) {
    return toFail(INVALID_CONTAINER_IDS());
  }

  const promises: Promise<Either<ValidationError, ContainerParams>>[] = [];
  requests.forEach((r) => {
    promises.push(verifyContainerRequest(r).then((res) => res));
  });

  let results: Either<ValidationError, ContainerParams>[] = [];
  await Promise.all(promises).then((r) => {
    results = r;
  });

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (isFail(result)) return toFail(CONTAINER_VALIDATION_FAIL().join(result.fail));
  }

  return toPass(p);
}

function basePointOfSaleRequestSpec<T extends BasePointOfSaleParams>():
Specification<T, ValidationError> {
  return [
    ...durationSpec<T>(),
    [stringSpec(), 'name', new ValidationError('Name:')],
    validContainers,
  ];
}

const createPointOfSaleRequestSpec: Specification<CreatePointOfSaleParams, ValidationError> = [
  ...basePointOfSaleRequestSpec<CreatePointOfSaleParams>(),
  [[userMustExist], 'ownerId', new ValidationError('ownerId:')],
];

export async function verifyCreatePointOfSaleRequest(createPointOfSaleRequest:
CreatePointOfSaleParams) {
  return Promise.resolve(await validateSpecification(
    createPointOfSaleRequest, createPointOfSaleRequestSpec,
  ));
}

export async function verifyUpdatePointOfSaleRequest(updatePointOfSaleRequest:
UpdatePointOfSaleParams) {
  return Promise.resolve(await validateSpecification(
    updatePointOfSaleRequest, createPointOfSaleRequestSpec,
  ));
}
