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
 * This is the module page of the authentication-qr-controller.
 *
 * @module authentication
 */

import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import TokenHandler from '../authentication/token-handler';
import QRService from '../service/qr-service';

export default class AuthenticationQRController extends BaseController {
  private logger: Logger = log4js.getLogger('AuthenticationQRController');

  protected tokenHandler: TokenHandler;

  public constructor(options: BaseControllerOptions, tokenHandler: TokenHandler) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.tokenHandler = tokenHandler;
  }

  public getPolicy(): any {
    return {
      '/generate': {
        POST: {
          policy: async () => true,
          handler: this.generateQRCode.bind(this),
        },
      },
      '/:sessionId/status': {
        GET: {
          policy: async () => true,
          handler: this.getQRStatus.bind(this),
        },
      },
      '/:sessionId/cancel': {
        POST: {
          policy: async () => true,
          handler: this.cancelQRCode.bind(this),
        },
      },
    };
  }

  /**
   * POST /authentication/qr/generate
   * @summary Generate a QR code for authentication
   * @operationId generateQRCode
   * @tags authenticate - Operations of authentication controller
   * @return {QRCodeResponse} 200 - The QR code session information
   * @return {string} 500 - Internal server error
   */
  public async generateQRCode(req: Request, res: Response): Promise<void> {
    this.logger.trace('Generating QR code for authentication');

    try {
      const qr = await (new QRService()).create();
      res.json(qr.response());
    } catch (error) {
      this.logger.error('Could not generate QR code:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /authentication/qr/{sessionId}/status
   * @summary Get the status of a QR authentication session
   * @operationId getQRStatus
   * @tags authenticate - Operations of authentication controller
   * @param {string} sessionId.path.required - The session ID
   * @return {QRStatusResponse} 200 - The session status
   * @return {string} 404 - Session not found
   * @return {string} 500 - Internal server error
   */
  public async getQRStatus(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    this.logger.trace('Getting QR status for session', sessionId);

    try {
      const qr = await (new QRService()).get(sessionId);

      if (!qr) {
        res.status(404).json('Session not found.');
        return;
      }

      res.json({
        status: qr.status,
      });
    } catch (error) {
      this.logger.error('Could not get QR status:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /authentication/qr/{sessionId}/cancel
   * @summary Cancel QR code authentication
   * @operationId cancelQRCode
   * @tags authenticate - Operations of authentication controller
   * @param {string} sessionId.path.required - The session ID
   * @security JWT
   * @return 204 - Successfully cancelled
   * @return {string} 500 - Internal server error
   */
  private async cancelQRCode(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    this.logger.trace('Cancelling QR code for session', sessionId);

    try {
      const qr = await (new QRService()).get(sessionId);

      if (!qr) {
        res.status(204).send();
        return;
      }

      await (new QRService()).cancel(qr);
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not cancel QR code:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
