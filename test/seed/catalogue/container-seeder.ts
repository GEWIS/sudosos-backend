/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import WithManager from '../../../src/database/with-manager';
import User, { UserType } from '../../../src/entity/user/user';
import Container from '../../../src/entity/container/container';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import ProductSeeder from './product-seeder';

export default class ContainerSeeder extends WithManager {
  /**
   * Defines container objects based on the parameters passed.
   *
   * @param start - The number of containers that already exist.
   * @param count - The number of containers to generate.
   * @param user - The user that is owner of the containers.
   */
  private defineContainers(
    start: number,
    count: number,
    user: User,
  ): Container[] {
    const containers: Container[] = [];
    for (let nr = 1; nr <= count; nr += 1) {
      const container = Object.assign(new Container(), {
        id: start + nr,
        owner: user,
        deletedAt: (nr % 3 === 2) ? new Date() : undefined,
        public: nr % 2 > 0,
      }) as Container;
      containers.push(container);
    }
    return containers;
  }

  /**
   * Defines container revisions based on the parameters passed.
   *
   * @param start - The number of container revisions that already exist.
   * @param count - The number of container revisions to generate.
   * @param container - The container that the container revisions belong to.
   * @param productRevisions - The product revisions that will be added to the container revisions.
   */
  private defineContainerRevisions(
    start: number,
    count: number,
    container: Container,
    productRevisions: ProductRevision[],
  ): ContainerRevision[] {
    const revisions: ContainerRevision[] = [];
    // Only allow products with same owner in container.
    const candidates = productRevisions.filter((p) => p.product.owner === container.owner);

    for (let rev = 1; rev <= count; rev += 1) {
      revisions.push(Object.assign(new ContainerRevision(), {
        container,
        revision: rev,
        name: `Container${container.id}-${rev}`,
        products: candidates.filter((p) => p.revision === rev),
      }));
    }
    return revisions;
  }

  /**
   * Seeds a default dataset of container revisions,
   * based on the supplied user and product dataset.
   * Every user of type local admin and organ will get containers.
   *
   * @param users - The dataset of users to base the container dataset on.
   * @param productRevisions - The dataset of product revisions to base the container dataset on.
   */
  public async seed(
    users: User[],
    productRevisions?: ProductRevision[],
  ): Promise<{
      containers: Container[],
      containerRevisions: ContainerRevision[],
    }> {
    const productRevisions1 = productRevisions ?? (await new ProductSeeder().seed(users)).productRevisions;

    let containers: Container[] = [];
    let containerRevisions: ContainerRevision[] = [];

    const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.ORGAN, UserType.MEMBER].includes(u.type));

    const promises: Promise<any>[] = [];
    for (let i = 0; i < sellers.length; i += 1) {
      const con = this.defineContainers(
        containers.length,
        4,
        sellers[i],
      );
      let rev: ContainerRevision[] = [];
      for (let o = 0; o < con.length; o += 1) {
        con[o].currentRevision = (con[o].id % 3) + 1;
        rev = rev.concat(this.defineContainerRevisions(
          containerRevisions.length,
          con[o].currentRevision,
          con[o],
          productRevisions1,
        ));
      }

      // Revisions can only be saved AFTER the containers themselves.
      promises.push(this.manager.save(Container, con).then(() => this.manager.save(ContainerRevision, rev)));

      containers = containers.concat(con);
      containerRevisions = containerRevisions.concat(rev);
    }
    await Promise.all(promises);

    return { containers, containerRevisions };
  }
}
