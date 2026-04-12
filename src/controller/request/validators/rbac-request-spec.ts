/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the rbac-request-spec.
 *
 * @module internal/spec/rbac-request-spec
 */

import {
  isFail,
  Specification,
  toFail,
  toPass,
  validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import stringSpec from './string-spec';
import { CreatePermissionParams, UpdateRoleRequest } from '../rbac-request';
import Role from '../../../entity/rbac/role';
import { nonEmptyArray } from './general-validators';

const validRoleName = async (name: string) => {
  const existingRole = await Role.findOne({ where: { name } });
  if (existingRole) {
    return toFail(new ValidationError(`Role with name "${name}" already exists.`));
  }
  return toPass(name);
};

export function updateRoleRequestSpecFactory(): Specification<UpdateRoleRequest, ValidationError> {
  return [
    [[...stringSpec(), validRoleName], 'name', new ValidationError('name:')],
  ];
}

const createPermissionItemSpec: () => Specification<CreatePermissionParams, ValidationError> = () => [
  [[nonEmptyArray], 'attributes', new ValidationError('attributes:')],
];

const validateAllPermissions = async (arr: CreatePermissionParams[]) => {
  if (!Array.isArray(arr)) return toFail(new ValidationError('Body must be an array.'));
  for (const item of arr) {
    const result = await validateSpecification(item, createPermissionItemSpec());
    if (isFail(result)) return toFail(result.fail);
  }
  return toPass(arr);
};

export function createPermissionsRequestSpecFactory(): Specification<CreatePermissionParams[], ValidationError> {
  return [validateAllPermissions];
}
