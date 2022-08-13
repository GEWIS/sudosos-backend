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
   * Uploads a banner image to the given banner
   * @route POST /banners/{id}/image
   * @group banners - Operations of banner controller
   * @param {integer} id.path.required - The id of the banner
   * @param {file} file.formData
   * @security JWT
   * @returns 204 - Success
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
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
      const banner = await BannerService.deleteBanner(Number.parseInt(id, 10), this.fileService);
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
   * @param {integer} take.query - How many banners the endpoint should return
   * @param {integer} skip.query - How many banners should be skipped (for pagination)
   * @returns {PaginatedBannerResponse.model} 200 - All active banners
   * @returns {string} 400 - Validation error
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
