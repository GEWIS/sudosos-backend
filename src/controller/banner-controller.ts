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
import { addPaginationForFindOptions } from '../helpers/pagination';
import AuthService from '../services/AuthService';
import BannerService from '../services/BannerService';

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
          policy: AuthService.isAdmin.bind(this),
          handler: this.returnAllBanners.bind(this),
        },
        POST: {
          body: { modelName: 'BannerRequest' },
          policy: AuthService.isAdmin.bind(this),
          handler: this.createBanner.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: AuthService.isAdmin.bind(this),
          handler: this.returnSingleBanner.bind(this),
        },
        PATCH: {
          body: { modelName: 'BannerRequest' },
          policy: AuthService.isAdmin.bind(this),
          handler: this.updateBanner.bind(this),
        },
        DELETE: {
          policy: AuthService.isAdmin.bind(this),
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
   * @returns {Array<BannerResponse>} 200 - All existing banners
   * @returns {string} 500 - Internal server error
   */
  public async returnAllBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all banners', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(await BannerService.getAllBanners(addPaginationForFindOptions(req)));
    } catch (error) {
      this.logger.error('Could not return all banners:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Saves a banner to the database
   * @route POST /banners
   * @group banners - Operations of banner controller
   * @param {BannerRequest.model} banner.body.required - The banner which should be created
   * @security JWT
   * @returns {BannerResponse.model} 200 - The created banner entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    this.logger.trace('Create banner', body, 'by user', req.token.user);

    // handle request
    try {
      if (BannerService.verifyBanner(body)) {
        res.json(await BannerService.createBanner(body));
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
   * @returns {BannerResponse.model} 200 - The requested banner entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single banner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const banner = await BannerService.getBannerByID(Number.parseInt(id, 10));
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
   * @returns {BannerResponse.model} 200 - The requested banner entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateBanner(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as BannerRequest;
    const { id } = req.params;
    this.logger.trace('Update banner', id, 'by user', req.token.user);

    // handle request
    try {
      if (BannerService.verifyBanner(body)) {
        // try patching the banner
        const banner = await BannerService.updateBanner(Number.parseInt(id, 10), body);
        if (banner) {
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
   * @returns {BannerResponse.model} 200 - The deleted banner entity
   * @returns {string} 404 - Not found error
   */
  public async removeBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove banner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const banner = await BannerService.deleteBanner(Number.parseInt(id, 10));
      if (banner) {
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
   * @returns {Array<BannerResponse>} 200 - All active banners
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
