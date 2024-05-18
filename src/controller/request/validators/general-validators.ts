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

import { toFail, toPass, ValidationError } from '../../../helpers/specification-validation';
import User, { TermsOfServiceStatus, UserType } from '../../../entity/user/user';
import { INVALID_ACTIVE_USER_ID, INVALID_ORGAN_ID, INVALID_USER_ID } from './validation-errors';
import { In } from 'typeorm';

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
