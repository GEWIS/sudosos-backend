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
import { json } from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import RbacController from '../../../src/controller/rbac-controller';
import RoleResponse from '../../../src/controller/response/rbac/role-response';
import User, { UserType } from '../../../src/entity/user/user';
import RoleManager, { RoleDefinition } from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';

describe('RbacController', async (): Promise<void> => {
  let ctx: {
    app: Application,
    specification: SwaggerSpecification,
    controller: RbacController,
    role: RoleDefinition,
  };

  // initialize context
  beforeEach(async () => {
    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    const role : RoleDefinition = {
      name: 'Admin',
      permissions: {
        Banner: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
        Product: {
          get: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    };
    roleManager.registerRole(role);

    const controller = new RbacController({ specification, roleManager });
    app.use(json());
    app.use('/rbac', controller.getRouter());

    // initialize context
    ctx = {
      app,
      specification,
      controller,
      role,
    };
  });

  describe('GET /rbac/roles', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/rbac/roles');
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'Array.<RoleResponse.model>',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all roles', async () => {
      const res = await request(ctx.app)
        .get('/rbac/roles');
      const roles = res.body as RoleResponse[];

      expect(roles.every(
        (r: RoleResponse) => {
          const validation = ctx.specification.validateModel(
            'RoleResponse',
            r,
            false,
            true,
          );
          return validation.valid;
        },
      )).to.be.true;

      expect(roles.length).to.equal(1);

      const role = roles[0];
      expect(role.role).to.equal(ctx.role.name);
      expect(role.entities.length).to.equal(Object.keys(ctx.role.permissions).length);
    });
  });
});
