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
import seedDatabase from '../../seed';
import Container from '../../../src/entity/container/container';
import { ContainerResponse } from '../../../src/controller/response/container-response';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import UpdatedContainer from '../../../src/entity/container/updated-container';

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
    allUpdated: UpdatedContainer[]
  };

  before(async () => {
    const connection = await Database.initialize();

    await seedDatabase();

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    //  Load all containers from the database.
    const allContainers: Container[] = await Container.find({ relations: ['owner'] });
    const allUpdated: UpdatedContainer[] = await UpdatedContainer.find(
      { relations: ['container', 'container.owner'] },
    );

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users: await User.find(),
      allContainers,
      allUpdated,
    };
  });

  // close database connection
  after(async () => {
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
    it('should return containers with the owner specified', async () => {
      const res: ContainerResponse[] = await ContainerService.getContainers(
        ctx.allContainers[0].owner,
      );

      expect(containerSuperset(res, ctx.allContainers)).to.be.true;

      const belongsToOwner = res.every((container: ContainerResponse) => (
        container.owner.id === ctx.allContainers[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return containers of the point of sale specified', async () => {
      const pos: PointOfSaleRevision = await PointOfSaleRevision.findOne({
        relations: ['containers'],
      });
      const res: ContainerResponse[] = await ContainerService.getContainers(
        null, null, pos,
      );

      expect(containerSuperset(res, ctx.allContainers)).to.be.true;

      const belongsToPos = res.every(
        (c1: ContainerResponse) => pos.containers.some(
          (c2: ContainerRevision) => c2.container.id === c1.id && c2.revision === c1.revision,
        ),
      );
      expect(belongsToPos).to.be.true;
      expect(pos.containers).to.be.length(res.length);
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

  describe('getUpdatedContainers function', () => {
    it('should return all updated containers with no input specification', async () => {
      const res: ContainerResponse[] = await ContainerService.getUpdatedContainers();

      // expect(containerSuperset(res, ctx.allUpdated)).to.be.true;
      expect(res.every(
        (c: ContainerResponse) => ctx.specification.validateModel('ContainerResponse', c, false, true).valid,
      )).to.be.true;
    });
    it('should return updated containers with the owner specified', async () => {
      const res: ContainerResponse[] = await ContainerService.getUpdatedContainers(
        ctx.allContainers[0].owner,
      );

      // expect(containerSuperset(res, ctx.allUpdated)).to.be.true;

      const belongsToOwner = res.every((container: ContainerResponse) => (
        container.owner.id === ctx.allContainers[0].owner.id));

      expect(belongsToOwner).to.be.true;
    });
    it('should return a single updated container if containerId is specified', async () => {
      const res: ContainerResponse[] = await ContainerService
        .getUpdatedContainers(null, ctx.allUpdated[0].container.id);

      expect(res).to.be.length(1);
      expect(res[0].id).to.be.equal(ctx.allUpdated[0].container.id);
    });
    it('should return no containers if the userId and containerId dont match', async () => {
      const res: ContainerResponse[] = await ContainerService
        .getUpdatedContainers(ctx.allUpdated[10].container.owner, ctx.allUpdated[0].container.id);

      expect(res).to.be.length(0);
    });
  });
});
