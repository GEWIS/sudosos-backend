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
import ContainerService, { ContainerParameters } from '../service/container-service';
import { ContainerResponse } from './response/container-response';
import ContainerRevision from '../entity/container/container-revision';

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
          handler: this.returnAllContainers.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'own', 'Container', ['*']),
          handler: this.returnSingleContainer.bind(this),
        },
      },
    };
  }

  /**
   * Returns all existing containers
   * @route GET /containers
   * @group containers - Operations of container controller
   * @security JWT
   * @returns {Array<ContainerResponse>} 200 - All existing containers
   * @returns {string} 500 - Internal server error
   */
  public async returnAllContainers(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all containers', body, 'by user', req.token.user);

    // Handle request
    try {
      //  If user can view all containers.
      const getAll = this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']);

      let containers: ContainerResponse[];
      if (getAll) {
        containers = await ContainerService.getContainers();
      } else {
        containers = await ContainerService
          .getContainersInUserContext({ ownerId: req.token.user.id } as ContainerParameters);
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
   * @returns {ContainerResponse.model} 200 - All existing containers
   * @returns {string} 404 - Not found error
   * @returns {string} 500 - Internal server error
   */
  public async returnSingleContainer(req: RequestWithToken, res: Response): Promise<void> {
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

      // If user can view all containers.
      const getAll = this.roleManager.can(req.token.roles, 'get', 'all', 'Container', ['*']);

      let containers: ContainerResponse[];
      if (getAll) {
        containers = await ContainerService.getContainers({ containerId });
      } else {
        containers = await ContainerService
          .getContainersInUserContext(
            { containerId, ownerId: req.token.user.id } as ContainerParameters,
          );
        if (containers.length === 0) {
          res.status(403).json('Incorrect permissions to get container.');
          return;
        }
      }
      res.json(containers[0]);
    } catch (error) {
      this.logger.error('Could not return single container:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
