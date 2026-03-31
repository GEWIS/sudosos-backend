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
 * This is the module page of the async-validator-registry.
 *
 * @module internal/middleware
 */

import { RequestWithToken } from './token-middleware';
import { Joinable, Specification } from '../helpers/specification-validation';

/**
 * Registry that maps Swagger model names to their async validation specifications.
 * Controllers register their specs at startup; the AsyncValidatorMiddleware
 * looks them up at request time.
 */

/**
 * A factory function that returns a fresh Specification per call.
 * This prevents ValidationError.join() from mutating shared trace instances across requests.
 */
export type SpecificationFactory<T = any, F extends Joinable = Joinable> = () => Specification<T, F>;

/**
 * Builds the validation target from the request. When provided, the middleware
 * calls this instead of using raw `req.body`, allowing specs that need route
 * params, token data, or other request context.
 */
export type BuildTarget<T = any> = (req: RequestWithToken) => T;

export interface RegistryEntry {
  factory: SpecificationFactory;
  buildTarget?: BuildTarget;
}

export default class AsyncValidatorRegistry {
  private readonly registry = new Map<string, RegistryEntry>();

  /**
   * Register an async validation spec factory for a given Swagger model name.
   * @param modelName - The Swagger model name (must match the `modelName` in BodyValidator).
   * @param factory - A function returning a fresh specification per request.
   * @param buildTarget - Optional function that builds the validation target from the
   *   request. When omitted the middleware validates `req.body` directly.
   */
  public register<T>(modelName: string, factory: SpecificationFactory<T>, buildTarget?: BuildTarget<T>): void {
    this.registry.set(modelName, { factory, buildTarget });
  }

  /**
   * Retrieve the registry entry for the given model name, or undefined if none.
   * @param modelName - The Swagger model name to look up.
   */
  public get(modelName: string): RegistryEntry | undefined {
    return this.registry.get(modelName);
  }
}

/**
 * Global singleton registry instance shared across all controllers.
 */
export const globalAsyncValidatorRegistry = new AsyncValidatorRegistry();
