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
import { FindManyOptions } from 'typeorm';
import BannerRequest from '../controller/request/banner-request';
import BannerResponse from '../controller/response/banner-response';
import Banner from '../entity/banner';

export default class BannerService {
  /**
   * Returns all active banners with pagination.
   * @param options
   */
  public static async getAllActiveBanners(options?: FindManyOptions) {
    const banners = await Banner.find({ where: { active: '1' }, ...options });
    return banners.map((banner) => (this.asBannerResponse(banner)));
  }

  /**
   * Verifies whether the banner request translates to a valid banner object
   * @param br
   */
  // eslint-disable-next-line class-methods-use-this
  public static verifyBanner(br: BannerRequest): boolean {
    const sDate = Date.parse(br.startDate);
    const eDate = Date.parse(br.endDate);

    return br.name !== ''
        && br.picture !== ''

        // duration must be integer greater than 0
        && br.duration > 0

        && Number.isInteger(br.duration)
        && br.active !== null
        && !Number.isNaN(sDate)
        && !Number.isNaN(eDate)

        // end date cannot be in the past
        && eDate > new Date().getTime()

        // end date must be later than start date
        && eDate > sDate;
  }

  public static asBannerResponse(banner: Banner): BannerResponse {
    return {
      ...banner,
      createdAt: banner.createdAt.toISOString(),
      updatedAt: banner.updatedAt.toISOString(),
      startDate: banner.startDate.toISOString(),
      endDate: banner.endDate.toISOString(),
    } as BannerResponse;
  }
}
