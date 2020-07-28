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
import { RequestHandler, Response } from 'express';
import { PolicyImplementation } from '../controller/policy';
import { RequestWithToken } from './token-middleware';

/**
 * This class is responsible for:
 * - enforcing a given policy implementation as middleware.
 */
export default class PolicyMiddleware {
  /**
   * A reference to the policy to be used by this middleware instance.
   */
  private readonly policy: PolicyImplementation;

  /**
   * Creates a new policy middleware instance.
   * @param policy - the policy to be used by this middleware.
   */
  public constructor(policy: PolicyImplementation) {
    this.policy = policy;
  }

  /**
   * Middleware handler for enforcing the policy.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    if (await this.policy(req)) {
      next();
      return;
    }

    res.status(403).end('You have insufficient permissions for the requested action.');
  }

  /**
   * @returns a middleware handler to be used by express.
   */
  public getMiddleware(): RequestHandler {
    return this.handle.bind(this);
  }
}
