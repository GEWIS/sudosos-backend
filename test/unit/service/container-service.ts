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
import { json } from 'body-parser';
import { expect } from 'chai';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ContainerService from '../../../src/service/container-service';
import {
  seedAllContainers, seedAllProducts, seedProductCategories, seedUsers,
} from '../../seed';
import Container from '../../../src/entity/container/container';
import { ContainerResponse } from '../../../src/controller/response/container-response';

/**
  * Test if all the container responses are part of the container set array.
  * @param response
  * @param superset
  */
function containerSuperset(response: ContainerResponse[], superset: Container[]): Boolean {
  return response.every((searchContainer: ContainerResponse) => (
    superset.find((supersetContainer: Container) => (
      supersetContainer.id === searchContainer.id
       && supersetContainer.owner.id === searchContainer.owner.id
    )) !== undefined
  ));
}

describe('ContainerService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    allContainers: Container[],
  };

  beforeEach(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const products = await seedAllProducts(users, categories);
    await seedAllContainers(users, products.productRevisions, products.products);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    //  Load all containers from the database.
    const allContainers: Container[] = await Container.find({ relations: ['owner'] });

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      allContainers,
    };
  });

  // close database connection
  afterEach(async () => {
    await ctx.connection.close();
  });

  describe('getContainers function', () => {
    it('should return all containers with no input specification', async () => {
      const res: ContainerResponse[] = await ContainerService.getContainers();

      expect(containerSuperset(res, ctx.allContainers)).to.be.true;
      expect(res.every(
        (c: ContainerResponse) => ctx.specification.validateModel('ContainerResponse', c, false, true).valid,
      )).to.be.true;
    });
    it('should return all updated containers', async () => {
      // const updatedContainers: ContainerResponse[]
      // = await ContainerService.getUpdatedContainers();

      // expect(containerSuperset(updatedContainers, ctx.allContainers)).to.be.true;
    });
    it('should return container with the owner specified', async () => {
      const res: ContainerResponse[] = await ContainerService.getContainers(
        ctx.allContainers[0].owner,
      );

      expect(containerSuperset(res, ctx.allContainers)).to.be.true;

      const belongsToOwner = res.every((container: ContainerResponse) => (
        container.owner.id === ctx.allContainers[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return a single container if containerId is specified', async () => {
      const res: ContainerResponse[] = await ContainerService
        .getContainers(null, ctx.allContainers[0].id);

      expect(res).to.be.length(1);
      expect(res[0].id).to.be.equal(ctx.allContainers[0].id);
    });
    it('should return no containers if the userId and containerId dont match', async () => {
      const res: ContainerResponse[] = await ContainerService
        .getContainers(ctx.allContainers[10].owner, ctx.allContainers[0].id);

      expect(res).to.be.length(0);
    });
  });
});
