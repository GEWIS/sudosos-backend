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
 * This is the module page of the token-middleware.
 *
 * @module internal/middleware
 */

import { v4 as uuid4 } from 'uuid';
import { RequestHandler, Response } from 'express';
import TokenHandler from '../authentication/token-handler';
import JsonWebToken from '../authentication/json-web-token';
import { RequestWithRawBody } from '../helpers/raw-body';

/**
 * The configuration options for the token middleware.
 */
export interface MiddlewareOptions {
  /**
   * The token handler instance internally used by the middleware.
   */
  tokenHandler: TokenHandler;
  /**
   * The factor of the configured expiry of the token handler at which the token will be refreshed.
   * Set to `0.0` for refreshing on every request. Setting to `1.0` or higher will prevent
   * refeshing, as tokens will expire before a possible refresh.
   */
  refreshFactor: number;
}

/**
 * Extend the Express request interface with a token property, which will be filled by this
 * middleware.
 */
export interface RequestWithToken extends RequestWithRawBody {
  /**
   * The parsed JWT in the request header.
   */
  token: JsonWebToken;
}

/**
 * This class is responsible for:
 * - parsing JWT tokens in the request Authorization header.
 * - validating parsed JWT tokens.
 * - refreshing the JWT tokens in the request header allowing sliding expiration.
 */
export default class TokenMiddleware {
  /**
   * A reference to the options to be used by this middleware instance.
   */
  private readonly options: MiddlewareOptions;

  /**
   * Creates a new token middleware instance.
   * @param options - the options to be used by this middleware.
   */
  public constructor(options: MiddlewareOptions) {
    this.options = options;
  }

  /**
   * Middleware handler for parsing and validating JWT tokens.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    // Check that a token exist in the request headers.
    let tokenString = req.headers.authorization;
    if (!tokenString || !tokenString.startsWith('Bearer ')) {
      res.status(401).end('No token in Authorization header.');
      return;
    }

    // Validate the request token.
    try {
      tokenString = tokenString.substr('Bearer '.length);
      req.token = await this.options.tokenHandler.verifyToken(tokenString);
    } catch {
      res.status(403).end('Invalid token supplied.');
      return;
    }

    // Refresh the token if needed.
    // There is no need to check if now is after the expiry, as verification would've failed.
    const now = Math.round(new Date().getTime() / 1000);
    const { expiry } = this.options.tokenHandler.getOptions();
    const refreshAfter = req.token.exp - expiry * (1.0 - this.options.refreshFactor);
    if (now >= refreshAfter) {
      const newToken = await this.options.tokenHandler.refreshToken(tokenString, uuid4());
      res.header('Set-Authorization', newToken);
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
