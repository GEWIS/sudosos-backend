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
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import { SwaggerSpecification } from 'swagger-model-validator';
import BaseController from './base-controller';
import Policy from './policy';
import BannerRequest from './request/banner-request';
import { RequestWithToken } from '../middleware/token-middleware';
import Banner from '../entity/banner';
import { UserType } from '../entity/user/user';

export default class BannerController extends BaseController {
  private logger: Logger = log4js.getLogger('BannerController');

  public constructor(spec: SwaggerSpecification) {
    super(spec);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: this.isAdmin.bind(this),
          handler: this.returnAllBanners.bind(this),
        },
        POST: {
          body: { modelName: 'BannerRequest' },
          policy: this.isAdmin.bind(this),
          handler: this.createBanner.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: this.isAdmin.bind(this),
          handler: this.returnSingleBanner.bind(this),
        },
        PATCH: {
          body: { modelName: 'BannerRequest' },
          policy: this.isAdmin.bind(this),
          handler: this.updateBanner.bind(this),
        },
        DELETE: {
          policy: this.isAdmin.bind(this),
          handler: this.removeBanner.bind(this),
        },
      },
      '/active': {
        GET: {
          policy: this.canGetActiveBanners.bind(this),
          handler: this.returnActiveBanners.bind(this),
        },
      },
    };
  }

  /**
   * Verifies whether the banner request translates to a valid banner object
   * @param br
   */
  // eslint-disable-next-line class-methods-use-this
  private verifyBanner(br: BannerRequest): boolean {
    const typeCheck: boolean = typeof br.name === 'string'
      && typeof br.picture === 'string'
      && typeof br.duration === 'number'
      && typeof br.active === 'boolean'
      && typeof br.startDate === 'string'
      && typeof br.endDate === 'string';

    if (!typeCheck) return false;

    const sDate = Date.parse(br.startDate);
    const eDate = Date.parse(br.endDate);

    const valueCheck: boolean = br.name !== ''
      && br.picture !== ''
      // duration must be integer greater than 0
      && br.duration > 0
      && Number.isInteger(br.duration)
      && br.active !== null
      && Number.isNaN(sDate)
      && Number.isNaN(eDate)
      // end date cannot be in the past
      && eDate > new Date().getTime()
      // end date must be later than start date
      && eDate > sDate;

    return valueCheck;
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  private async isAdmin(req: RequestWithToken): Promise<boolean> {
    // TODO: check whether user is admin
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  /**
   * Returns all existing banners
   * @route GET /banners
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - All existing banners
   * @returns {string} 400 - Validation error
   */
  public async returnAllBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all banners', body, 'by user', req.token.user);

    // handle request
    try {
      const banners = await Banner.find();
      res.json(banners);
    } catch (error) {
      this.logger.error('Could not return all banners:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Creates a new banner
   * @route POST /banners
   * @group banners - Operations of banner controller
   * @param {BannerRequest.model} banner.body.required - The banner which should be created
   * @security JWT
   * @returns {Banner.model} 200 - The created banner entity
   * @returns {string} 400 - Validation error
   */
  public async createBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    this.logger.trace('Create banner', body, 'by user', req.token.user);

    // handle request
    if (this.verifyBanner(body)) {
      try {
        const banner: any = {
          ...body,
          startDate: new Date(Date.parse(body.startDate)),
          endDate: new Date(Date.parse(body.endDate)),
        } as Banner;
        await Banner.save(banner);
        res.json(banner);
      } catch (error) {
        this.logger.error('Could not create banner:', error);
        res.status(500).json('Internal server error.');
      }
    } else {
      res.status(400).json('Invalid banner.');
    }
  }

  /**
   * Returns the requested banner
   * @route GET /banners/{id}
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be returned
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity
   * @returns {string} 400 - Validation error
   */
  public async returnSingleBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single banner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const banner = await Banner.findOne(id);
      if (banner) {
        res.json(banner);
      } else {
        res.status(404).json('Banner not found.');
      }
    } catch (error) {
      this.logger.error('Could not return banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Updates the requested banner
   * @route PATCH /banners/{id}
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be updated
   * @param {BannerRequest.model} banner.body.required - The updated banner
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity
   * @returns {string} 400 - Validation error
   */
  public async updateBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    const { id } = req.params;
    this.logger.trace('Update banner', id, 'by user', req.token.user);

    // handle request
    if (this.verifyBanner(body)) {
      try {
        // check if banner in database
        if (await Banner.findOne(id)) {
          const banner: any = {
            ...body,
            startDate: new Date(Date.parse(body.startDate)),
            endDate: new Date(Date.parse(body.endDate)),
          } as Banner;
          await Banner.update(id, banner);
          res.json(banner);
        } else {
          res.status(404).json('Banner not found.');
        }
      } catch (error) {
        this.logger.error('Could not update banner:', error);
        res.status(500).json('Internal server error.');
      }
    } else {
      res.status(400).json('Invalid banner.');
    }
  }

  /**
   * Deletes the requested banner
   * @route DELETE /banners/{id}
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be deleted
   * @security JWT
   * @returns {Banner.model} 200 - The deleted banner entity
   * @returns {string} 400 - Validation error
   */
  public async removeBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove banner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const banner = await Banner.findOne(id);
      if (banner) {
        await Banner.delete(id);
        res.json(banner);
      } else {
        res.status(404).json('Banner not found.');
      }
    } catch (error) {
      this.logger.error('Could not remove banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetActiveBanners(req: RequestWithToken): Promise<boolean> {
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  /**
   * Returns all active banners
   * @route GET /banners/active
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - All active banners
   * @returns {string} 400 - Validation error
   */
  public async returnActiveBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get active banners', body, 'by user', req.token.user);

    // handle request
    try {
      const banners = await Banner.find({ where: { active: '1' } });
      res.json(banners);
    } catch (error) {
      this.logger.error('Could not return active banners:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
