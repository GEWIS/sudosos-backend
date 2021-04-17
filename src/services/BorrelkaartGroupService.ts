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
import BorrelkaartGroupRequest from '../controller/request/borrelkaart-group-request';
import User from '../entity/user/user';

export default class BorrelkaartGroupService {
  /**
   * Verifies whether the banner request translates to a valid banner object
   * @param bkgr - The borrelkaart group request
   */
  // eslint-disable-next-line class-methods-use-this
  public static async verifyBorrelkaartGroup(bkgr: BorrelkaartGroupRequest): Promise<boolean> {
    const sDate = Date.parse(bkgr.activeStartDate);
    const eDate = Date.parse(bkgr.activeEndDate);

    const bkgrCheck: boolean = bkgr.name !== ''
      && !Number.isNaN(sDate)
      && !Number.isNaN(eDate)

      // end date connot be in the past
      && eDate > new Date().getTime()

      // end date must be later than start date
      && eDate > sDate

      // borrelkaart group must contain users
      && bkgr.users.length > 0;

    if (!bkgrCheck) {
      return false;
    }

    // check if distinct user id's
    const ids: number[] = [];
    for (let i = 0; i < bkgr.users.length; i += 1) {
      if (bkgr.users[i] && !ids.includes(bkgr.users[i].id)) {
        ids.push(bkgr.users[i].id);
      } else {
        return false;
      }
    }

    // check if all users in user database
    const users = await Promise.all(bkgr.users.map((user) => User.findOne(user.id)));
    return !users.includes(undefined);
  }
}
