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
 * This is the module page of the sync-service-factory.
 *
 * @module internal/sync-service-factory
 */

import { SyncService } from './sync-service';
import RoleManager from '../../rbac/role-manager';
import { EntityManager } from 'typeorm';

/**
 * Generic sync service type identifier.
 * Concrete factories should define their own specific service types.
 */
export type SyncServiceType = string;

export interface SyncServiceFactoryOptions {
  roleManager?: RoleManager;
  manager?: EntityManager;
  serviceFilter?: SyncServiceType | SyncServiceType[];
}

/**
 * Abstract factory class for creating and initializing sync services.
 * Centralizes the logic for determining which sync services to create
 * based on environment variables and configuration.
 * 
 * @template T The entity type that the sync services operate on
 * @template S The specific sync service type that extends SyncService
 */
export default abstract class SyncServiceFactory<T, S extends SyncService<T>> {
  
  /**
   * Creates and returns an array of configured sync services.
   * 
   * @param options - Configuration options for the factory
   * @returns Array of initialized sync services
   */
  public abstract createSyncServices(options: SyncServiceFactoryOptions): S[];

  /**
   * Gets information about which sync services are available based on environment configuration.
   * 
   * @returns Object describing available services
   */
  public abstract getAvailableServices(): Record<string, boolean>;
}
