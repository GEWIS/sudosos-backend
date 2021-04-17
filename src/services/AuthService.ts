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
import { Request } from 'express';
import { RequestWithToken } from '../middleware/token-middleware';
import User, { UserType } from '../entity/user/user';
import AuthenticationMockRequest from '../controller/request/authentication-mock-request';

export default class AuthService {
  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public static async isAdmin(req: RequestWithToken): Promise<boolean> {
    // TODO: check whether user is admin
    return req.token.user.type === UserType.LOCAL_ADMIN;
  }

  /**
   * Validates that the request is authorized by the policy.
   * @param req - The incoming request.
   */
  // eslint-disable-next-line class-methods-use-this
  public static async canPerformMock(req: Request): Promise<boolean> {
    const body = req.body as AuthenticationMockRequest;

    // Only allow in development setups
    if (process.env.NODE_ENV !== 'development') return false;

    // Check the existence of the user
    const user = await User.findOne({ id: body.userId });
    if (!user) return false;

    return true;
  }
}
