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
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import { UploadedFile } from 'express-fileupload';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import FileService from '../service/file-service';
import SimpleFileRequest from './request/simple-file-request';

export default class SimpleFileController extends BaseController {
  private logger: Logger = log4js.getLogger('SimpleFileController');

  /**
   * Creates a new product controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  getPolicy(): Policy {
    return {
      '/': {
        POST: {
          body: { modelName: 'SimpleFileRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Product', ['*']),
          handler: this.uploadFile.bind(this),
        },
      },
    };
  }

  /**
   * Upload a file with the given name.
   * @route POST /files
   * @group files - Operations of the simple files controller
   * @consumes multipart/form-data
   * @param {file} file.formData
   * @param {string} name.formData
   * @security JWT
   * @returns {SimpleFileResponse.model} 200 - The uploaded file entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async uploadFile(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Upload simple file by user', req.token.user);
    const { body, files } = req;

    if (!req.files || Object.keys(files).length !== 1) {
      res.status(400).send('No file or too many files were uploaded');
      return;
    }
    if (files.file === undefined) {
      res.status(400).send("No file is uploaded in the 'file' field");
      return;
    }

    // handle request
    try {
      res.json(await FileService.uploadSimpleFile('simple', req.token.user, files.file as UploadedFile, body as SimpleFileRequest));
    } catch (error) {
      this.logger.error('Could not upload file:', error);
      res.status(500).json('Internal server error');
    }
  }
}
