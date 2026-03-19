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

import WithManager from '../../src/database/with-manager';
import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import MemberUser from '../../src/entity/user/member-user';
import InvoiceUser from '../../src/entity/user/invoice-user';
import bcrypt from 'bcrypt';
import HashBasedAuthenticationMethod from '../../src/entity/authenticator/hash-based-authentication-method';
import OrganMembership from '../../src/entity/organ/organ-membership';
import LocalAuthenticator from '../../src/entity/authenticator/local-authenticator';
import PinAuthenticator from '../../src/entity/authenticator/pin-authenticator';

export interface DevUsers {
  admin: User;
  user: User;
  alice: User;
  bob: User;
  organ: User;
  invoice: User;
}

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
        inactiveNotificationSend: nr % 3 === 0,
        extensiveDataProcessing: true,
        email: type === UserType.LOCAL_USER || type === UserType.LOCAL_ADMIN ? `user${start + nr}@example.com` : '',
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
   * Creates a fixed set of named dev users with authenticators.
   * Used by cli/dev-seed.ts for local development.
   */
  public async init(): Promise<DevUsers> {
    const BCRYPT_ROUNDS = 4;

    const [admin, user, alice, bob, organ, invoice] = await this.manager.save(User, [
      Object.assign(new User(), {
        firstName: 'Admin',
        lastName: 'SudoSOS',
        email: 'admin@sudosos.nl',
        type: UserType.LOCAL_ADMIN,
        active: true,
        ofAge: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        extensiveDataProcessing: true,
      }),
      Object.assign(new User(), {
        firstName: 'Local',
        lastName: 'User',
        email: 'user@sudosos.nl',
        type: UserType.LOCAL_USER,
        active: true,
        ofAge: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        extensiveDataProcessing: true,
      }),
      Object.assign(new User(), {
        firstName: 'Alice',
        lastName: 'Member',
        email: 'alice@gewis.nl',
        type: UserType.MEMBER,
        active: true,
        ofAge: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        extensiveDataProcessing: true,
      }),
      Object.assign(new User(), {
        firstName: 'Bob',
        lastName: 'Member',
        email: 'bob@gewis.nl',
        type: UserType.MEMBER,
        active: true,
        ofAge: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
        extensiveDataProcessing: true,
      }),
      Object.assign(new User(), {
        firstName: 'Organ',
        lastName: '',
        email: '',
        type: UserType.ORGAN,
        active: true,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      }),
      Object.assign(new User(), {
        firstName: 'Invoice',
        lastName: 'Company',
        email: 'invoices@company.nl',
        type: UserType.INVOICE,
        active: true,
        acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
      }),
    ]);

    // Hash-based auth for local users (4 bcrypt rounds for fast dev seeding)
    await Promise.all([
      this.manager.save(LocalAuthenticator, Object.assign(new LocalAuthenticator(), {
        user: admin,
        hash: await bcrypt.hash('admin', BCRYPT_ROUNDS),
      })),
      this.manager.save(LocalAuthenticator, Object.assign(new LocalAuthenticator(), {
        user,
        hash: await bcrypt.hash('user', BCRYPT_ROUNDS),
      })),
      this.manager.save(PinAuthenticator, Object.assign(new PinAuthenticator(), {
        user: admin,
        hash: await bcrypt.hash('0000', BCRYPT_ROUNDS),
      })),
      this.manager.save(PinAuthenticator, Object.assign(new PinAuthenticator(), {
        user,
        hash: await bcrypt.hash('1111', BCRYPT_ROUNDS),
      })),
      this.manager.save(PinAuthenticator, Object.assign(new PinAuthenticator(), {
        user: alice,
        hash: await bcrypt.hash('1234', BCRYPT_ROUNDS),
      })),
      this.manager.save(PinAuthenticator, Object.assign(new PinAuthenticator(), {
        user: bob,
        hash: await bcrypt.hash('5678', BCRYPT_ROUNDS),
      })),
    ]);

    // Organ memberships: alice and bob are members of organ
    await this.manager.save(OrganMembership, [
      Object.assign(new OrganMembership(), { userId: alice.id, organId: organ.id, index: 0 }),
      Object.assign(new OrganMembership(), { userId: bob.id, organId: organ.id, index: 1 }),
    ]);

    // Invoice billing address for invoice user
    await this.manager.save(InvoiceUser, Object.assign(new InvoiceUser(), {
      user: invoice,
      automatic: false,
      street: 'Placeholder Street 1',
      postalCode: '0000 AA',
      city: 'Placeholder City',
      country: 'Netherlands',
    }));

    return { admin, user, alice, bob, organ, invoice };
  }

  public async seedMemberAuthenticators(users: User[], organs: User[]): Promise<OrganMembership[]> {
    const memberAuthenticators: OrganMembership[] = [];
    
    await Promise.all(organs.map(async (organ, i) => {
      let index = 0;
      return Promise.all(users.map(async (user, j) => {
        if ((i + j) % 7 > 1) return;
        
        const authenticator = Object.assign(new OrganMembership(), {
          userId: user.id,
          organId: organ.id,
          index: index++,
        } as OrganMembership);
        await authenticator.save();
        memberAuthenticators.push(authenticator);
      }));
    }));
    return memberAuthenticators;
  }
}

/**
 * Seeds a default dataset of Member Users, and stores them in the database.
 * @param users - Array of users to create member user entries for
 * @returns Array of created member users
 */
export async function seedMemberUsers(users: User[]): Promise<MemberUser[]> {
  const promises: Promise<MemberUser>[] = users.map((user, i) => {
    const memberUser = Object.assign(new MemberUser(), {
      user,
      memberId: 1000 + i,
    });
    return MemberUser.save(memberUser);
  });

  const memberUsers = await Promise.all(promises);
  return memberUsers;
}
