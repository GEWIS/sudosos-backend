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

import { json } from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import RbacController from '../../../src/controller/rbac-controller';
import RoleResponse from '../../../src/controller/response/rbac/role-response';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { DataSource } from 'typeorm';
import database from '../../../src/database/database';
import { after, beforeEach } from 'mocha';
import { finishTestDB } from '../../helpers/test-helpers';
import DefaultRoles from '../../../src/rbac/default-roles';
import Role from '../../../src/entity/rbac/role';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TokenHandler from '../../../src/authentication/token-handler';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import PermissionRule from '../../../src/rbac/permission-rule';
import { CreatePermissionParams, UpdateRoleRequest } from '../../../src/controller/request/rbac-request';
import PermissionResponse from '../../../src/controller/response/rbac/permission-response';
import Permission from '../../../src/entity/rbac/permission';
import { RbacSeeder } from '../../seed';
import AssignedRole from '../../../src/entity/rbac/assigned-role';

describe('RbacController', async (): Promise<void> => {
  let ctx: {
    connection: DataSource,
    app: Application,
    specification: SwaggerSpecification,
    controller: RbacController,
    localUser: User,
    adminUser: User,
    userToken: string,
    adminToken: string,
    roles: Role[],
    assignments: AssignedRole[],
  };

  // initialize context
  before(async () => {
    // start app
    const connection = await database.initialize();
    const app = express();
    const specification = await Swagger.initialize(app);

    const [localUser, adminUser] = await User.save([{
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    }, {
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    }]);

    const roles = await DefaultRoles.synchronize();
    const roleManager = await new RoleManager().initialize();

    const assignments = await AssignedRole.find();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken(await new RbacSeeder().getToken(adminUser), 'nonce admin');
    const userToken = await tokenHandler.signToken(await new RbacSeeder().getToken(localUser), 'nonce');

    const controller = new RbacController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/rbac', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      roles,
      localUser,
      adminUser,
      userToken,
      adminToken,
      assignments,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('GET /rbac/roles', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
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
        .get('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
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

      expect(roles.length).to.equal(ctx.roles.length);

      for (let role of roles) {
        const actualRole = ctx.roles.find((r) => r.name === role.name);
        expect(actualRole).to.not.be.undefined;
        expect(role.name).to.equal(actualRole.name);
        expect(role.systemDefault).to.equal(actualRole.systemDefault);
        expect(role.userTypes).to.deep.equal(actualRole.roleUserTypes.map((r) => r.userType));
        expect(role.permissions).to.be.undefined;
      }
    });
    it('should return an HTTP 200 if no permissions', async () => {
      const res = await request(ctx.app)
        .get('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(200);
      expect(res.body).to.not.be.empty;
    });
  });

  describe('GET /rbac/roles/{id}', () => {
    it('should return an HTTP 200 with the role with its permissions', async () => {
      const actualRole = ctx.roles[0];
      const res = await request(ctx.app)
        .get(`/rbac/roles/${actualRole.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'RoleWithPermissionsResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      const role = res.body as RoleResponse;
      expect(role.name).to.equal(actualRole.name);
      expect(role.systemDefault).to.equal(actualRole.systemDefault);
      expect(role.userTypes).to.deep.equal(actualRole.roleUserTypes.map((r) => r.userType));

      const permissions: PermissionRule[] = role.permissions.map(({ entity, actions }) => {
        return actions.map(({ action, relations }) => {
          return relations.map(({ relation, attributes }: PermissionRule) => {
            return { entity, action, relation, attributes };
          });
        }).flat();
      }).flat();
      for (let permission of permissions) {
        const actualPerm = actualRole.permissions.find((p) => p.entity === permission.entity
          && p.action === permission.action
          && p.relation === permission.relation);
        expect(actualPerm).to.not.be.undefined;
        expect(actualPerm.attributes).to.deep.equal(permission.attributes);
      }
    });
    it('should return an HTTP 200 if no permissions', async () => {
      const actualRole = ctx.roles[0];
      const res = await request(ctx.app)
        .get(`/rbac/roles/${actualRole.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.not.be.empty;
    });
    it('should return an HTTP 404 if role does not exist', async () => {
      const id = ctx.roles.length + 1;

      const res = await request(ctx.app)
        .get(`/rbac/roles/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
  });

  describe('GET /rbac/roles/{id}/all-users', () => {
    it('should return an HTTP 200 and correct model', async () => {
      const id = ctx.roles[0].id;

      const res = await request(ctx.app)
        .get(`/rbac/roles/${id}/all-users`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.be.equal(200);
      expect(ctx.specification.validateModel(
        'Array.<UserResponse.model>',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });

    it('should return an HTTP 404 if role does not exist', async () => {
      const id = ctx.roles.length + 1;

      const res = await request(ctx.app)
        .get(`/rbac/roles/${id}/users`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
  });

  describe('POST /rbac/roles', () => {
    it('should return an HTTP 200 when creating new role', async () => {
      const params: UpdateRoleRequest = {
        name: '39th board',
      };
      const res = await request(ctx.app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'RoleWithPermissionsResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      const role = res.body as RoleResponse;
      expect(role.name).to.equal(params.name);
      expect(role.systemDefault).to.be.false;
      expect(role.userTypes).to.deep.equal([]);
      expect(role.permissions).to.deep.equal([]);
      expect(await Role.count()).to.equal(ctx.roles.length + 1);

      // Cleanup
      await Role.delete({ name: role.name });
    });
    it('should return an HTTP 400 if name is empty', async () => {
      const params: UpdateRoleRequest = {
        name: '',
      };
      const res = await request(ctx.app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(400);
      expect(await Role.count()).to.equal(ctx.roles.length);
    });
    it('should return an HTTP 400 if name already exists', async () => {
      const params: UpdateRoleRequest = {
        name: ctx.roles[0].name,
      };
      const res = await request(ctx.app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(400);
      expect(await Role.count()).to.equal(ctx.roles.length);
    });
    it('should return an HTTP 403 if no permissions', async () => {
      const params: UpdateRoleRequest = {
        name: '39th board',
      };
      const res = await request(ctx.app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(params);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('PATCH /rbac/roles/{id}', () => {
    let newRole: Role;
    const params: UpdateRoleRequest = {
      name: '41st board',
    };

    beforeEach(async () => {
      newRole = await Role.save({ name: '39th board' });
      expect(newRole.systemDefault).to.be.false;
    });

    afterEach(async () => {
      if (!newRole) return;

      // Cleanup
      await Role.remove(newRole);

    });

    it('should return an HTTP 200 when updating role', async () => {
      const res = await request(ctx.app)
        .patch(`/rbac/roles/${newRole.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'RoleWithPermissionsResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      const role = res.body as RoleResponse;
      expect(role.name).to.equal(params.name);
      expect(role.systemDefault).to.be.false;
    });
    it('should return an HTTP 400 when updating system default role', async () => {
      const role = ctx.roles.find((r) => r.systemDefault);
      expect(role).to.not.be.undefined;

      const res = await request(ctx.app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Cannot update system default role.');

      const dbRole = await Role.findOne({ where: { id: role.id } });
      expect(dbRole.name).to.equal(role.name);
    });
    it('should return an HTTP 400 if name is empty', async () => {
      const invalidParams: UpdateRoleRequest = {
        ...params,
        name: '',
      };
      const res = await request(ctx.app)
        .patch(`/rbac/roles/${newRole.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidParams);

      expect(res.status).to.equal(400);
      const dbRole = await Role.findOne({ where: { id: newRole.id } });
      expect(dbRole.name).to.equal(newRole.name);
    });
    it('should return an HTTP 400 if name already exists', async () => {
      const invalidParams: UpdateRoleRequest = {
        ...params,
        name: ctx.roles[0].name,
      };
      const res = await request(ctx.app)
        .patch(`/rbac/roles/${newRole.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(invalidParams);

      expect(res.status).to.equal(400);
      const dbRole = await Role.findOne({ where: { id: newRole.id } });
      expect(dbRole.name).to.equal(newRole.name);
    });
    it('should return an HTTP 404 if role does not exist', async () => {
      const id = ctx.roles.length + 1;

      const res = await request(ctx.app)
        .patch(`/rbac/roles/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(params);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
    it('should return an HTTP 403 if no permissions', async () => {
      const res = await request(ctx.app)
        .patch(`/rbac/roles/${ctx.roles[0].id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(params);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('DELETE /rbac/roles/{id}', () => {
    let newRole: Role;

    beforeEach(async () => {
      newRole = await Role.save({ name: '39th board' });
      expect(newRole.systemDefault).to.be.false;
    });

    afterEach(async () => {
      if (!newRole) return;

      // Cleanup
      await Role.remove(newRole);
    });

    it('should return an HTTP 200 and correctly delete role', async () => {
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${newRole.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbRole = await Role.findOne({ where: { id: newRole.id } });
      expect(dbRole).to.be.null;
    });
    it('should return an HTTP 400 when deleting system default role', async () => {
      const role = ctx.roles.find((r) => r.systemDefault);
      expect(role).to.not.be.undefined;

      const res = await request(ctx.app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Cannot delete system default role.');

      const dbRole = await Role.findOne({ where: { id: role.id } });
      expect(dbRole).to.not.be.null;
    });
    it('should return an HTTP 404 when deleting non existent role', async () => {
      const id = ctx.roles.length + 1;

      const res = await request(ctx.app)
        .delete(`/rbac/roles/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${newRole.id}`)
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;

      const dbRole = await Role.findOne({ where: { id: newRole.id } });
      expect(dbRole).to.not.be.null;
    });
  });

  describe('POST /rbac/roles/{id}/permissions', () => {
    let newRole: Role;

    const newPermissions: CreatePermissionParams[] = [{
      entity: 'Bier',
      action: 'drink',
      relation: 'all',
      attributes: ['*'],
    }, {
      entity: 'Bier',
      action: 'drink',
      relation: 'own',
      attributes: ['Vaasje', 'Fluitje'],
    }, {
      entity: 'Ketel 1',
      action: 'drink',
      relation: 'all',
      attributes: ['*'],
    }];

    beforeEach(async () => {
      newRole = await Role.save({ name: '39th board' });
      expect(newRole.systemDefault).to.be.false;
    });

    afterEach(async () => {
      if (!newRole) return;

      // Cleanup
      await Role.remove(newRole);
    });

    it('should return an HTTP 200 and correctly add multiple permissions', async () => {
      const res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'Array.<PermissionResponse>',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      const permissionResponses = res.body as PermissionResponse[];
      const nrEntities = newPermissions
        .filter((p1, index, all) => index === all
          .findIndex((p2) => p1.entity === p2.entity)).length;
      expect(permissionResponses.length).to.equal(nrEntities);
      for (let { entity, actions } of permissionResponses) {
        const entityPerms = newPermissions.filter((p) => p.entity === entity);
        expect(actions.length).to.be.at.least(1);
        for (let { action, relations } of actions) {
          const actionPerms = entityPerms.filter((p) => p.action === action);
          expect(relations.length).to.be.at.least(1);
          for (let { relation, attributes } of relations) {
            const relationPerms = actionPerms.filter((p) => p.relation === relation);
            expect(relationPerms.length).to.equal(1);
            expect(attributes.length).to.be.at.least(1);
            expect(attributes).to.deep.equal(relationPerms[0].attributes);
          }
        }
      }
    });
    it('should return an HTTP 400 when permission already exists', async () => {
      let res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions);
      expect(res.status).to.equal(200);

      res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions);
      expect(res.status).to.equal(400);
      expect(res.body).to.equal(`Follow permissions are duplicates. They either already exist as permissions, or are duplicate in the request body: ${JSON.stringify(newPermissions)}`);

      const dbRole = await Role.findOne({ where: { id: newRole.id }, relations: { permissions: true } });
      // No new permissions added
      expect(dbRole.permissions).to.be.length(newPermissions.length);
    });
    it('should return an HTTP 400 when sending duplicate permissions', async () => {
      let res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send([newPermissions[0], newPermissions[0]]);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal(`Follow permissions are duplicates. They either already exist as permissions, or are duplicate in the request body: ${JSON.stringify([newPermissions[0], newPermissions[0]])}`);

      const dbRole = await Role.findOne({ where: { id: newRole.id }, relations: { permissions: true } });
      // No new permissions added
      expect(dbRole.permissions).to.be.length(0);
    });
    it('should return an HTTP 400 when body is not an array', async () => {
      const res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions[0]);

      expect(res.status).to.equal(400);

      const dbRole = await Role.findOne({ where: { id: newRole.id }, relations: { permissions: true } });
      // No new permissions added
      expect(dbRole.permissions).to.be.length(0);
    });
    it('should return an HTTP 400 when adding permissions to a system default role', async () => {
      const role = ctx.roles.find((r) => r.systemDefault);
      const res = await request(ctx.app)
        .post(`/rbac/roles/${role.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Cannot add permission to system default role.');

      const dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      // No new permissions added
      expect(dbRole.permissions).to.be.length(role.permissions.length);
    });
    it('should return an HTTP 404 when role does not exist', async () => {
      const id = ctx.roles.length + 2;
      const res = await request(ctx.app)
        .post(`/rbac/roles/${id}/permissions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(newPermissions);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
    it('should return an HTTP 403 if no permissions', async () => {
      const res = await request(ctx.app)
        .post(`/rbac/roles/${newRole.id}/permissions`)
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send(newPermissions);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
  });

  describe('DELETE /rbac/roles/{id}/permissions/{entity}/{action}/{relation}', () => {
    let newRole: Role;
    let newPermissions: Permission[];

    beforeEach(async () => {
      newRole = await Role.save({ name: '39th board' });
      newPermissions = await Permission.save([{
        role: newRole,
        roleId: newRole.id,
        entity: 'Bier',
        action: 'drink',
        relation: 'all',
        attributes: ['*'],
      }, {
        role: newRole,
        roleId: newRole.id,
        entity: 'Bier',
        action: 'drink',
        relation: 'own',
        attributes: ['Vaasje', 'Fluitje'],
      }, {
        role: newRole,
        roleId: newRole.id,
        entity: 'Ketel 1',
        action: 'drink',
        relation: 'all',
        attributes: ['*'],
      }]);
      expect(newRole.systemDefault).to.be.false;
    });

    afterEach(async () => {
      if (!newRole) return;

      // Cleanup
      await Role.remove(newRole);
    });
    it('should return an HTTP 204 and correctly delete single permission', async () => {
      const perm = newPermissions[0];
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${newRole.id}/permissions/${perm.entity}/${perm.action}/${perm.relation}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;

      const dbPermission = await Permission.findOne({ where: {
        roleId: perm.roleId,
        entity: perm.entity,
        action: perm.action,
        relation: perm.relation,
      } });
      expect(dbPermission).to.be.null;
    });
    it('should return an HTTP 400 when deleting permission from system default role', async () => {
      const role = ctx.roles.find((r) => r.systemDefault);
      const perm = role.permissions[0];
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${role.id}/permissions/${perm.entity}/${perm.action}/${perm.relation}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Cannot delete permission from system default role.');

      const dbRole = await Role.findOne({ where: { id: role.id }, relations: { permissions: true } });
      expect(dbRole.permissions).to.be.length(role.permissions.length);
    });
    it('should return an HTTP 404 when role does not exist', async () => {
      const id = ctx.roles.length + 2;
      const perm = newPermissions[0];
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${id}/permissions/${perm.entity}/${perm.action}/${perm.relation}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Role not found.');
    });
    it('should return an HTTP 404 when permission does not exist', async () => {
      const perm = newPermissions[0];
      const res = await request(ctx.app)
        .delete(`/rbac/roles/${newRole.id}/permissions/Aquarius/${perm.action}/${perm.relation}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('Permission not found.');

      const dbRole = await Role.findOne({ where: { id: newRole.id }, relations: { permissions: true } });
      expect(dbRole.permissions).to.be.length(newPermissions.length);
    });
  });
});
