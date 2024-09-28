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
 * This is the module page of banner-controller.
 *
 * @module banners
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import { UploadedFile } from 'express-fileupload';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import BannerRequest from './request/banner-request';
import { RequestWithToken } from '../middleware/token-middleware';
import BannerService from '../service/banner-service';
import Banner from '../entity/banner';
import FileService from '../service/file-service';
import { BANNER_IMAGE_LOCATION } from '../files/storage';
import { parseRequestPagination } from '../helpers/pagination';

export default class BannerController extends BaseController {
  private logger: Logger = log4js.getLogger('BannerController');

  private fileService: FileService;

  /**
   * Creates a new banner controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.fileService = new FileService(BANNER_IMAGE_LOCATION);
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
      '/:id(\\d+)/image': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Banner', ['*']),
          handler: this.uploadBannerImage.bind(this),
        },
      },
      '/active': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Banner', ['*']),
          handler: this.returnActiveBanners.bind(this),
        },
      },
    };
  }

  /**
   * GET /banners
   * @summary Returns all existing banners
   * @operationId getAllBanners
   * @tags banners - Operations of banner controller
   * @security JWT
   * @param {integer} take.query - How many banners the endpoint should return
   * @param {integer} skip.query - How many banners should be skipped (for pagination)
   * @return {PaginatedBannerResponse} 200 - All existing banners
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnAllBanners(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all banners by', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // handle request
    try {
      res.json(await BannerService.getBanners({}, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all banners:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /banners
   * @summary Saves a banner to the database
   * @operationId create
   * @tags banners - Operations of banner controller
   * @param {BannerRequest} request.body.required - The banner which should be created
   * @security JWT
   * @return {BannerResponse} 200 - The created banner entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
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
   * POST /banners/{id}/image
   * @summary Uploads a banner image to the given banner
   * @operationId updateImage
   * @tags banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner
   * @param {FileRequest} request.body.required - banner image - multipart/form-data
   * @security JWT
   * @return 204 - Success
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async uploadBannerImage(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const { files } = req;
    this.logger.trace('Upload banner image for banner', id, 'by user', req.token.user);

    if (!req.files || Object.keys(files).length !== 1) {
      res.status(400).send('No file or too many files were uploaded');
      return;
    }
    if (files.file === undefined) {
      res.status(400).send("No file is uploaded in the 'file' field");
      return;
    }
    const file = files.file as UploadedFile;
    if (file.data === undefined) {
      res.status(400).send('File body data is missing from request');
      return;
    }
    if (file.name === undefined) {
      res.status(400).send('File name is missing from request');
      return;
    }

    const bannerId = parseInt(id, 10);

    try {
      const banner = await Banner.findOne({ where: { id: bannerId }, relations: ['image'] });
      if (banner) {
        await this.fileService.uploadEntityImage(
          banner, file, req.token.user,
        );
        res.status(204).send();
        return;
      }
      res.status(404).json('Banner not found');
      return;
    } catch (error) {
      this.logger.error('Could not upload image:', error);
      res.status(500).json('Internal server error');
    }
  }

  /**
   * GET /banners/{id}
   * @summary Returns the requested banner
   * @operationId getBanner
   * @tags banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be returned
   * @security JWT
   * @return {BannerResponse} 200 - The requested banner entity
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async returnSingleBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single banner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const { records } = await BannerService.getBanners({ bannerId: Number.parseInt(id, 10) });
      if (records.length > 0) {
        res.json(records[0]);
      } else {
        res.status(404).json('Banner not found.');
      }
    } catch (error) {
      this.logger.error('Could not return banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /banners/{id}
   * @summary Updates the requested banner
   * @operationId update
   * @tags banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be updated
   * @param {BannerRequest} request.body.required - The updated banner
   * @security JWT
   * @return {BannerResponse} 200 - The requested banner entity
   * @return {string} 400 - Validation error
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
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
   * DELETE /banners/{id}
   * @summary Deletes the requested banner
   * @operationId delete
   * @tags banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner which should be deleted
   * @security JWT
   * @return 204 - Update success
   * @return {string} 404 - Not found error
   */
  public async removeBanner(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Remove ban ner', id, 'by user', req.token.user);

    // handle request
    try {
      // check if banner in database
      const banner = await BannerService.deleteBanner(Number.parseInt(id, 10), this.fileService);
      if (banner) {
        res.status(204).json();
      } else {
        res.status(404).json('Banner not found.');
      }
    } catch (error) {
      this.logger.error('Could not remove banner:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /banners/active
   * @summary Returns all active banners
   * @operationId getActive
   * @tags banners - Operations of banner controller
   * @security JWT
   * @param {integer} take.query - How many banners the endpoint should return
   * @param {integer} skip.query - How many banners should be skipped (for pagination)
   * @return {PaginatedBannerResponse} 200 - All active banners
   * @return {string} 400 - Validation error
   */
  public async returnActiveBanners(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get active banners', body, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // handle request
    try {
      res.json(await BannerService.getBanners({ active: true }, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return active banners:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
