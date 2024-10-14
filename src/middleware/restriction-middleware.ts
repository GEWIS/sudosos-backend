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
 * is the module page of the restriction-middleware.
 *
 * @module internal/middleware
 */

import { RequestHandler, Response } from 'express';
import { RequestWithToken } from './token-middleware';
import { TermsOfServiceStatus } from '../entity/user/user';
import ServerSettingsStore from '../server-settings/server-settings-store';
import { ISettings } from '../entity/server-setting';
import { getLogger } from 'log4js';

export interface TokenRestrictions {
  /**
   * Whether the token has "less" rights compared to a full access token. True by default.
   */
  lesser: boolean;

  /**
   * Whether the TOS should be accepted to access this endpoint. True by default.
   */
  acceptedTOS: boolean;

  /**
   * Whether this endpoint should remain accessible when maintenance mode is enabled.
   */
  availableDuringMaintenance: boolean;
}

export default class RestrictionMiddleware {
  /**
   * A reference to the restrictions used by this middleware instance.
   */
  private readonly restrictionsImpl: () => Partial<TokenRestrictions>;

  public constructor(restrictionsImplementation?: () => Partial<TokenRestrictions>) {
    this.restrictionsImpl = restrictionsImplementation || (() => ({}));
  }

  /**
   * Middleware handler for enforcing restrictions on tokens.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    const { lesser, acceptedTOS, availableDuringMaintenance } = this.restrictionsImpl();

    try {
      const maintenance = await ServerSettingsStore.getSettingFromDatabase('maintenanceMode') as ISettings['maintenanceMode'];
      if (maintenance && !availableDuringMaintenance && !req.token?.overrideMaintenance) {
        res.status(503).end('Service is in maintenance mode. Please try again later.');
        return;
      }
    } catch (e) {
      getLogger('RestrictionMiddleware').error(e);
      res.status(500).end('Internal server error.');
      return;
    }

    // No token middleware has been processed before, so skip the restrictions below this snippet
    if (!req.token) {
      next();
      return;
    }

    if ((lesser !== undefined && !lesser) && req.token.lesser) {
      res.status(403).end('You have a lesser token, but this endpoint only accepts full-rights tokens.');
      return;
    }

    if ((acceptedTOS === undefined || acceptedTOS)
      && req.token.user.acceptedToS === TermsOfServiceStatus.NOT_ACCEPTED
    ) {
      res.status(403).end('You have not yet accepted the Terms of Service. Please do this first.');
      return;
    }

    next();
  }

  /**
   * @returns a middleware handler to be used by express.
   */
  public getMiddleware(): RequestHandler {
    return this.handle.bind(this);
  }
}
