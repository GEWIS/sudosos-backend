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

import WithManager from '../../../src/database/with-manager';
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
   * Handout fines for all eligible users on the given reference date. Reuse the given user fine groups if it exists
   * @param users
   * @param transactions
   * @param transfers
   * @param userFineGroups
   * @param firstReferenceDate
   */
  public async seedSingleFines(
    users: User[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
    userFineGroups: UserFineGroup[] = [],
    firstReferenceDate: Date = new Date(),
  ) {
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
   * Waive some of the fines: for each 2/5th group, waive half the total fines.
   * @param userFineGroups
   */
  public async seedWaivers(userFineGroups: UserFineGroup[]) {
    const transfers: Transfer[] = [];
    const newUserFineGroups: UserFineGroup[] = [];

    for (let i = 0; i < userFineGroups.length; i++) {
      const userFineGroup = userFineGroups[i];
      if (i % 5 !== 1) {
        newUserFineGroups.push(userFineGroup);
        continue;
      }

      const { user } = userFineGroup;
      let amountToWaive = userFineGroup.fines
        .reduce((total, f) => total.add(f.amount), dinero())
        .divide(2);

      const transfer = await this.manager.save(Transfer, {
        to: user,
        toId: user.id,
        amountInclVat: amountToWaive,
        description: 'Seeded waiver',
      });
      transfers.push(transfer);

      userFineGroup.waivedTransfer = transfer;
      await this.manager.save(UserFineGroup, userFineGroup);
      userFineGroups.push(userFineGroup);
    }

    return {
      waiveFineTransfers: transfers,
      userFineGroups: newUserFineGroups,
    };
  }

  /**
   * Add two fineHandoutEvents to the database, one on 2021-01-01 and the other at the current time.
   * @param users
   * @param transactions
   * @param transfers
   * @param addCurrentFines Whether the created fines should be linked to the user, meaning these
   * fines are marked as "unpaid"
   * @param waiveFines Whether some of the fines should be waived
   */
  public async seed(users: User[], transactions: Transaction[], transfers: Transfer[], addCurrentFines = false, waiveFines = false) {
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    // Make a copy of users, so we can update currentFines
    let newUsers = users;


    const {
      fines: fines1,
      fineTransfers: fineTransfers1,
      userFineGroups: userFineGroups1,
      fineHandoutEvent: fineHandoutEvent1,
    } = await this.seedSingleFines(users, transactions, subTransactions, transfers, [], new Date('2021-01-01'));

    const {
      fines: fines2,
      fineTransfers: fineTransfers2,
      userFineGroups: userFineGroups2,
      fineHandoutEvent: fineHandoutEvent2,
    } = await this.seedSingleFines(users, transactions, subTransactions, [...transfers, ...fineTransfers1], userFineGroups1);

    // Remove duplicates
    let userFineGroups = [...userFineGroups1, ...userFineGroups2]
      .filter((g, i, groups) => groups.findIndex((g2) => g2.id === g.id) === i);
    const fines = [...fines1, ...fines2];

    // Add also a reference to the fine in the UserFineGroup
    fines.forEach((f) => {
      const i = userFineGroups.findIndex((g) => g.id === f.userFineGroup.id);
      if (userFineGroups[i].fines === undefined) userFineGroups[i].fines = [];
      userFineGroups[i].fines.push(f);
    });

    // Optionally waive some of the fines
    let waiveTransfers: Transfer[] = [];
    if (waiveFines) {
      const result = await this.seedWaivers(userFineGroups);
      waiveTransfers = result.waiveFineTransfers;
      userFineGroups = result.userFineGroups;
    }

    const fineTransfers = [...fineTransfers1, ...fineTransfers2, ...waiveTransfers];

    if (addCurrentFines) {
      newUsers = [];
      for (let user of users) {
        const userFineGroup = userFineGroups.find((g) => user.id === g.userId);
        const currentBalance = calculateBalance(user, transactions, subTransactions, [...transfers, ...fineTransfers]);
        if (userFineGroup && currentBalance.amount.getAmount() < 0) {
          user.currentFines = userFineGroup;
          await this.manager.save(User, user);
        }
        newUsers.push(user);
      }
    }

    return {
      fines,
      fineTransfers,
      userFineGroups,
      fineHandoutEvents: [fineHandoutEvent1, fineHandoutEvent2],
      users: newUsers,
    };
  }
}
