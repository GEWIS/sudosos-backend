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
 *
 *  @license
 */

import WithManager from '../../src/database/with-manager';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import InvoiceUser from '../../src/entity/user/invoice-user';
import bcrypt from 'bcrypt';
import HashBasedAuthenticationMethod from '../../src/entity/authenticator/hash-based-authentication-method';
import MemberAuthenticator from '../../src/entity/authenticator/member-authenticator';

/**
 * Seeder for users and their login methods
 */
export default class UserSeeder extends WithManager {
  /**
   * Defines InvoiceUsers objects for the given Users
   * @param users - List of Invoice User type
   */
  private defineInvoiceUsers(users: User[]): InvoiceUser[] {
    const invoiceUsers: InvoiceUser[] = [];
    for (let nr = 0; nr < users.length; nr += 1) {
      invoiceUsers.push(Object.assign(new InvoiceUser(), {
        user: users[nr],
        automatic: nr % 2 > 0,
        street: `street ${nr}`,
        postalCode:`postalCode ${nr}`,
        city: `city ${nr}`,
        country: `country ${nr}`,
      }));
    }
    return invoiceUsers;
  }

  /**
   * Defines user objects with the given parameters.
   *
   * @param start - The number of users that already exist.
   * @param count - The number of objects to define.
   * @param type - The type of users to define.
   * @param active - Active state of the defined users.
   */
  public defineUsers(
    start: number,
    count: number,
    type: UserType,
    active: boolean,
  ): User[] {
    const users: User[] = [];
    for (let nr = 1; nr <= count; nr += 1) {
      users.push(Object.assign(new User(), {
        id: start + nr,
        firstName: `Firstname${start + nr}`,
        lastName: `Lastname${start + nr}`,
        nickname: nr % 4 === 0 ? `Nickname${start + nr}` : null,
        type,
        active,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      }) as User);
    }
    return users;
  }

  /**
   * Seeds a default dataset of users, and stores them in the database.
   */
  public async seed(): Promise<User[]> {
    const types: UserType[] = [
      UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN, UserType.INVOICE,
    ];
    let users: User[] = [];
    let invoiceUsers: InvoiceUser[] = [];

    const promises: Promise<any>[] = [];
    for (let i = 0; i < types.length; i += 1) {
      const uActive = this.defineUsers(users.length, 4, types[i], true);
      promises.push(this.manager.save(User, uActive));
      users = users.concat(uActive);

      const uInactive = this.defineUsers(users.length, 2, types[i], false);
      promises.push(this.manager.save(User, uInactive));
      users = users.concat(uInactive);

      if (types[i] === UserType.INVOICE) {
        invoiceUsers = invoiceUsers.concat(this.defineInvoiceUsers(uActive.concat(uInactive)));
      }
    }

    await Promise.all(promises);
    await this.manager.save(InvoiceUser, invoiceUsers);

    return users;
  }

  private BCRYPT_ROUNDS = 12;

  private async hashPassword(password: string, callback: (encrypted: string) => any) {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS).then(callback);
  }

  /**
   * Seeds a default set of pass users and stores them in the database.
   */
  public async seedHashAuthenticator<T extends HashBasedAuthenticationMethod>(
    users: User[],
    Type: { new(): T, save: (t: T) => Promise<T> },
    count = 10,
  ): Promise<T[]> {
    const authUsers: T[] = [];

    const promises: Promise<any>[] = [];
    const toMap: User[] = count >= users.length ? users : users.slice(count);
    await Promise.all(toMap.map((user) => this.hashPassword(user.id.toString(), (encrypted: any) => {
      const authUser = Object.assign(new Type(), {
        user,
        hash: encrypted,
      });
      promises.push(Type.save(authUser).then((u) => authUsers.push(u)));
    })));

    await Promise.all(promises);
    return authUsers;
  }

  /**
   * Seed some member authenticators
   * @param users Users that can authenticate as organs
   * @param authenticateAs
   */
  public async seedMemberAuthenticators(users: User[], authenticateAs: User[]): Promise<MemberAuthenticator[]> {
    const memberAuthenticators: MemberAuthenticator[] = [];
    await Promise.all(authenticateAs.map(async (as, i) => {
      return Promise.all(users.map(async (user, j) => {
        if ((i + j) % 7 > 1) return;
        const authenticator = Object.assign(new MemberAuthenticator(), {
          userId: user.id,
          authenticateAsId: as.id,
        } as MemberAuthenticator);
        await authenticator.save();
        memberAuthenticators.push(authenticator);
      }));
    }));
    return memberAuthenticators;
  }
}
