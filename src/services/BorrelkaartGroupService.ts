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
import { FindManyOptions, Raw } from 'typeorm';
import BorrelkaartGroupRequest from '../controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../controller/response/borrelkaart-group-response';
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import User from '../entity/user/user';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';

export default class BorrelkaartGroupService {
  /**
   * Verifies whether the borrelkaart group request translates to a valid object
   * @param {BorrelkaartGroupRequest.model} bkgReq - The borrelkaart group request
   * @returns {boolean} - Whether the borrelkaart group is ok
   */
  // eslint-disable-next-line class-methods-use-this
  public static async verifyBorrelkaartGroup(bkgReq: BorrelkaartGroupRequest): Promise<boolean> {
    const sDate = Date.parse(bkgReq.activeStartDate);
    const eDate = Date.parse(bkgReq.activeEndDate);

    const bkgReqCheck: boolean = bkgReq.name !== ''
      && !Number.isNaN(sDate)
      && !Number.isNaN(eDate)

      // end date connot be in the past
      && eDate > new Date().getTime()

      // end date must be later than start date
      && eDate > sDate

      // borrelkaart group must contain users
      && bkgReq.users.length > 0;

    if (!bkgReqCheck) {
      return false;
    }

    // check if distinct user id's
    const ids: number[] = [];
    for (let i = 0; i < bkgReq.users.length; i += 1) {
      if (bkgReq.users[i] && !ids.includes(bkgReq.users[i].id)) {
        ids.push(bkgReq.users[i].id);
      } else {
        return false;
      }
    }

    // check if all users in user database
    const users = await User.find({ id: Raw((userId) => `${userId} IN (:...ids)`, { ids }) });
    console.log('db users');
    console.log(users);
    return ids.length === users.length;
  }

  /**
   * Verifies whether the borrelkaart group request holds user conflicts
   * @param {BorrelkaartGroupRequest.model} bkgReq - The borrelkaart group request
   * @param {number} ignoreGroup - Ignore users in this group when updating a borrelkaart group
   * @returns {boolean} - Whether the borrelkaart group is ok
   */
  public static async checkUserConflicts(
    bkgReq: BorrelkaartGroupRequest, ignoreGroup?: number,
  ): Promise<boolean> {
    // all conflicting borrelkaart groups related to requested users
    const conflictingEntries = await UserBorrelkaartGroup.find({
      relations: ['borrelkaartGroup'],
      where: {
        user: Raw((id) => `${id} IN (:...ids)`, { ids: bkgReq.users.map((user) => user.id) }),
      },
    });

    // return value
    let ret = conflictingEntries.length === 0;

    // check if users are only in the patched borrelkaart group
    if (ignoreGroup && !ret) {
      ret = !conflictingEntries.some((entry) => entry.borrelkaartGroup.id !== ignoreGroup);
    }

    return ret;
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
   * @param {BorrelkaartGroup.model} bkg - borrelkaart group
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
   * @param {FindManyOptions.model} options - find options
   * @returns {Array<BorrelkaartGroupResponse>} - borrelkaart groups without users
   */
  public static async getAllBorrelkaartGroups(options?: FindManyOptions):
  Promise<BorrelkaartGroupResponse[]> {
    const bkgs = await BorrelkaartGroup.find({ ...options });
    return bkgs.map((bkg) => this.asBorrelkaartGroupResponse(bkg, null));
  }

  /**
   * Saves a borrelkaart group and its user relations to the database
   * @param {BorrelkaartGroupRequest.model} bkgReq - borrelkaart group request
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
   * @param {string} id - requested borrelkaart group id
   * @returns {BorrelkaartGroupResponse.model} - requested borrelkaart group
   */
  public static async getBorrelkaartGroupById(id: string): Promise<BorrelkaartGroupResponse> {
    // find requested borrelkaart group
    const bkg = await BorrelkaartGroup.findOne(id);
    if (!bkg) {
      return undefined;
    }

    // get users related to the borrelkaart group
    const users = (await UserBorrelkaartGroup.find({
      relations: ['user'],
      where: { borrelkaartGroup: bkg },
    })).map((ubkg) => ubkg.user);

    return this.asBorrelkaartGroupResponse(bkg, users);
  }

  /**
   * Updates a borrelkaart group and its user relations in the database
   * @param {string} id - requested borrelkaart group id
   * @param {BorrelkaartGroupRequest.model} bkgReq - new borrelkaart group request
   * @returns {BorrelkaartGroupResponse.model} - updated borrelkaart group
   */
  public static async updateBorrelkaartGroup(id: string, bkgReq: BorrelkaartGroupRequest):
  Promise<BorrelkaartGroupResponse> {
    // create update borrelkaart group
    // patch users to borrelkaart group
    // return created borrelkaart group with users
    return null;
  }

  /**
   * Deletes a borrelkaart group and its user relations in the database
   * @param {string} id - requested borrelkaart group id
   * @returns {BorrelkaartGroupResponse.model} - deleted borrelkaart group
   */
  public static async deleteBorrelkaartGroup(id: string):
  Promise<BorrelkaartGroupResponse> {
    // get borrelkaart group to return
    const bkgRes = await this.getBorrelkaartGroupById(id);

    // delete borrelkaart group

    // remove users
    // return deleted borrelkaart group
    return bkgRes;
  }
}
