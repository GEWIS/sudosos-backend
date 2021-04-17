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
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import BannerRequest from './request/banner-request';
import { RequestWithToken } from '../middleware/token-middleware';
import Banner from '../entity/banner';
import { addPaginationForFindOptions } from '../helpers/pagination';
import AuthService from '../services/auth-service';
import BannerService from '../services/banner-service';

export default class BannerController extends BaseController {
  private logger: Logger = log4js.getLogger('BannerController');

  /**
   * Creates a new banner controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Banner', ['*']),
          handler: this.returnAllBanners.bind(this),
        },
        POST: {
          body: { modelName: 'BannerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Banner', ['*']),
          handler: this.createBanner.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Banner', ['*']),
          handler: this.returnSingleBanner.bind(this),
        },
        PATCH: {
          body: { modelName: 'BannerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Banner', ['*']),
          handler: this.updateBanner.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Banner', ['*']),
          handler: this.removeBanner.bind(this),
        },
      },
      '/active': {
        GET: {
          policy: async () => true,
          handler: this.returnActiveBanners.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing banners
   * @route GET /banners
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Array<Banner>} 200 - All existing banners
   * @returns {string} 500 - Internal server error
   */
  public async returnAllBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all banners', body, 'by user', req.token.user);

    // handle request
    try {
      const banners = await Banner.find({ ...addPaginationForFindOptions(req) });
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
   * @returns {string} 500 - Internal server error
   */
  public async createBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    this.logger.trace('Create banner', body, 'by user', req.token.user);

    // Get banner from request.
    const banner: Banner = {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    } as Banner;

    // handle request
    try {
      if (BannerService.verifyBanner(body)) {
        await Banner.save(banner);
        res.json(banner);
      } else {
        res.status(400).json('Invalid banner.');
      }
    } catch (error) {
      this.logger.error('Could not create banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested banner
   * @route GET /banners/{id}
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be returned
   * @security JWT
   * @returns {Banner.model} 200 - The requested banner entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
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
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    const { id } = req.params;
    this.logger.trace('Update banner', id, 'by user', req.token.user);

    // Get banner from request.
    const banner: any = {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    } as Banner;

    // handle request
    try {
      if (BannerService.verifyBanner(body)) {
        // check if banner in database
        if (await Banner.findOne(id)) {
          await Banner.update(id, banner);
          res.json(banner);
        } else {
          res.status(404).json('Banner not found.');
        }
      } else {
        res.status(400).json('Invalid banner.');
      }
    } catch (error) {
      this.logger.error('Could not update banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Deletes the requested banner
   * @route DELETE /banners/{id}
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be deleted
   * @security JWT
   * @returns {Banner.model} 200 - The deleted banner entity
   * @returns {string} 404 - Not found error
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
   * Returns all active banners
   * @route GET /banners/active
   * @group banners - Operations of banner controller
   * @security JWT
   * @returns {Array<Banner>} 200 - All active banners
   * @returns {string} 400 - Validation error
   */
  public async returnActiveBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get active banners', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(await BannerService.getAllActiveBanners(addPaginationForFindOptions(req)));
    } catch (error) {
      this.logger.error('Could not return active banners:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
