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
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import ContainerService from '../service/container-service';
import ContainerRevision from '../entity/container/container-revision';
import ProductService from '../service/product-service';
import ContainerRequest from './request/container-request';
import UpdatedContainer from '../entity/container/updated-container';
import Container from '../entity/container/container';
import UnapprovedProductError from '../entity/errors/unapproved-product-error';
import { parseRequestPagination } from '../helpers/pagination';
import { PaginatedContainerResponse } from './response/container-response';

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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.getAllContainers.bind(this),
        },
        POST: {
          body: { modelName: 'ContainerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Container', ['*']),
          handler: this.createContainer.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.getSingleContainer.bind(this),
        },
        PATCH: {
          body: { modelName: 'ContainerRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Container', ['*']),
          handler: this.updateContainer.bind(this),
        },
      },
      '/:id(\\d+)/products': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.getProductsContainer.bind(this),
        },
      },
      '/:id(\\d+)/update': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.getSingleUpdatedContainer.bind(this),
        },
      },
      '/updated': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.getUpdatedContainers.bind(this),
        },
      },
      '/:id(\\d+)/approve': {
        POST: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'approve', 'all', 'Container', ['*']),
          handler: this.approveUpdate.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing containers
   * @route GET /containers
   * @group containers - Operations of container controller
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @returns {PaginatedContainerResponse} 200 - All existing containers
   * @returns {string} 500 - Internal server error
   */
  public async getAllContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all containers', body, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    // Handle request
    try {
      let containers: PaginatedContainerResponse;
      if (this.canGetAll(req)) {
        containers = await ContainerService.getContainers({}, { take, skip });
      } else {
        containers = await ContainerService.getContainers({ public: true }, { take, skip });
      }
      res.json(containers);
    } catch (error) {
      this.logger.error('Could not return all containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested container
   * @route GET /containers/{id}
   * @group containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be returned
   * @security JWT
   * @returns {ContainerWithProductsResponse.model} 200 - The requested container
   * @returns {string} 404 - Not found error
   * @returns {string} 403 - Incorrect permissions
   * @returns {string} 500 - Internal server error
   */
  public async getSingleContainer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Get single container', id, 'by user', req.token.user);

    const containerId = parseInt(id, 10);

    // Handle request
    try {
      // Check if we should return a 404.
      const exist = await ContainerRevision.findOne({ where: `containerId = ${containerId}` });
      if (!exist) {
        res.status(404).json('Container not found.');
        return;
      }

      if (!await this.canGet(req, containerId)) {
        res.status(403).json('Incorrect permissions to get container.');
        return;
      }

      const container = await ContainerService.getProductsResponse(containerId);
      res.json(container);
    } catch (error) {
      this.logger.error('Could not return single container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all the products in the container
   * @route GET /containers/{id}/products
   * @group containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be returned
   * @security JWT
   * @param {integer} take.query - How many products the endpoint should return
   * @param {integer} skip.query - How many products should be skipped (for pagination)
   * @returns {Array.<ProductResponse>} 200 - All products in the container
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getProductsContainer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const containerId = parseInt(id, 10);

    this.logger.trace('Get all products in container', containerId, 'by user', req.token.user);

    const { take, skip } = parseRequestPagination(req);

    try {
      // Check if the request can view the container
      if (!await this.canGet(req, containerId)) {
        res.status(403).json('Incorrect permissions to get container.');
        return;
      }

      res.json(await ProductService.getProducts({ containerId }, { take, skip }));
    } catch (error) {
      this.logger.error('Could not return all products in container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Create a new container.
   * @route POST /containers
   * @group containers - Operations of container controller
   * @param {ContainerRequest.model} container.body.required - The container which should be created
   * @security JWT
   * @returns {ContainerWithProductsResponse.model} 200 - The created container entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createContainer(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ContainerRequest;
    this.logger.trace('Create container', body, 'by user', req.token.user);

    // handle request
    try {
      if (!await ContainerService.verifyContainer(body)) {
        res.status(400).json('Invalid container.');
        return;
      }

      res.json(await ContainerService.createContainer(req.token.user, body));
    } catch (error) {
      this.logger.error('Could not create container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Approve a container update.
   * @route POST /containers/{id}/approve
   * @param {integer} id.path.required - The id of the container update to approve
   * @group containers - Operations of container controller
   * @security JWT
   * @returns {ContainerWithProductsResponse.model} 200 - The approved container entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async approveUpdate(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.trace('Update accepted', id, 'by user', req.token.user);

    const containerId = Number.parseInt(id, 10);
    // Handle
    try {
      const container = await ContainerService.approveContainerUpdate(containerId);
      if (!container) {
        res.status(404).json('Container update not found.');
        return;
      }

      res.json(container);
    } catch (error) {
      if (error instanceof UnapprovedProductError) {
        res.status(400).json(error.message);
      } else {
        this.logger.error('Could not approve update: ', error);
        res.status(500).json('Internal server error.');
      }
    }
  }

  /**
   * Update an existing container.
   * @route PATCH /containers/{id}
   * @group containers - Operations of container controller
   * @param {integer} id.path.required - The id of the container which should be updated
   * @param {ContainerRequest.model} container.body.required - The container which should be updated
   * @security JWT
   * @returns {ContainerWithProductsResponse.model} 200 - The created container entity
   * @returns {string} 400 - Validation error
   * @returns {string} 404 - Product not found error
   * @returns {string} 500 - Internal server error
   */
  public async updateContainer(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as ContainerRequest;
    const { id } = req.params;
    const containerId = Number.parseInt(id, 10);
    this.logger.trace('Update container', id, 'with', body, 'by user', req.token.user);

    // handle request
    try {
      if (!await ContainerService.verifyContainer(body)) {
        res.status(400).json('Invalid container.');
        return;
      }

      const update = await ContainerService.updateContainer(containerId, body);
      if (!update) {
        res.status(404).json('Container not found.');
        return;
      }

      res.json(update);
    } catch (error) {
      this.logger.error('Could not update container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns all updated containers
   * @route GET /containers/updated
   * @group containers - Operations of containers controller
   * @security JWT
   * @param {integer} take.query - How many containers the endpoint should return
   * @param {integer} skip.query - How many containers should be skipped (for pagination)
   * @returns {Array.<ContainerResponse>} 200 - All updated containers
   * @returns {string} 500 - Internal server error
   */
  public async getUpdatedContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all updated containers', body, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const response = await ContainerService.getUpdatedContainers({}, { take, skip });
      res.json(response);
    } catch (error) {
      this.logger.error('Could not return all updated containers:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Returns the requested updated container
   * @route GET /containers/{id}/update
   * @group containers - Operations of containers controller
   * @param {integer} id.path.required - The id of the container which should be returned
   * @security JWT
   * @returns {ContainerWithProductsResponse.model} 200 - The requested updated container entity
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async getSingleUpdatedContainer(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const containerId = parseInt(id, 10);
    this.logger.trace('Get single updated container', id, 'by user', req.token.user);

    // handle request
    try {
      // Product does not exist.
      if (!await Container.findOne(containerId)) {
        res.status(404).json('Container not found.');
        return;
      }

      // Can User view container
      if (!await this.canGet(req, containerId)) {
        res.status(403).json('Incorrect permissions to get container.');
        return;
      }

      // No update available.
      if (!await UpdatedContainer.findOne(containerId)) {
        res.json();
        return;
      }

      res.json((await ContainerService.getProductsResponse(containerId, true)));
    } catch (error) {
      this.logger.error('Could not return container:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Test if request user can view all containers.
   * @param req - The Request
   */
  canGetAll = (req: RequestWithToken) => this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']);

  /**
   * Test if request user can view specified container.
   * @param req - The request
   * @param id - The container to check.
   */
  canGet = async (req: RequestWithToken, id: number) => (
    this.canGetAll(req) || await ContainerService.canViewContainer(req.token.user.id, id));
}
