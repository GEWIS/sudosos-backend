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
import { FindManyOptions } from 'typeorm';
import BorrelkaartGroupRequest from '../controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../controller/response/borrelkaart-group-response';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import User from '../entity/user/user';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';

export default class BorrelkaartGroupService {
  /**
   * Verifies whether the borrelkaart group request translates to a valid object
   * @param {BorrelkaartGroupRequest.model} bkgr - The borrelkaart group request
   * @returns {boolean} - whether the borrelkaart group is ok
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

  /**
   * Creates a borrelkaart group from the request
   * @param {BorrelkaartGroupRequest.model} bkgReq - borrelkaart group request
   * @returns {BorrelkaartGroup.model} - a borrelkaart group entity created with the request
   */
  public static asBorrelkaartGroup(bkgReq: BorrelkaartGroupRequest): BorrelkaartGroup {
    if (!bkgReq) {
      return undefined;
    }
    return {
      name: bkgReq.name,
      activeStartDate: new Date(bkgReq.activeStartDate),
      activeEndDate: new Date(bkgReq.activeEndDate),
    } as BorrelkaartGroup;
  }

  /**
   * Creates a borrelkaart group from the request
   * @param {BorrelkaartGroup.model} bkgReq - borrelkaart group
   * @param {Array<User>} users - users in the borrelkaart group
   * @returns {BorrelkaartGroupResponse.model} - a borrelkaart group response
   */
  public static asBorrelkaartGroupResponse(bkg: BorrelkaartGroup, users: User[]):
  BorrelkaartGroupResponse {
    if (!bkg) {
      return undefined;
    }
    return {
      ...bkg,
      createdAt: bkg.createdAt.toISOString(),
      updatedAt: bkg.updatedAt.toISOString(),
      activeStartDate: bkg.activeStartDate.toISOString(),
      activeEndDate: bkg.activeEndDate.toISOString(),
      users,
    } as BorrelkaartGroupResponse;
  }

  /**
   * Returns all borrelkaart groups without users
   * @param options - find options
   * @returns {Array<BorrelkaartGroupResponse>} - borrelkaart groups without users
   */
  public static async getAllBorrelkaartGroups(options?: FindManyOptions):
  Promise<BorrelkaartGroupResponse[]> {
    const bkgs = await BorrelkaartGroup.find({ ...options });
    return bkgs.map((bkg) => this.asBorrelkaartGroupResponse(bkg, null));
  }

  /**
   * Saves a borrelkaart group and its user relations to the database
   * @param bkgReq - borrelkaart group request
   * @returns {BorrelkaartGroupResponse.model} - saved borrelkaart group
   */
  public static async createBorrelkaartGroup(bkgReq: BorrelkaartGroupRequest):
  Promise<BorrelkaartGroupResponse> {
    // save the borrelkaart group
    const bkg = this.asBorrelkaartGroup(bkgReq);
    await BorrelkaartGroup.save(bkg);

    // get the users to link to the borrelkaart group
    const users = await Promise.all(bkgReq.users.map((user) => User.findOne(user.id)));

    // create and save user borrelkaart group links
    const userLinks = users
      .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));
    await UserBorrelkaartGroup.save(userLinks);

    // return borrelkaart group response with posted borrelkaart group
    return this.asBorrelkaartGroupResponse(bkg, users);
  }

  /**
   * Returns a borrelkaart group with given id
   * @param id - requested borrelkaart group id
   * @returns {BorrelkaartGroupResponse.model} - requested borrelkaart group
   */
  public static async getBorrelkaartGroupById(id: number): Promise<BorrelkaartGroupResponse> {
    // find requested borrelkaart group
    const bkg = await BorrelkaartGroup.findOne(id);
    if (!bkg) {
      return undefined;
    }

    // get users related to the borrelkaart group
    const userBorrelkaartGroups = await UserBorrelkaartGroup.find({
      relations: ['user'],
      where: { borrelkaartGroup: bkg },
    });
    const users = userBorrelkaartGroups.map((ubkg) => ubkg.user);

    return this.asBorrelkaartGroupResponse(bkg, users);
  }
}
