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
import WithManager from '../../../src/with-manager';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import PointOfSale from '../../../src/entity/point-of-sale/point-of-sale';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import { addDays } from 'date-fns';
import ContainerSeeder from './container';

export default class PointOfSaleSeeder extends WithManager {
  /**
   * Defines pointsofsale objects based on the parameters passed.
   *
   * @param start - The number of pointsofsale that already exist.
   * @param count - The number of pointsofsale to generate.
   * @param owner - The user that is owner of the pointsofsale.
   */
  private async definePointsOfSale(
    start: number,
    count: number,
    owner: User,
  ): Promise<{ pointsOfSale: PointOfSale[], pointOfSaleUsers: User[] }> {
    const pointsOfSale: PointOfSale[] = [];
    const pointOfSaleUsers: User[] = [];
    for (let nr = 1; nr <= count; nr += 1) {
      const id = start + nr;
      const user = await this.manager.save(User, {
        firstName: `Point of Sale ${id}`,
        type: UserType.POINT_OF_SALE,
        active: true,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      });
      const pointOfSale = Object.assign(new PointOfSale(), {
        id,
        owner,
        user,
        deletedAt: (nr % 3 === 2) ? new Date() : undefined,
      });
      pointsOfSale.push(pointOfSale);
      pointOfSaleUsers.push(user);
    }
    return { pointsOfSale, pointOfSaleUsers };
  }

  /**
   * Defines pointsofsale revisions based on the parameters passed.
   *
   * @param start - The number of pointsofsale revisions that already exist.
   * @param count - The number of pointsofsale revisions to generate.
   * @param dateOffset - The date offset from 2000-1-1, where 0 is before, 1 is during, 2 is after.
   * @param pointOfSale - The pointsofsale that the pointsofsale revisions belong to.
   * @param containerRevisions - The container revisions that will be added to
   * the pointsofsale revisions.
   */
  private definePointOfSaleRevisions(
    start: number,
    count: number,
    dateOffset: number,
    pointOfSale: PointOfSale,
    containerRevisions: ContainerRevision[],
  ): PointOfSaleRevision[] {
    const revisions: PointOfSaleRevision[] = [];
    // Only allow products with same owner in container.
    const candidates = containerRevisions.filter((c) => c.container.owner === pointOfSale.owner);
    const startDate = addDays(new Date(2020, 0, 1), 2 - (dateOffset * 2));
    const endDate = addDays(new Date(2020, 0, 1), 3 - (dateOffset * 2));

    for (let rev = 1; rev <= count; rev += 1) {
      revisions.push(Object.assign(new PointOfSaleRevision(), {
        pointOfSale,
        revision: rev,
        name: `PointOfSale${pointOfSale.id}-${rev}`,
        useAuthentication: (pointOfSale.id + rev) % 2 === 0,
        containers: candidates.filter((c) => c.revision === rev),
        startDate,
        endDate,
      }));
    }
    return revisions;
  }

  /**
   * Seeds a default dataset of pointsofsale revisions,
   * based on the supplied user and container revision dataset.
   * Every user of type local admin and organ will get containers.
   *
   * @param users - The dataset of users to base the pointsofsale dataset on.
   * @param containerRevisions - The dataset of container revisions to base
   * the pointsofsale dataset on.
   */
  public async seedPointsOfSale(
    users: User[],
    containerRevisions?: ContainerRevision[],
  ): Promise<{
      pointsOfSale: PointOfSale[],
      pointOfSaleRevisions: PointOfSaleRevision[],
      pointOfSaleUsers: User[],
    }> {
    const containerRevisions1 = containerRevisions ?? (await new ContainerSeeder().seedContainers(users)).containerRevisions;

    let pointsOfSale: PointOfSale[] = [];
    let pointOfSaleRevisions: PointOfSaleRevision[] = [];
    let pointOfSaleUsers: User[] = [];

    const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN].includes(u.type));

    const promises: Promise<any>[] = [];
    for (let i = 0; i < sellers.length; i += 1) {
      const { pointsOfSale: pos, pointOfSaleUsers: posUsers } = await this.definePointsOfSale(
        pointsOfSale.length,
        4,
        sellers[i],
      );
      let rev: PointOfSaleRevision[] = [];
      for (let o = 0; o < pos.length; o += 1) {
        pos[o].currentRevision = (pos[o].id % 3) + 1;
        rev = rev.concat(this.definePointOfSaleRevisions(
          pointOfSaleRevisions.length,
          pos[o].currentRevision,
          pos[o].currentRevision - 1,
          pos[o],
          containerRevisions1,
        ));
      }

      // Revisions can only be saved AFTER the containers themselves.
      promises.push(this.manager.save(PointOfSale, pos).then(() => this.manager.save(PointOfSaleRevision, rev)));

      pointsOfSale = pointsOfSale.concat(pos);
      pointOfSaleRevisions = pointOfSaleRevisions.concat(rev);
      pointOfSaleUsers = pointOfSaleUsers.concat(posUsers);
    }
    await Promise.all(promises);

    return { pointsOfSale, pointOfSaleRevisions, pointOfSaleUsers };
  }
}
