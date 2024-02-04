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
import { RequestWithToken } from '../middleware/token-middleware';
import FileService from '../service/file-service';
import { parseRequestPagination } from '../helpers/pagination';
import FlaggedTransactionRequest from "./request/flagged-transaction-request";
import FlaggedTransactionService, {CreateFlaggedTransactionParams} from "../service/flagged-transaction-service";
import {FlagStatus} from "../entity/transactions/flagged-transaction";

export default class FlaggedTransactionController extends BaseController {
  private logger: Logger = log4js.getLogger('FlaggedTransactionController');

  private fileService: FileService;

  /**
   * Creates a new flagged transaction controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'FlaggedTransactions', ['*']),
          handler: this.returnPendingFlaggedTransactions.bind(this),
        },
        POST: {
          body: { modelName: 'FlaggedTransactionRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'FlaggedTransactions', ['*']),
          handler: this.createFlaggedTransaction.bind(this),
        },
      },
      // '/all': {
      //   GET: {
      //     policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'FlaggedTransactions', ['*']),
      //     handler: this.returnAllFlaggedTransactions.bind(this),
      //   },
      // },
      // '/:id(\\d+)': {
      //   GET: {
      //     policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'FlaggedTransactions', ['*']),
      //     handler: this.returnSingleBanner.bind(this),
      //   },
      //   PATCH: {
      //     body: { modelName: 'BannerRequest' },
      //     policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'FlaggedTransactions', ['*']),
      //     handler: this.updateBanner.bind(this),
      //   },
      // },
    };
  }

  /**
   * GET /flaggedtransactions
   * @summary Returns all existing flagged transactions
   * @operationId getPendingFlaggedTransactions
   * @tags flagged - Operations of the flagged transactions controller
   * @security JWT
   * @param {integer} take.query - How many flagged transactions the endpoint should return
   * @param {integer} skip.query - How many flagged transactions should be skipped (for pagination)
   * @return {PaginatedFlaggedTransactionResponse} 200 - All existing flagged transactions
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnPendingFlaggedTransactions(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all pending flagged transactions by', req.token.user);

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

    try {
      res.json(await FlaggedTransactionService.getFlaggedTransactions({}, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all flagged transactions:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /flaggedtransactions
   * @summary Creates a flagged transaction
   * @operationId createFlaggedTransaction
   * @tags flagged - Operations of the flagged transactions controller
   * @security JWT
   * @param {FlaggedTransactionRequest} request.body.required - The flagged transaction which should be created
   * @return {FlaggedTransactionResponse} 200 - The created flagged transaction entity.
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createFlaggedTransaction(request: RequestWithToken, res: Response): Promise<void>{
    const body = request.body as FlaggedTransactionRequest;
    this.logger.trace('Create flagged transaction', body, 'by user', request.token.user);

    const params: CreateFlaggedTransactionParams = {
      status: FlagStatus.TODO,
      reason: body.reason,
      flaggedById: request.token.user.id,
      transactionId: body.transactionId,
    };
    try {

      res.json(await FlaggedTransactionService.createFlaggedTransaction(params));
    } catch (error) {
      this.logger.error('Could not create flagged transaction:', error);
      this.logger.error(params);
      res.status(500).json('Internal server error.');
    }
  }
  // /**
  //  * POST /banners
  //  * @summary Saves a banner to the database
  //  * @operationId create
  //  * @tags banners - Operations of banner controller
  //  * @param {BannerRequest} request.body.required - The banner which should be created
  //  * @security JWT
  //  * @return {BannerResponse} 200 - The created banner entity
  //  * @return {string} 400 - Validation error
  //  * @return {string} 500 - Internal server error
  //  */
  // public async createBanner(req: RequestWithToken, res: Response): Promise<void> {
  //   const body = req.body as BannerRequest;
  //   this.logger.trace('Create banner', body, 'by user', req.token.user);
  //
  //   // handle request
  //   try {
  //     if (BannerService.verifyBanner(body)) {
  //       res.json(await BannerService.createBanner(body));
  //     } else {
  //       res.status(400).json('Invalid banner.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Could not create banner:', error);
  //     res.status(500).json('Internal server error.');
  //   }
  // }
  //
  // /**
  //  * POST /banners/{id}/image
  //  * @summary Uploads a banner image to the given banner
  //  * @operationId updateImage
  //  * @tags banners - Operations of banner controller
  //  * @param {integer} id.path.required - The id of the banner
  //  * @param {FileRequest} request.body.required - banner image - multipart/form-data
  //  * @security JWT
  //  * @return 204 - Success
  //  * @return {string} 400 - Validation error
  //  * @return {string} 500 - Internal server error
  //  */
  // public async uploadBannerImage(req: RequestWithToken, res: Response): Promise<void> {
  //   const { id } = req.params;
  //   const { files } = req;
  //   this.logger.trace('Upload banner image for banner', id, 'by user', req.token.user);
  //
  //   if (!req.files || Object.keys(files).length !== 1) {
  //     res.status(400).send('No file or too many files were uploaded');
  //     return;
  //   }
  //   if (files.file === undefined) {
  //     res.status(400).send("No file is uploaded in the 'file' field");
  //     return;
  //   }
  //   const file = files.file as UploadedFile;
  //   if (file.data === undefined) {
  //     res.status(400).send('File body data is missing from request');
  //     return;
  //   }
  //   if (file.name === undefined) {
  //     res.status(400).send('File name is missing from request');
  //     return;
  //   }
  //
  //   const bannerId = parseInt(id, 10);
  //
  //   try {
  //     const banner = await Banner.findOne({ where: { id: bannerId }, relations: ['image'] });
  //     if (banner) {
  //       await this.fileService.uploadEntityImage(
  //         banner, file, req.token.user,
  //       );
  //       res.status(204).send();
  //       return;
  //     }
  //     res.status(404).json('Banner not found');
  //     return;
  //   } catch (error) {
  //     this.logger.error('Could not upload image:', error);
  //     res.status(500).json('Internal server error');
  //   }
  // }
  //
  // /**
  //  * GET /banners/{id}
  //  * @summary Returns the requested banner
  //  * @operationId getBanner
  //  * @tags banners - Operations of banner controller
  //  * @param {integer} id.path.required - The id of the banner which should be returned
  //  * @security JWT
  //  * @return {BannerResponse} 200 - The requested banner entity
  //  * @return {string} 404 - Not found error
  //  * @return {string} 500 - Internal server error
  //  */
  // public async returnSingleBanner(req: RequestWithToken, res: Response): Promise<void> {
  //   const { id } = req.params;
  //   this.logger.trace('Get single banner', id, 'by user', req.token.user);
  //
  //   // handle request
  //   try {
  //     // check if banner in database
  //     const { records } = await BannerService.getBanners({ bannerId: Number.parseInt(id, 10) });
  //     if (records.length > 0) {
  //       res.json(records[0]);
  //     } else {
  //       res.status(404).json('Banner not found.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Could not return banner:', error);
  //     res.status(500).json('Internal server error.');
  //   }
  // }
  //
  // /**
  //  * PATCH /banners/{id}
  //  * @summary Updates the requested banner
  //  * @operationId update
  //  * @tags banners - Operations of banner controller
  //  * @param {integer} id.path.required - The id of the banner which should be updated
  //  * @param {BannerRequest} request.body.required - The updated banner
  //  * @security JWT
  //  * @return {BannerResponse} 200 - The requested banner entity
  //  * @return {string} 400 - Validation error
  //  * @return {string} 404 - Not found error
  //  * @return {string} 500 - Internal server error
  //  */
  // public async updateBanner(req: RequestWithToken, res: Response): Promise<void> {
  //   const body = req.body as BannerRequest;
  //   const { id } = req.params;
  //   this.logger.trace('Update banner', id, 'by user', req.token.user);
  //
  //   // handle request
  //   try {
  //     if (BannerService.verifyBanner(body)) {
  //       // try patching the banner
  //       const banner = await BannerService.updateBanner(Number.parseInt(id, 10), body);
  //       if (banner) {
  //         res.json(banner);
  //       } else {
  //         res.status(404).json('Banner not found.');
  //       }
  //     } else {
  //       res.status(400).json('Invalid banner.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Could not update banner:', error);
  //     res.status(500).json('Internal server error.');
  //   }
  // }
  //
  // /**
  //  * DELETE /banners/{id}
  //  * @summary Deletes the requested banner
  //  * @operationId delete
  //  * @tags banners - Operations of banner controller
  //  * @param {integer} id.path.required - The id of the banner which should be deleted
  //  * @security JWT
  //  * @return {BannerResponse} 200 - The deleted banner entity
  //  * @return {string} 404 - Not found error
  //  */
  // public async removeBanner(req: RequestWithToken, res: Response): Promise<void> {
  //   const { id } = req.params;
  //   this.logger.trace('Remove banner', id, 'by user', req.token.user);
  //
  //   // handle request
  //   try {
  //     // check if banner in database
  //     const banner = await BannerService.deleteBanner(Number.parseInt(id, 10), this.fileService);
  //     if (banner) {
  //       res.json(banner);
  //     } else {
  //       res.status(404).json('Banner not found.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Could not remove banner:', error);
  //     res.status(500).json('Internal server error.');
  //   }
  // }
  //
  // /**
  //  * GET /banners/active
  //  * @summary Returns all active banners
  //  * @operationId getActive
  //  * @tags banners - Operations of banner controller
  //  * @security JWT
  //  * @param {integer} take.query - How many banners the endpoint should return
  //  * @param {integer} skip.query - How many banners should be skipped (for pagination)
  //  * @return {PaginatedBannerResponse} 200 - All active banners
  //  * @return {string} 400 - Validation error
  //  */
  // public async returnActiveBanners(req: RequestWithToken, res: Response): Promise<void> {
  //   const { body } = req;
  //   this.logger.trace('Get active banners', body, 'by user', req.token.user);
  //
  //   const { take, skip } = parseRequestPagination(req);
  //
  //   // handle request
  //   try {
  //     res.json(await BannerService.getBanners({ active: true }, { take, skip }));
  //   } catch (error) {
  //     this.logger.error('Could not return active banners:', error);
  //     res.status(500).json('Internal server error.');
  //   }
  // }
}
