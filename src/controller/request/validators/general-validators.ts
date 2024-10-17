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
 *
 *  @license
 */

/**
 * This is the module page of the general-validators.
 *
 * @module internal/spec
 */

import { toFail, toPass, ValidationError } from '../../../helpers/specification-validation';
import User, { TermsOfServiceStatus, UserType } from '../../../entity/user/user';
import {
  EMPTY_ARRAY,
  INVALID_ACTIVE_USER_ID, INVALID_CUSTOM_ROLE_ID,
  INVALID_ORGAN_ID,
  INVALID_ROLE_ID,
  INVALID_USER_ID,
} from './validation-errors';
import { In } from 'typeorm';
import Role from '../../../entity/rbac/role';

export const positiveNumber = async (p: number) => {
  if (p <= 0) return toFail(new ValidationError('Number must be positive'));
  return toPass(p);
};

export const userMustExist = async (p: number) => {
  if (await User.findOne({ where: {
    id: p, acceptedToS: In([TermsOfServiceStatus.ACCEPTED, TermsOfServiceStatus.NOT_REQUIRED]),
  } }) == null) {
    return toFail(INVALID_USER_ID());
  }
  return toPass(p);
};

export const activeUserMustExist = async (p: number) => {
  if (await User.findOne({ where: { id: p, active: true } }) == null) {
    return toFail(INVALID_ACTIVE_USER_ID());
  }
  return toPass(p);
};

export const ownerIsOrgan = async (id: number) => {
  const owner = await User.findOne({ where: { id, deleted: false, type: UserType.ORGAN } });
  if (!owner) return toFail(INVALID_ORGAN_ID());
  return toPass(id);
};

export const nonEmptyArray = async <T>(list: T[]) => {
  if (list.length === 0) {
    return toFail(EMPTY_ARRAY());
  }
  return toPass(list);
};

export const rolesMustExist = async (ids: number[] | undefined) => {
  if (ids == undefined) return toPass(ids);
  const roles = await Role.find({ where: { id: In(ids) } });
  const foundIds = roles.map((role) => role.id);
  for (let id of ids) {
    if (!foundIds.includes(id)) {
      return toFail(INVALID_ROLE_ID(id));
    }
  }
  return toPass(ids);
};

export const rolesCannotBeSystemDefault = async (ids: number[]) => {
  if (ids == undefined) return toPass(ids);
  const roles = await Role.find({ where: { id: In(ids) } });
  const systemDefaultRoles = roles.filter((r) => r.systemDefault);
  if (systemDefaultRoles.length > 0) {
    return toFail(INVALID_CUSTOM_ROLE_ID(systemDefaultRoles[0].id));
  }
  return toPass(ids);
};
