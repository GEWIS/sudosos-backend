/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * This is the module page of the async-validator-middleware.
 *
 * @module internal/middleware
 */

import { RequestHandler, Response } from 'express';
import { RequestWithToken } from './token-middleware';
import { BodyValidator } from '../controller/policy';
import AsyncValidatorRegistry from './async-validator-registry';
import { isFail, validateSpecification } from '../helpers/specification-validation';

/**
 * Middleware that runs async (potentially DB-hitting) validation specs against the
 * request body before passing to the handler. Runs after RequestValidatorMiddleware
 * (structural Swagger check) and returns the same { valid, errors[] } shape on failure,
 * ensuring a consistent 400 response regardless of which layer caught the error.
 *
 * If no spec is registered in the registry for the given model name, the middleware
 * is a no-op and calls next() immediately.
 */
export default class AsyncValidatorMiddleware {
  private readonly registry: AsyncValidatorRegistry;

  private readonly validator: BodyValidator;

  /**
   * Creates a new async validator middleware instance.
   * @param registry - The registry to look up specs from.
   * @param validator - The BodyValidator containing the model name to look up.
   */
  public constructor(registry: AsyncValidatorRegistry, validator: BodyValidator) {
    this.registry = registry;
    this.validator = validator;
  }

  /**
   * Middleware handler. Looks up the spec for the model name and validates the
   * request. When a `buildTarget` is registered, it constructs the validation
   * target from the full request (params, token, body); otherwise `req.body`
   * is validated directly.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    const entry = this.registry.get(this.validator.modelName);
    if (!entry) {
      next();
      return;
    }

    // Mirror RequestValidatorMiddleware behavior: if this endpoint allows a blank
    // body and the incoming body is empty/undefined, skip async validation — but
    // only when no buildTarget is registered, since buildTarget may construct a
    // valid target from route params or token data even with an empty body.
    if (this.validator.allowBlankTarget && !entry.buildTarget) {
      const body = req.body;
      const isUndefinedOrNull = body === undefined || body === null;
      const isEmptyObject =
        typeof body === 'object' &&
        body !== null &&
        !Array.isArray(body) &&
        Object.keys(body).length === 0;

      if (isUndefinedOrNull || isEmptyObject) {
        next();
        return;
      }
    }

    try {
      const spec = entry.factory();
      const target = entry.buildTarget ? entry.buildTarget(req) : req.body;
      const result = await validateSpecification(target, spec);
      if (isFail(result)) {
        res.status(400).json({ valid: false, errors: [String(result.fail.value)] });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  }

  /**
   * @returns a middleware handler to be used by express.
   */
  public getMiddleware(): RequestHandler {
    return this.handle.bind(this);
  }
}
