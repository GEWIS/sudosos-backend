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

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import ContainerService from '../service/container-service';
import { PaginatedContainerResponse } from './response/container-response';
import ContainerRevision from '../entity/container/container-revision';
import ProductService from '../service/product-service';
import Container from '../entity/container/container';
import { asNumber } from '../helpers/validators';
import { parseRequestPagination } from '../helpers/pagination';
import { verifyContainerRequest, verifyCreateContainerRequest } from './request/validators/container-request-spec';
import { isFail } from '../helpers/specification-validation';
import {
  CreateContainerParams,
  CreateContainerRequest,
  UpdateContainerParams,
  UpdateContainerRequest,
} from './request/container-request';
import userTokenInOrgan from '../helpers/token-helper';

export default class ContainerController extends BaseController {
  private logger: Logger = log4js.getLogger('ContainerController');

  /**
   * Creates a new product controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritdoc
   */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']),
          handler: this.getAllContainers.bind(this),
        },
        POST: {
          body: { modelName: 'CreateContainerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'own', 'Container', ['*']),
          handler: this.createContainer.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await ContainerController.getRelation(req), 'Container', ['*']),
          handler: this.getSingleContainer.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateContainerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', await ContainerController.getRelation(req), 'Container', ['*']),
          handler: this.updateContainer.bind(this),
        },
      },
      '/:id(\\d+)/products': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await ContainerController.getRelation(req), 'Container', ['*']),
          handler: this.getProductsContainer.bind(this),
        },
      },
      '/public': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'public', 'Container', ['*']),
          handler: this.getPublicContainers.bind(this),
        },
      },
    };
  }

  /**
   * GET /containers
   * @summary Returns all existing containers
   * @operationId getAllContainers
   * @tags containers - Operations of container controller
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @return {PaginatedContainerResponse} 200 - All existing containers
   * @return {string} 500 - Internal server error
   */
  public async getAllContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all containers', body, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      const containers: PaginatedContainerResponse = await ContainerService.getContainers(
        {}, { take, skip },
      );
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return all containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /containers/{id}
   * @summary Returns the requested container
   * @operationId getSingleContainer
   * @tags containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be returned
   * @security JWT
   * @return {ContainerWithProductsResponse} 200 - The requested container
   * @return {string} 404 - Not found error
   * @return {string} 403 - Incorrect permissions
   * @return {string} 500 - Internal server error
   */
  public async getSingleContainer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single container', id, 'by user', req.token.user);

    const containerId = parseInt(id, 10);

    // Handle request
    try {
      // Check if we should return a 404.
      const exist = await ContainerRevision.findOne({ where: { container: { id: containerId } } });
      if (!exist) {
        res.status(404).json('Container not found.');
        return;
      }

      const container = (await ContainerService
        .getContainers({ containerId, returnProducts: true })).records[0];
      res.json(container);
    } catch (error) {
      this.logger.error('Could not return single container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /containers/{id}/products
   * @summary Returns all the products in the container
   * @operationId getProductsContainer
   * @tags containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be returned
   * @security JWT
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @return {PaginatedProductResponse} 200 - All products in the container
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async getProductsContainer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const containerId = parseInt(id, 10);

    this.logger.trace('Get all products in container', containerId, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    try {
      // Check if we should return a 404.
      const exist = await ContainerRevision.findOne({ where: { container: { id: containerId } } });
      if (!exist) {
        res.status(404).json('Container not found.');
        return;
      }

      res.json(await ProductService.getProducts({ containerId }, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all products in container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /containers
   * @summary Create a new container.
   * @operationId createContainer
   * @tags containers - Operations of container controller
   * @param {CreateContainerRequest} request.body.required -
   *    The container which should be created
   * @security JWT
   * @return {ContainerWithProductsResponse} 200 - The created container entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createContainer(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateContainerRequest;
    this.logger.trace('Create container', body, 'by user', req.token.user);

    // handle request
    try {
      const request: CreateContainerParams = {
        ...body,
        ownerId: body.ownerId ?? req.token.user.id,
      };

      const validation = await verifyCreateContainerRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      res.json(await ContainerService.createContainer(request));
    } catch (error) {
      this.logger.error('Could not create container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /containers/public
   * @summary Returns all public container
   * @operationId getPublicContainers
   * @tags containers - Operations of container controller
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @return {PaginatedContainerResponse} 200 - All existing public containers
   * @return {string} 500 - Internal server error
   */
  public async getPublicContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all public containers', body, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      const containers: PaginatedContainerResponse = await ContainerService.getContainers(
        { public: true }, { take, skip },
      );
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return all public containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /containers/{id}
   * @summary Update an existing container.
   * @operationId updateContainer
   * @tags containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be updated
   * @param {UpdateContainerRequest} request.body.required -
   *    The container which should be updated
   * @security JWT
   * @return {ContainerWithProductsResponse} 200 - The created container entity
   * @return {string} 400 - Validation error
   * @return {string} 404 - Product not found error
   * @return {string} 500 - Internal server error
   */
  public async updateContainer(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateContainerRequest;
    const { id } = req.params;
    const containerId = Number.parseInt(id, 10);
    this.logger.trace('Update container', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      const request: UpdateContainerParams = {
        ...body,
        id: containerId,
      };

      const validation = await verifyContainerRequest(request);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const container = await Container.findOne({ where: { id: containerId } });
      if (!container) {
        res.status(404).json('Container not found.');
        return;
      }

      res.json(await ContainerService.directContainerUpdate(request));
    } catch (error) {
      this.logger.error('Could not update container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Function to determine which credentials are needed to get container
   *          'all' if user is not connected to container
   *          'organ' if user is not connected to container via organ
   *          'own' if user is connected to container
   * @param req
   * @return whether container is connected to used token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const containerId = asNumber(req.params.id);
    const container: Container = await Container.findOne({ where: { id: containerId }, relations: ['owner'] });

    if (!container) return 'all';
    if (userTokenInOrgan(req, container.owner.id)) return 'organ';

    const containerVisibility = await ContainerService.canViewContainer(
      req.token.user.id, container,
    );
    if (containerVisibility.own) return 'own';
    if (containerVisibility.public) return 'public';
    return 'all';
  }
}
