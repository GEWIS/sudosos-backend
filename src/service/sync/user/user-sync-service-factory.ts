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
 * This is the module page of the user-sync-service-factory.
 *
 * @module internal/user-sync-service-factory
 */

import SyncServiceFactory, { SyncServiceFactoryOptions } from '../sync-service-factory';
import { UserSyncService } from './user-sync-service';
import LdapSyncService from './ldap-sync-service';
import GewisDBSyncService from '../../../gewis/service/gewisdb-sync-service';
import User from '../../../entity/user/user';

/**
 * User-specific sync service types.
 */
export enum UserSyncServiceType {
  LDAP = 'ldap',
  GEWISDB = 'gewisdb',
}

/**
 * Concrete factory for creating user sync services.
 * Handles the creation of LDAP and GEWISDB sync services for user entities.
 */
export interface UserSyncServiceFactoryOptions extends SyncServiceFactoryOptions {
  serviceFilter?: UserSyncServiceType | UserSyncServiceType[];
}

export default class UserSyncServiceFactory extends SyncServiceFactory<User, UserSyncService> {
  
  /**
   * Creates and returns an array of configured user sync services.
   * 
   * @param options - Configuration options for the factory
   * @returns Array of initialized user sync services
   */
  public createSyncServices(options: UserSyncServiceFactoryOptions): UserSyncService[] {
    const { roleManager, manager, serviceFilter } = options;
    const syncServices: UserSyncService[] = [];
    const availableServices = this.getAvailableServices();

    // Determine which services to create based on filter
    const servicesToCreate = this.determineServicesToCreate(serviceFilter);

    // Create LDAP sync service if enabled and requested
    if (servicesToCreate.includes(UserSyncServiceType.LDAP) && availableServices.ldap) {
      if (!roleManager) {
        throw new Error('RoleManager is required for LDAP sync service');
      }
      const ldapSyncService = new LdapSyncService(roleManager, undefined, manager);
      syncServices.push(ldapSyncService);
    }

    // Create GEWISDB sync service if configured and requested
    if (servicesToCreate.includes(UserSyncServiceType.GEWISDB) && availableServices.gewisdb) {
      const gewisDBSyncService = new GewisDBSyncService(undefined, undefined, manager);
      syncServices.push(gewisDBSyncService);
    }

    return syncServices;
  }

  /**
   * Gets information about which user sync services are available based on environment configuration.
   * 
   * @returns Object describing available services
   */
  public getAvailableServices(): { ldap: boolean; gewisdb: boolean } {
    return {
      ldap: process.env.ENABLE_LDAP === 'true',
      gewisdb: !!(process.env.GEWISDB_API_KEY && process.env.GEWISDB_API_URL),
    };
  }

  /**
   * Determines which services should be created based on the filter.
   * If no filter is provided, all available services are included.
   * 
   * @param serviceFilter - Optional filter for which services to create
   * @returns Array of service types to create
   */
  private determineServicesToCreate(serviceFilter?: UserSyncServiceType | UserSyncServiceType[]): UserSyncServiceType[] {
    if (!serviceFilter) {
      // No filter provided, include all available services
      return [UserSyncServiceType.LDAP, UserSyncServiceType.GEWISDB];
    }

    // Convert single service to array for consistent handling
    const filterArray = Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter];
    
    // Validate that all requested services are supported
    const supportedServices: UserSyncServiceType[] = [UserSyncServiceType.LDAP, UserSyncServiceType.GEWISDB];
    const invalidServices = filterArray.filter(service => !supportedServices.includes(service));
    
    if (invalidServices.length > 0) {
      throw new Error(`Unsupported sync service types: ${invalidServices.join(', ')}. Supported types: ${supportedServices.join(', ')}`);
    }

    return filterArray;
  }
}
