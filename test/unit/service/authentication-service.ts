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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import sinon from 'sinon';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import seedDatabase from '../../seed';
import Swagger from '../../../src/start/swagger';
import AuthenticationService from '../../../src/service/authentication-service';

describe('AuthenticationService', (): void => {
  let ctx: {
    connection: Connection,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    const app = express();
    await seedDatabase();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    ctx = {
      connection,
      app,
      users,
      spec: await Swagger.importSpecification(),
    };

    after(async () => {
      await ctx.connection.close();
    });

    const stubs: sinon.SinonStub[] = [];

    afterEach(() => {
      stubs.forEach((stub) => stub.restore());
      stubs.splice(0, stubs.length);
    });
  });

  it('should login using LDAP', async () => {
    await AuthenticationService.LDAPAuthentication('m999', 'IkBenEenGast!',
      AuthenticationService.wrapInManager<User>(AuthenticationService.createUserAndBind));
  });
});
