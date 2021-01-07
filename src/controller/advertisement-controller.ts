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
import CreateAdvertisementRequest from './request/advertisement-requests/create-advertisement-request';
import UpdateAdvertisementRequest from './request/advertisement-requests/update-advertisement-request';
import RemoveAdvertisementRequest from './request/advertisement-requests/remove-advertisement-request';
import { RequestWithToken } from '../middleware/token-middleware';
import Advertisement from '../entity/advertisement';

export default class AdvertisementController extends BaseController {
  private logger: Logger = log4js.getLogger('AdvertisementController');

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
          policy: this.canGetAllAdvertisements.bind(this),
          handler: this.returnAllAdvertisements.bind(this),
        },
        POST: {
          body: { modelName: 'CreateAdvertisementRequest' },
          policy: this.canCreateAdvertisement.bind(this),
          handler: this.createAdvertisement.bind(this),
        },
      },
      '/:id/': {
        GET: {
          policy: this.canGetSingleAdvertisement.bind(this),
          handler: this.returnSingleAdvertisement.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateAdvertisementRequest' },
          policy: this.canUpdateAdvertisement.bind(this),
          handler: this.updateAdvertisement.bind(this),
        },
        DELETE: {
          body: { modelName: 'RemoveAdvertisementRequest' },
          policy: this.canRemoveAdvertisement.bind(this),
          handler: this.removeAdvertisement.bind(this),
        },
      },
      '/active/': {
        GET: {
          policy: this.canGetActiveAdvertisements.bind(this),
          handler: this.canGetActiveAdvertisements.bind(this),
        },
      },
    };
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetAllAdvertisements(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Returns all existing advertisements.
   * @route GET /advertisements
   * @group advertisements - Operations of advertisement controller
   * @security JWT
   * @returns {Advertisement.model} 200 - All existing advertisements.
   * @returns {string} 400 - Validation error.
   */
  public async returnAllAdvertisements(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all advertisements', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(Advertisement.findOne());
    } catch (error) {
      this.logger.error('Could not return all advertisements:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canCreateAdvertisement(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Creates new advertisement.
   * @route POST /advertisements
   * @group advertisements - Operations of advertisement controller
   * @param {CreateAdvertisementRequest.model} adverisement.body.required - The advertisement
   * @security JWT
   * @returns {boolean} 200 - Creation succesful
   * @returns {string} 400 - Validation error
   */
  public async createAdvertisement(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateAdvertisementRequest;
    this.logger.trace('Create advertisement', body, 'by user', req.token.user);

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
      await Advertisement.save(adverisement as Advertisement);
      res.json(true);
    } catch (error) {
      this.logger.error('Could not create advertisement:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetSingleAdvertisement(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Returns requested advertisement.
   * @route GET /advertisements/:id
   * @group advertisements - Operations of advertisement controller
   * @security JWT
   * @returns {Advertisement.model} 200 - The requested advertisement entity.
   * @returns {string} 400 - Validation error.
   */
  public async returnSingleAdvertisement(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get single advertisement', body, 'by user', req.token.user);

    // handle request
    try {
      res.json(Advertisement.findOne(body.id));
    } catch (error) {
      this.logger.error('Could not return advertisement:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canUpdateAdvertisement(req: RequestWithToken): Promise<boolean> {
    const body = req.body as UpdateAdvertisementRequest;
    return body.name === 'testje';
  }

  /**
   * Updates requested advertisement.
   * @route PATCH /advertisements/:id
   * @group advertisements - Operations of advertisement controller
   * @security JWT
   * @returns {Advertisement.model} 200 - The requested advertisement entity. -- moet OKAY zijn --
   * @returns {string} 400 - Validation error.
   */
  public async updateAdvertisement(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateAdvertisementRequest;
    this.logger.trace('Update advertisement', body, 'by user', req.token.user);

    // handle request
    try {
      const advertisement = {};
      res.json(advertisement);
    } catch (error) {
      this.logger.error('Could not update advertisement:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canRemoveAdvertisement(req: RequestWithToken): Promise<boolean> {
    const body = req.body as RemoveAdvertisementRequest;
    return body.name === 'testje';
  }

  /**
   * Deletes requested advertisement.
   * @route DELETE /advertisements/:id
   * @group advertisements - Operations of advertisement controller
   * @security JWT
   * @returns {Advertisement.model} 200 - The requested advertisement entity. -- moet OKAY zijn --
   * @returns {string} 400 - Validation error.
   */
  public async removeAdvertisement(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as RemoveAdvertisementRequest;
    this.logger.trace('Remove advertisement', body, 'by user', req.token.user);

    // handle request
    try {
      const advertisement = {};
      res.json(advertisement);
    } catch (error) {
      this.logger.error('Could not remove advertisement:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public async canGetActiveAdvertisements(req: RequestWithToken): Promise<boolean> {
    return true;
  }

  /**
   * Returns all active advertisements.
   * @route GET /advertisements/active
   * @group advertisements - Operations of advertisement controller
   * @security JWT
   * @returns {Advertisement.model} 200 - The requested advertisement entity. -- moet array zijn --
   * @returns {string} 400 - Validation error.
   */
  public async returnActiveAdvertisements(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get active advertisements', body, 'by user', req.token.user);

    // handle request
    try {
      const advertisement = {};
      res.json(advertisement);
    } catch (error) {
      this.logger.error('Could not return active advertisements:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
