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

import User, { TermsOfServiceStatus, UserType } from '../../src/entity/user/user';
import generateBalance from './test-helpers';
import { DeleteResult } from 'typeorm';
import TokenHandler from '../../src/authentication/token-handler';
import DefaultRoles, { SELLER_ROLE } from '../../src/rbac/default-roles';
import Role from '../../src/entity/rbac/role';
import JsonWebToken from '../../src/authentication/json-web-token';

/**
 * Ensures production roles from DefaultRoles are loaded into the DB.
 * Always calls synchronize() since each test suite may use a fresh DB.
 */
export async function ensureProductionRoles(): Promise<void> {
  await DefaultRoles.synchronize();
}

/**
 * Get the production role names for a given UserType by querying
 * the synced system default roles in the DB.
 */
async function getProductionRoleNames(userType: UserType): Promise<string[]> {
  const roles = await Role.find({
    where: { systemDefault: true },
    relations: { roleUserTypes: true },
  });
  const roleNames = roles
    .filter((r) => r.roleUserTypes.some((rut) => rut.userType === userType))
    .map((r) => r.name);

  // Guard against unsynchronized default roles: an empty result likely means
  // ensureProductionRoles()/DefaultRoles.synchronize() has not been called.
  if (roleNames.length === 0) {
    throw new Error(
      `No production roles found for user type "${userType}". `
      + 'Have you called ensureProductionRoles() before creating tokens?',
    );
  }

  return roleNames;
}

/**
 * Build a JsonWebToken for a user using their production roles.
 */
export async function tokenFor(
  user: User, organs?: User[], posId?: number,
): Promise<JsonWebToken> {
  const roles = await getProductionRoleNames(user.type);
  if (organs && organs.length > 0 && !roles.includes(SELLER_ROLE)) {
    roles.push(SELLER_ROLE);
  }
  return { user, roles, organs, posId };
}

/**
 * Convenience: build and sign a token string in one call.
 */
export async function signTokenFor(
  user: User, tokenHandler: TokenHandler, nonce: string = 'nonce',
  organs?: User[], posId?: number,
): Promise<string> {
  const jwt = await tokenFor(user, organs, posId);
  return tokenHandler.signToken(jwt, nonce);
}

export class Builder {
  user: User;

  public async default() {
    const count = await User.count();
    this.user = await User.save( {
      firstName: `User #${count + 1}`,
      lastName: `Doe #${count + 1}`,
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
      canGoIntoDebt: true,
    });
    return this;
  }

  public async addBalance(amount: number) {
    await generateBalance(amount, this.user.id);
    return this;
  }

  public inactive() {
    this.user.active = false;
    return this;
  }

  public get(): Promise<User> {
    return User.save(this.user as User);
  }

  public delete(): Promise<DeleteResult> {
    return User.delete(this.user.id);
  }

  public async clone(amount: number): Promise<User[]> {
    const users: User[] = [];

    const count = await User.count();
    const user = this.user ?? (await this.default()).user;
    const promises: Promise<void>[] = [];

    for (let i = 1; i <= amount; i += 1) {
      promises.push(User.save(Object.assign(new User(), {
        ...user,
        firstName: `User #${count + i}`,
        lastName: `Doe #${count + i}`,
        email: `${count + i}@sudosos.nl`,
        type: user.type ?? UserType.MEMBER,
        id: count + i,
      })).then((u) => { users.push(u); }));
    }
    await Promise.all(promises);
    return users;
  }
}

export const ORGAN_USER = async () => {
  const count = await User.count();
  return Object.assign(new User(), {
    firstName: `Organ #${count + 1}`,
    lastName: `Doe #${count + 1}`,
    type: UserType.ORGAN,
    active: true,
    acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
  } as User);
};

export const ADMIN_USER = async () => {
  const count = await User.count();
  return Object.assign(new User(), {
    firstName: `Admin #${count + 1}`,
    lastName: `Doe #${count + 1}`,
    type: UserType.LOCAL_ADMIN,
    active: true,
    acceptedToS: TermsOfServiceStatus.ACCEPTED,
  } as User);
};

export const INVOICE_USER = async () => {
  const count = await User.count();
  return Object.assign(new User(), {
    firstName: `Invoice #${count + 1}`,
    lastName: `Doe #${count + 1}`,
    type: UserType.INVOICE,
    active: true,
    acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
  } as User);
};

export const INTEGRATION_USER = async () => {
  const count = await User.count();
  return Object.assign(new User(), {
    firstName: `Integration #${count + 1}`,
    lastName: `Doe #${count + 1}`,
    type: UserType.INTEGRATION,
    active: true,
    acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
  });
};

async function setInactive(users: User[]) {
  const promises: Promise<User>[] = [];
  users.forEach((u) => {
    const user = u;
    user.active = false;
    promises.push(User.save(user));
  });
  await Promise.all(promises);
}

export async function UserFactory(custom?: User) {
  const builder = new Builder();
  if (custom) {
    builder.user = custom;
  } else {
    await builder.default();
  }
  return builder;
}

export async function inUserContext(
  users: User[] | Promise<User[]>, func: (...arg: User[]) => Promise<void>,
) {
  const u = await users;
  await func(...u);
  await setInactive(u);
}
