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

import { Joinable, Specification } from '../helpers/specification-validation';

/**
 * Registry that maps Swagger model names to their async validation specifications.
 * Controllers register their specs at startup; the AsyncValidatorMiddleware
 * looks them up at request time.
 */
export default class AsyncValidatorRegistry {
  private readonly registry = new Map<string, Specification<any, Joinable>>();

  /**
   * Register an async validation spec for a given Swagger model name.
   * @param modelName - The Swagger model name (must match the `modelName` in BodyValidator).
   * @param spec - The specification to run against the request body.
   */
  public register(modelName: string, spec: Specification<any, Joinable>): void {
    this.registry.set(modelName, spec);
  }

  /**
   * Retrieve the spec registered for the given model name, or undefined if none registered.
   * @param modelName - The Swagger model name to look up.
   */
  public get(modelName: string): Specification<any, Joinable> | undefined {
    return this.registry.get(modelName);
  }
}

/**
 * Global singleton registry instance shared across all controllers.
 */
export const globalAsyncValidatorRegistry = new AsyncValidatorRegistry();
