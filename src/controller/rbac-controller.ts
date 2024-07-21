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

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import RBACService from '../service/rbac-service';
import Role from '../entity/rbac/role';
import { RequestWithToken } from '../middleware/token-middleware';
import { CreatePermissionParams, UpdateRoleParams } from './request/rbac-request';
import { verifyCreatePermissionRequest, verifyUpdateRoleRequest } from './request/validators/rbac-request-spec';
import { isFail } from '../helpers/specification-validation';
import Permission from '../entity/rbac/permission';

export default class RbacController extends BaseController {
  private logger: Logger = log4js.getLogger('RbacController');

  /**
   * Creates a new rbac controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  public getPolicy(): Policy {
    return {
      '/roles': {
        GET: {
          policy: async () => true,
          handler: this.getAllRoles.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Role', ['*']),
          handler: this.createRole.bind(this),
          body: { modelName: 'UpdateRoleRequest' },
        },
      },
      '/roles/:id(\\d+)': {
        GET: {
          policy: async () => true,
          handler: this.getSingleRole.bind(this),
        },
        PATCH: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Role', ['*']),
          handler: this.updateRole.bind(this),
          body: { modelName: 'UpdateRoleRequest' },
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Role', ['*']),
          handler: this.deleteRole.bind(this),
        },
      },
      '/roles/:id(\\d+)/permissions': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Permission', ['*']),
          handler: this.addPermissions.bind(this),
          body: { modelName: 'CreatePermissionsRequest' },
        },
      },
      '/roles/:id(\\d+)/permissions/:entity/:action/:relation': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Permission', ['*']),
          handler: this.deletePermission.bind(this),
        },
      },
    };
  }

  /**
   * GET /rbac/roles
   * @summary Get all existing roles
   * @operationId getAllRoles
   * @tags rbac - Operations of rbac controller
   * @security JWT
   * @return {Array.<RoleResponse>} 200 - All existing roles
   * @return {string} 500 - Internal server error
   */
  public async getAllRoles(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all roles by user', req.token.user);

    // handle request
    try {
      const roles = await Role.find({ relations: { permissions: false } });

      // Map every role to response
      const responses = RBACService.asRoleResponse(roles);
      res.json(responses);
    } catch (error) {
      this.logger.error('Could not return all roles:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /rbac/roles/{id}
   * @summary Get a single existing role with its permissions
   * @operationId getSingleRole
   * @tags rbac - Operations of the rbac controller
   * @param {integer} id.path.required - The ID of the role that should be returned
   * @security JWT
   * @return {RoleWithPermissionsResponse} 200 - Role with its permissions
   * @return {string} 404 - Role not found error
   */
  public async getSingleRole(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single role', id, 'by user', req.token.user);

    try {
      const roleId = Number(id);
      const [roles] = await RBACService.getRoles({ roleId });
      if (roles.length < 1) {
        res.status(404).json('Role not found.');
        return;
      }

      const role = RBACService.asRoleResponse(roles)[0];
      res.json(role);
    } catch (error) {
      this.logger.error('Could not get single role:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /rbac/roles
   * @summary Create a new role
   * @operationId createRole
   * @tags rbac - Operations of the rbac controller
   * @param {UpdateRoleParams} request.body.required - The role which should be created
   * @security JWT
   * @return {RoleResponse} 200 - The created role
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createRole(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Create new role by', req.token.user);

    try {
      const request = { ...body } as UpdateRoleParams;

      const validation = await verifyUpdateRoleRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const role = await RBACService.createRole(request);
      const response = RBACService.asRoleResponse([role])[0];
      res.json(response);
    } catch (error) {
      this.logger.error('Could not create role:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /rbac/roles/{id}
   * @summary Update an existing role
   * @operationId updateRole
   * @tags rbac - Operations of the rbac controller
   * @param {integer} id.path.required - The ID of the role which should be updated
   * @param {UpdateRoleParams} request.body.required - The role which should be updated
   * @security JWT
   * @return {RoleResponse} 200 - The created role
   * @return {string} 400 - Validation error
   * @return {string} 404 - Role not found error
   * @return {string} 500 - Internal server error
   */
  public async updateRole(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const { body } = req;
    this.logger.trace('Update role', id, 'by', req.token.user);

    try {
      const roleId = Number(id);
      const request = { ...body } as UpdateRoleParams;

      const validation = await verifyUpdateRoleRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      let [[role]] = await RBACService.getRoles({ roleId }, { take: 1 });
      if (!role) {
        res.status(404).json('Role not found.');
        return;
      }

      role = await RBACService.updateRole(roleId, request);
      const response = RBACService.asRoleResponse([role])[0];
      res.json(response);
    } catch (error) {
      this.logger.error('Could not update role:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /rbac/roles/{id}
   * @summary Delete an existing role
   * @operationId deleteRole
   * @tags rbac - Operations of the rbac controller
   * @param {integer} id.path.required - The ID of the role which should be deleted
   * @security JWT
   * @return {string} 204 - Success
   * @return {string} 404 - Role not found error
   * @return {string} 500 - Internal server error
   */
  public async deleteRole(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Delete role', id, 'by', req.token.user);

    try {
      const roleId = Number(id);

      let [[role]] = await RBACService.getRoles({ roleId }, { take: 1 });
      if (!role) {
        res.status(404).json('Role not found.');
        return;
      }

      await RBACService.removeRole(roleId);
      res.status(204).json();
    } catch (error) {
      this.logger.error('Could not delete role:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /rbac/roles/{id}/permissions
   * @summary Add new permissions to an existing role
   * @operationId addPermissions
   * @tags rbac - Operations of the rbac controller
   * @param {integer} id.path.required - The ID of the role which should get the new permissions
   * @param {Array.<CreatePermissionParams>} request.body.required - The permissions that need to be added
   * @return {RoleResponse} 200 - The created role
   * @return {string} 400 - Validation error
   * @return {string} 404 - Role not found error
   * @return {string} 500 - Internal server error
   */
  public async addPermissions(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const { body } = req;
    this.logger.trace('Add permissions to role', id, 'by', req.token.user);

    try {
      const roleId = Number(id);

      let [[role]] = await RBACService.getRoles({ roleId }, { take: 1 });
      if (!role) {
        res.status(404).json('Role not found.');
        return;
      }

      if (!Array.isArray(body)) {
        res.status(404).json('Body should be an array.');
        return;
      }

      const params: CreatePermissionParams[] = [...body];
      const validations = await Promise.all(params.map((p) => verifyCreatePermissionRequest(p)));
      for (let validation of validations) {
        if (isFail(validation)) {
          res.status(404).json(validation.fail.value);
          return;
        }
      }

      const permissions = await RBACService.addPermissions(roleId, params);
      res.json(permissions);
      return;
    } catch (error) {
      this.logger.error('Could not add permissions:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /rbac/roles/{id}/permissions/{entity}/{action}/{relation}
   * @summary Delete a permission from an existing role
   * @operationId deletePermission
   * @tags rbac - Operations of the rbac controller
   * @param {integer} id.path.required - The ID of the role
   * @param {integer} entity.path.required - The entity of the permission
   * @param {integer} action.path.required - The action of the permission
   * @param {integer} relation.path.required - The relation of the permission
   * @return {string} 204 - Success
   * @return {string} 404 - Role not found error
   * @return {string} 404 - Permission not found error
   * @return {string} 500 - Internal server error
   */
  public async deletePermission(req: RequestWithToken, res: Response): Promise<void> {
    const { id, action, entity, relation } = req.params;
    this.logger.trace('Delete permission', action, relation, entity, 'from role', id, 'by', req.token.user);

    try {
      const roleId = Number(id);

      let [[role]] = await RBACService.getRoles({ roleId }, { take: 1 });
      if (!role) {
        res.status(404).json('Role not found.');
        return;
      }

      const permission = await Permission.findOne({ where: { roleId, entity, action, relation } });
      if (!permission) {
        res.status(404).json('Permission not found.');
        return;
      }

      await RBACService.removePermission(roleId, { entity, action, relation });
      res.status(204).json();
    } catch (error) {
      this.logger.error('Could not delete permission:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
