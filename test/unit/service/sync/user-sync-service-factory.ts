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

import { expect } from 'chai';
import UserSyncServiceFactory, { UserSyncServiceType } from '../../../../src/service/sync/user/user-sync-service-factory';
import { UserSyncService } from '../../../../src/service/sync/user/user-sync-service';
import LdapSyncService from '../../../../src/service/sync/user/ldap-sync-service';
import GewisDBSyncService from '../../../../src/gewis/service/gewisdb-sync-service';
import RoleManager from '../../../../src/rbac/role-manager';
import { defaultAfter, defaultBefore, DefaultContext } from '../../../helpers/test-helpers';
import { restoreLDAPEnv, setDefaultLDAPEnv, storeLDAPEnv } from '../../../helpers/test-helpers';

describe('UserSyncServiceFactory', (): void => {
  let ctx: DefaultContext;
  let factory: UserSyncServiceFactory;
  let roleManager: RoleManager;
  let originalEnv: { [key: string]: string | undefined };

  before(async (): Promise<void> => {
    ctx = await defaultBefore();
    roleManager = ctx.roleManager;
    factory = new UserSyncServiceFactory();
    originalEnv = storeLDAPEnv();
  });

  after(async (): Promise<void> => {
    restoreLDAPEnv(originalEnv);
    await defaultAfter(ctx);
  });

  beforeEach((): void => {
    setDefaultLDAPEnv();
  });

  afterEach((): void => {
    restoreLDAPEnv(originalEnv);
  });

  describe('createSyncServices', (): void => {
    it('should create no services when no environment variables are set', (): void => {
      // Clear environment variables
      delete process.env.ENABLE_LDAP;
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      expect(services).to.have.length(0);
    });

    it('should create LDAP service when ENABLE_LDAP is true', (): void => {
      process.env.ENABLE_LDAP = 'true';
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(LdapSyncService);
    });

    it('should create GEWISDB service when API credentials are provided', (): void => {
      delete process.env.ENABLE_LDAP;
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(GewisDBSyncService);
    });

    it('should create both services when both are configured', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      expect(services).to.have.length(2);
      expect(services.some(service => service instanceof LdapSyncService)).to.be.true;
      expect(services.some(service => service instanceof GewisDBSyncService)).to.be.true;
    });

    it('should throw error when LDAP is requested but RoleManager is not provided', (): void => {
      process.env.ENABLE_LDAP = 'true';

      expect(() => {
        factory.createSyncServices({
          manager: ctx.connection.manager,
        });
      }).to.throw('RoleManager is required for LDAP sync service');
    });

    it('should filter services when serviceFilter is provided as single service', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: UserSyncServiceType.LDAP,
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(LdapSyncService);
    });

    it('should filter services when serviceFilter is provided as array', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: [UserSyncServiceType.GEWISDB],
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(GewisDBSyncService);
    });

    it('should create multiple services when serviceFilter array contains multiple services', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: [UserSyncServiceType.LDAP, UserSyncServiceType.GEWISDB],
      });

      expect(services).to.have.length(2);
      expect(services.some(service => service instanceof LdapSyncService)).to.be.true;
      expect(services.some(service => service instanceof GewisDBSyncService)).to.be.true;
    });

    it('should not create LDAP service when filtered out even if environment is configured', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: UserSyncServiceType.GEWISDB,
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(GewisDBSyncService);
    });

    it('should not create GEWISDB service when filtered out even if environment is configured', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: UserSyncServiceType.LDAP,
      });

      expect(services).to.have.length(1);
      expect(services[0]).to.be.instanceOf(LdapSyncService);
    });

    it('should create no services when serviceFilter requests unavailable services', (): void => {
      delete process.env.ENABLE_LDAP;
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
        serviceFilter: [UserSyncServiceType.LDAP, UserSyncServiceType.GEWISDB],
      });

      expect(services).to.have.length(0);
    });
  });

  describe('getAvailableServices', (): void => {
    it('should return false for both services when no environment variables are set', (): void => {
      delete process.env.ENABLE_LDAP;
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });

    it('should return true for LDAP when ENABLE_LDAP is true', (): void => {
      process.env.ENABLE_LDAP = 'true';
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.true;
      expect(available.gewisdb).to.be.false;
    });

    it('should return false for LDAP when ENABLE_LDAP is not "true"', (): void => {
      process.env.ENABLE_LDAP = 'false';
      delete process.env.GEWISDB_API_KEY;
      delete process.env.GEWISDB_API_URL;

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });

    it('should return true for GEWISDB when both API key and URL are provided', (): void => {
      delete process.env.ENABLE_LDAP;
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.true;
    });

    it('should return false for GEWISDB when only API key is provided', (): void => {
      delete process.env.ENABLE_LDAP;
      process.env.GEWISDB_API_KEY = 'test-key';
      delete process.env.GEWISDB_API_URL;

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });

    it('should return false for GEWISDB when only API URL is provided', (): void => {
      delete process.env.ENABLE_LDAP;
      delete process.env.GEWISDB_API_KEY;
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });

    it('should return true for both services when both are configured', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.true;
      expect(available.gewisdb).to.be.true;
    });

    it('should return false for GEWISDB when API key is empty string', (): void => {
      delete process.env.ENABLE_LDAP;
      process.env.GEWISDB_API_KEY = '';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });

    it('should return false for GEWISDB when API URL is empty string', (): void => {
      delete process.env.ENABLE_LDAP;
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = '';

      const available = factory.getAvailableServices();

      expect(available.ldap).to.be.false;
      expect(available.gewisdb).to.be.false;
    });
  });

  describe('service filtering validation', (): void => {
    it('should throw error for invalid service type', (): void => {
      process.env.ENABLE_LDAP = 'true';

      expect(() => {
        factory.createSyncServices({
          roleManager,
          manager: ctx.connection.manager,
          serviceFilter: 'invalid-service' as UserSyncServiceType,
        });
      }).to.throw('Unsupported sync service types: invalid-service. Supported types: ldap, gewisdb');
    });

    it('should throw error for array containing invalid service type', (): void => {
      process.env.ENABLE_LDAP = 'true';

      expect(() => {
        factory.createSyncServices({
          roleManager,
          manager: ctx.connection.manager,
          serviceFilter: [UserSyncServiceType.LDAP, 'invalid-service' as UserSyncServiceType],
        });
      }).to.throw('Unsupported sync service types: invalid-service. Supported types: ldap, gewisdb');
    });

    it('should throw error for multiple invalid service types', (): void => {
      process.env.ENABLE_LDAP = 'true';

      expect(() => {
        factory.createSyncServices({
          roleManager,
          manager: ctx.connection.manager,
          serviceFilter: ['invalid1' as UserSyncServiceType, 'invalid2' as UserSyncServiceType],
        });
      }).to.throw('Unsupported sync service types: invalid1, invalid2. Supported types: ldap, gewisdb');
    });
  });

  describe('integration with actual services', (): void => {
    it('should create services that extend UserSyncService', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      services.forEach(service => {
        expect(service).to.be.instanceOf(UserSyncService);
      });
    });

    it('should create services with correct targets property', (): void => {
      process.env.ENABLE_LDAP = 'true';
      process.env.GEWISDB_API_KEY = 'test-key';
      process.env.GEWISDB_API_URL = 'https://test-api.example.com';

      const services = factory.createSyncServices({
        roleManager,
        manager: ctx.connection.manager,
      });

      services.forEach(service => {
        expect(service.targets).to.be.an('array');
        expect(service.targets.length).to.be.greaterThan(0);
      });
    });
  });
});
