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
 */
import { defaultContext, finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { DataSource } from 'typeorm';
import { Express } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import TokenHandler from '../../../src/authentication/token-handler';
import RoleManager from '../../../src/rbac/role-manager';
import WriteOff from '../../../src/entity/transactions/write-off';
import { seedWriteOffs } from '../../seed';

describe('WriteOffService', () => {
  let ctx: {
    app: Express;
    specification: SwaggerSpecification;
    roleManager: RoleManager;
    connection: DataSource;
    tokenHandler: TokenHandler;
    writeOffs: WriteOff[];
  };

  before(async () => {
    ctx = { ...await defaultContext(), writeOffs: await seedWriteOffs() };
    await truncateAllTables(ctx.connection);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });


});
