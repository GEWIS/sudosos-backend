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
import User, { UserType } from '../../src/entity/user/user';
import generateBalance from './test-helpers';

export class Builder {
  user: User;

  public async default() {
    const count = await User.count();
    this.user = Object.assign(new User(), {
      firstName: `User #${count + 1}`,
      lastName: `Doe #${count + 1}`,
      type: UserType.MEMBER,
      active: true,
    } as User);
    await User.save(this.user);
    return this;
  }

  public addBalance(amount: number) {
    generateBalance(amount, this.user.id);
    return this;
  }

  public inactive() {
    this.user.active = false;
    return this;
  }

  public get(): Promise<User> {
    return User.save(this.user as User);
  }

  public async clone(amount: number): Promise<User[]> {
    const users: any[] = [];

    const count = await User.count();

    for (let i = 1; i <= amount; i += 1) {
      const clone = {
        ...this.user,
        firstName: `User #${count + i}`,
        lastName: `Doe #${count + i}`,
        type: this.user.type ?? UserType.MEMBER,
      } as User;
      users.push(clone);
    }
    await User.save(users);
    return users;
  }
}

async function setInactive(users: User[]) {
  const promises: Promise<User>[] = [];
  users.forEach((u) => {
    const user = u;
    user.active = false;
    promises.push(User.save(user));
  });
  await Promise.all(promises);
}

export function UserFactory(custom?: User) {
  const builder = new Builder();
  if (custom) {
    builder.user = custom;
  } else {
    builder.default();
  }
  return builder;
}

export async function inUserContext(users: User[], func: (...arg: any) => void) {
  await func(...users);
  await setInactive(users);
}
