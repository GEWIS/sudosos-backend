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
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import { calculateBalance } from '../../helpers/balance';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';
import dinero from 'dinero.js';
import Fine from '../../../src/entity/fine/fine';

export default class FineSeeder extends WithManager {
  /**
   * Handout fines for all eligible users on the given reference date. Reuse the given user fine groups if
   * @param users
   * @param transactions
   * @param transfers
   * @param userFineGroups
   * @param firstReferenceDate
   */
  public async seedSingleFines(users: User[], transactions: Transaction[], transfers: Transfer[], userFineGroups: UserFineGroup[] = [], firstReferenceDate: Date = new Date()) {
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));
    // Get all users that are in debt and should get fined
    const debtors = users.filter((u) =>
      calculateBalance(u, transactions, subTransactions, transfers, firstReferenceDate).amount.getAmount() < 500);

    // Create a map from users to userFineGroups and initialize it with the existing userFineGroups
    const userFineGroupMap = new Map<User, UserFineGroup>();
    userFineGroups.forEach((g) => userFineGroupMap.set(g.user, g));

    let i = 0;

    const fineHandoutEvent = await this.manager.save(FineHandoutEvent, {
      referenceDate: firstReferenceDate,
    });

    const fineTransfers: Transfer[] = [];
    const fines = await Promise.all(debtors.map(async (u) => {
      i++;
      if (i % 2 === 0) return;

      let userFineGroup = userFineGroupMap.get(u);
      if (userFineGroup === undefined) {
        userFineGroup = await this.manager.save(UserFineGroup, {
          user: u,
          userId: u.id,
        });
        userFineGroupMap.set(u, userFineGroup);
      }

      // Fine everyone 5 euros
      const amountInclVat = dinero({ amount: 500 });
      const transfer = await this.manager.save(Transfer, {
        from: u,
        fromId: u.id,
        amountInclVat,
        description: 'Seeded fine',
      });
      const fine = await this.manager.save(Fine, {
        fineHandoutEvent,
        userFineGroup,
        transfer,
        amount: amountInclVat,
      });
      transfer.fine = fine;
      fineTransfers.push(transfer);
      return fine;
    }));

    return {
      fines: fines.filter((f) => f !== undefined),
      fineTransfers,
      fineHandoutEvent,
      userFineGroups: Array.from(userFineGroupMap.values()),
    };
  }

  /**
   * Add two fineHandoutEvents to the database, one on 2021-01-01 and the other at the current time.
   * @param users
   * @param transactions
   * @param transfers
   * @param addCurrentFines
   */
  public async seedFines(users: User[], transactions: Transaction[], transfers: Transfer[], addCurrentFines = false) {
    // Make a copy of users, so we can update currentFines
    let newUsers = users;

    const {
      fines: fines1,
      fineTransfers: fineTransfers1,
      userFineGroups: userFineGroups1,
      fineHandoutEvent: fineHandoutEvent1,
    } = await this.seedSingleFines(users, transactions, transfers, [], new Date('2021-01-01'));

    const {
      fines: fines2,
      fineTransfers: fineTransfers2,
      userFineGroups: userFineGroups2,
      fineHandoutEvent: fineHandoutEvent2,
    } = await this.seedSingleFines(users, transactions, [...transfers, ...fineTransfers1], userFineGroups1);

    // Remove duplicates
    const userFineGroups = [...userFineGroups1, ...userFineGroups2]
      .filter((g, i, groups) => groups.findIndex((g2) => g2.id === g.id) === i);
    const fines = [...fines1, ...fines2];

    // Add also a reference to the fine in the UserFineGroup
    fines.forEach((f) => {
      const i = userFineGroups.findIndex((g) => g.id === f.userFineGroup.id);
      if (userFineGroups[i].fines === undefined) userFineGroups[i].fines = [];
      userFineGroups[i].fines.push(f);
    });

    if (addCurrentFines) {
      newUsers = await Promise.all(users.map(async (user) => {
        const userFineGroup = userFineGroups.find((g) => user.id === g.userId);
        if (userFineGroup) {
          user.currentFines = userFineGroup;
          await this.manager.save(user);
        }
        return user;
      }));
    }

    return {
      fines,
      fineTransfers: [...fineTransfers1, ...fineTransfers2],
      userFineGroups,
      fineHandoutEvents: [fineHandoutEvent1, fineHandoutEvent2],
      users: newUsers,
    };
  }
}
