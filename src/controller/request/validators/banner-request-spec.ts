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
 * This is the module page of the banner-request-spec.
 *
 * @module internal/spec/banner-request-spec
 */

import {
  Specification, toFail, toPass, ValidationError,
} from '../../../helpers/specification-validation';
import BannerRequest from '../banner-request';
import stringSpec from './string-spec';
import durationSpec from './duration-spec';

/**
 * Validates that the duration is a positive integer.
 */
const validDuration = (duration: number) => {
  if (duration <= 0 || !Number.isInteger(duration)) {
    return toFail(new ValidationError('Duration must be a positive integer.'));
  }
  return toPass(duration);
};

/**
 * Validates that the end date is not in the past.
 */
const endDateNotInPast = (br: BannerRequest) => {
  if (Date.parse(br.endDate) <= new Date().getTime()) {
    return toFail(new ValidationError('endDate: End date cannot be in the past.'));
  }
  return toPass(br);
};

/**
 * Full validation spec for BannerRequest. Covers:
 * - name: non-empty string
 * - duration: positive integer
 * - startDate: valid date string
 * - endDate: valid date string, after startDate, and not in the past
 */
const bannerRequestSpec: Specification<BannerRequest, ValidationError> = [
  [stringSpec(), 'name', new ValidationError('name:')],
  [[validDuration], 'duration', new ValidationError('duration:')],
  ...durationSpec<BannerRequest>(),
  endDateNotInPast,
];

export default bannerRequestSpec;
