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
  Either, isFail, Specification,
  toFail,
  toPass, validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import { getIdsAndRequests } from '../../../helpers/helper'; import Container from '../../../entity/container/container';
import User from '../../../entity/user/user';
import { BasePointOfSaleRequest, CreatePointOfSaleRequest, UpdatePointOfSaleRequest } from '../point-of-sale-request';
import durationSpec from './duration-spec';
import namedSpec from './named-spec';
import { ContainerRequest } from '../container-request';

const ownerMustExist = async (p: CreatePointOfSaleRequest) => {
  // Owner must exist.
  if (await User.findOne({ id: p.ownerId }) === undefined) {
    return toFail(new ValidationError('Owner must exist.'));
  }
  return toPass(p);
};

async function validContainers<T extends BasePointOfSaleRequest>(p: T) {
  const { ids, requests } = getIdsAndRequests<ContainerRequest>(p.containers);

  const containers = await Container.findByIds(ids);
  if (containers.length !== ids.length) {
    return toFail(new ValidationError('Not all container IDs are valid.'));
  }

  const promises: Promise<[Either<ValidationError, ContainerRequest>, number]>[] = [];
  requests.forEach((r) => {
    promises.push(verifyContainerRequest(r).then((res) => [res, r.id]));
  });

  let results: [Either<ValidationError, ContainerRequest>, number][] = [];
  await Promise.all(promises).then((r) => {
    results = r;
  });

  for (let i = 0; i < results.length; i += 1) {
    const [result, id] = results[i];
    if (isFail(result)) return toFail(new ValidationError(`Container #${id} validation failed:`).join(result.fail));
  }

  return toPass(p);
}

function basePointOfSaleRequestSpec<T extends BasePointOfSaleRequest>():
Specification<T, ValidationError> {
  return [
    ...durationSpec<T>(),
    ...namedSpec<T>(),
    validContainers,
  ];
}

const createPointOfSaleRequestSpec = [
  ...basePointOfSaleRequestSpec<CreatePointOfSaleRequest>(),
  ownerMustExist,
];

export async function verifyCreatePointOfSaleRequest(createPointOfSaleRequest:
CreatePointOfSaleRequest) {
  return Promise.resolve(await validateSpecification(
    createPointOfSaleRequest, createPointOfSaleRequestSpec,
  ));
}

export async function verifyUpdatePointOfSaleRequest(updatePointOfSaleRequest:
UpdatePointOfSaleRequest) {
  return Promise.resolve(await validateSpecification(
    updatePointOfSaleRequest, createPointOfSaleRequestSpec,
  ));
}
