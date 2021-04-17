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
   * Verifies whether the banner request translates to a valid banner object
   * @param {BannerRequest.model} br - the banner request to verify
   * @returns {boolean} - whether banner is ok or not
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

  /**
   * Creates a banner from a banner request
   * @param {BannerRequest.model} bannerReq - banner request
   * @returns {Banner.model} - a banner entity created with the banner request
   */
  public static asBanner(bannerReq: BannerRequest): Banner {
    if (!bannerReq) {
      return undefined;
    }
    return {
      ...bannerReq,
      startDate: new Date(bannerReq.startDate),
      endDate: new Date(bannerReq.endDate),
    } as Banner;
  }

  /**
   * Creates a banner response from a banner
   * @param {Banner.model} banner - banner
   * @returns {BannerResponse.model} - a banner response created with the banner
   */
  public static asBannerResponse(banner: Banner): BannerResponse {
    if (!banner) {
      return undefined;
    }
    return {
      ...banner,
      createdAt: banner.createdAt.toISOString(),
      updatedAt: banner.updatedAt.toISOString(),
      startDate: banner.startDate.toISOString(),
      endDate: banner.endDate.toISOString(),
    } as BannerResponse;
  }

  /**
   * Returns all banners with options.
   * @param options - find options
   * @returns {Array<BannerResponse>} - all banners
   */
  public static async getAllBanners(options?: FindManyOptions): Promise<BannerResponse[]> {
    // find and return banners or empty array
    const banners = await Banner.find({ ...options });
    return banners.map((banner) => this.asBannerResponse(banner));
  }

  /**
   * Saves a banner to the database.
   * @param bannerReq
   * @returns {BannerResponse.model} - saved banner
   */
  public static async createBanner(bannerReq: BannerRequest): Promise<BannerResponse> {
    // save and return banner
    const banner = this.asBanner(bannerReq);
    await Banner.save(banner);
    return this.asBannerResponse(banner);
  }

  /**
   * Returns banner with given id.
   * @param id - requested banner id
   * @returns {BannerResponse.model} - requested banner
   */
  public static async getBannerByID(id: number): Promise<BannerResponse> {
    // find and return single banner
    const banner = await Banner.findOne(id);
    if (!banner) {
      return undefined;
    }
    return this.asBannerResponse(banner);
  }

  /**
   * Updates and returns banner with given id.
   * @param id - requested banner id
   * @returns {BannerResponse.model} - updated banner
   */
  public static async updateBanner(id: number, bannerReq: BannerRequest): Promise<BannerResponse> {
    // check if banner in database
    const bannerFound = await Banner.findOne(id);

    // return undefined if banner not found or request is invalid
    if (!bannerFound || !this.verifyBanner(bannerReq)) {
      return undefined;
    }

    // patch banner if found
    const banner = this.asBanner(bannerReq);
    await Banner.update(id, banner);
    return this.asBannerResponse(await Banner.findOne(id));
  }

  /**
   * Deletes the requested banner from the database
   * @param id - requested banner id
   * @returns {BannerResponse.model} - deleted banner
   */
  public static async deleteBanner(id: number): Promise<BannerResponse> {
    // check if banner in database
    const banner = await Banner.findOne(id);

    // return undefined if not found
    if (!banner) {
      return undefined;
    }

    // delete banner if found
    await Banner.delete(id);
    return this.asBannerResponse(banner);
  }

  /**
   * Returns all active banners with options.
   * @param options - find options
   * @returns {Array<BannerResponse>} - active banners
   */
  public static async getAllActiveBanners(options?: FindManyOptions): Promise<BannerResponse[]> {
    // find and return active banners or empty array
    const banners = await Banner.find({ where: { active: '1' }, ...options });
    return banners.map((banner) => this.asBannerResponse(banner));
  }
}
