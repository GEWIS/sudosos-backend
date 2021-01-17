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
import CreateBannerRequest from './request/banner-requests/create-banner-request';
import UpdateBannerRequest from './request/banner-requests/update-banner-request';
import RemoveBannerRequest from './request/banner-requests/remove-banner-request';
import { RequestWithToken } from '../middleware/token-middleware';
import Banner from '../entity/banner';

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
          policy: this.canGetAllBanners.bind(this),
          handler: this.returnAllBanners.bind(this),
        },
        POST: {
          body: { modelName: 'CreateBannerRequest' },
          policy: this.canCreateBanner.bind(this),
          handler: this.createBanner.bind(this),
        },
      },
      '/:id/': {
        GET: {
          policy: this.canGetSingleBanner.bind(this),
          handler: this.returnSingleBanner.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateBannerRequest' },
          policy: this.canUpdateBanner.bind(this),
          handler: this.updateBanner.bind(this),
        },
        DELETE: {
          body: { modelName: 'RemoveBannerRequest' },
          policy: this.canRemoveBanner.bind(this),
          handler: this.removeBanner.bind(this),
        },
      },
      '/active/': {
        GET: {
          policy: this.canGetActiveBanners.bind(this),
          handler: this.canGetActiveBanners.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetAllBanners(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Returns all existing banners.
   * @route GET /banners
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - All existing banners.
   * @returns {string} 400 - Validation error.
   */
  public async returnAllBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all banners', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(Banner.findOne());
    } catch (error) {
      this.logger.error('Could not return all banners:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canCreateBanner(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Creates new banner.
   * @route POST /banners
   * @group banners - Operations of banner controller
   * @param {CreateBannerRequest.model} adverisement.body.required - The banner
   * @security JWT
   * @returns {boolean} 200 - Creation succesful
   * @returns {string} 400 - Validation error
   */
  public async createBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateBannerRequest;
    this.logger.trace('Create banner', body, 'by user', req.token.user);

    // Check whether duration is in whole seconds (integer)
    if (!Number.isInteger(body.duration)) {
      res.status(400).json('Duration is not an integer.');
    }

    // handle request
    try {
      const adverisement: any = {
        ...body,
        startDate: new Date(Date.parse(body.startDate)),
        endDate: new Date(Date.parse(body.endDate)),
      };
      await Banner.save(adverisement as Banner);
      res.json(true);
    } catch (error) {
      this.logger.error('Could not create banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetSingleBanner(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Returns requested banner.
   * @route GET /banners/:id
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity.
   * @returns {string} 400 - Validation error.
   */
  public async returnSingleBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get single banner', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(Banner.findOne(body.id));
    } catch (error) {
      this.logger.error('Could not return banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canUpdateBanner(req: RequestWithToken): Promise<boolean> {
    const body = req.body as UpdateBannerRequest;
    return body.name === 'testje';
  }

  /**
   * Updates requested banner.
   * @route PATCH /banners/:id
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity. -- moet OKAY zijn --
   * @returns {string} 400 - Validation error.
   */
  public async updateBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateBannerRequest;
    this.logger.trace('Update banner', body, 'by user', req.token.user);

    // handle request
    try {
      const banner = {};
      res.json(banner);
    } catch (error) {
      this.logger.error('Could not update banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canRemoveBanner(req: RequestWithToken): Promise<boolean> {
    const body = req.body as RemoveBannerRequest;
    return body.name === 'testje';
  }

  /**
   * Deletes requested banner.
   * @route DELETE /banners/:id
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity. -- moet OKAY zijn --
   * @returns {string} 400 - Validation error.
   */
  public async removeBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as RemoveBannerRequest;
    this.logger.trace('Remove banner', body, 'by user', req.token.user);

    // handle request
    try {
      const banner = {};
      res.json(banner);
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
    return true;
  }

  /**
   * Returns all active banners.
   * @route GET /banners/active
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity. -- moet array zijn --
   * @returns {string} 400 - Validation error.
   */
  public async returnActiveBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get active banners', body, 'by user', req.token.user);

    // handle request
    try {
      const banner = {};
      res.json(banner);
    } catch (error) {
      this.logger.error('Could not return active banners:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
