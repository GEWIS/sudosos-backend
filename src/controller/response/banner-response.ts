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

import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {BaseResponse} BannerResponse
 * @property {string} name - Name/label of the banner
 * @property {string} image - Location of the image
 * @property {number} duration - How long the banner should be shown (in seconds)
 * @property {boolean} active - Whether the banner is active. Overrides start and end date
 * @property {string} startDate - The starting date from which the banner should be shown
 * @property {string} endDate - The end date from which the banner should no longer be shown
 */
export interface BannerResponse extends BaseResponse {
  name: string,
  image: string | null,
  duration: number,
  active: boolean,
  startDate: string,
  endDate: string,
}

/**
 * @typedef PaginatedBannerResponse
 * @property {PaginationResult.model} _pagination - Pagination metadata
 * @property {Array<BannerResponse>} records - Returned banners
 */
export interface PaginatedBannerResponse {
  _pagination: PaginationResult,
  records: BannerResponse[],
}
