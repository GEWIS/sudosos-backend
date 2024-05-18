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

import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import Transfer from '../entity/transactions/transfer';
import User from '../entity/user/user';
import BalanceService from '../service/balance-service';

@EventSubscriber()
export default class TransferSubscriber implements EntitySubscriberInterface {
  listenTo(): Function | string {
    return Transfer;
  }

  async afterInsert(event: InsertEvent<Transfer>) {
    if (event.entity.toId == null) return;

    const user = await event.manager.findOne(User, { where: { id: event.entity.toId }, relations: ['currentFines'] });
    if (user.currentFines == null) return;

    const balance = await BalanceService.getBalance(user.id);

    // If the new transfer is not included in the balance calculation, add it manually
    let currentBalance = balance.amount.amount;
    if (balance.lastTransferId < event.entity.id) {
      currentBalance += event.entity.amount.getAmount();
    }

    // Remove currently unpaid fines when new balance is positive.
    if (currentBalance >= 0) {
      user.currentFines = null;
      await event.manager.save(user);
    }
  }
}
