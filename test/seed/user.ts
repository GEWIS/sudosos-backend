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
import WithManager from '../../src/with-manager';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import InvoiceUser from '../../src/entity/user/invoice-user';

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
  public async seedUsers(): Promise<User[]> {
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
}
