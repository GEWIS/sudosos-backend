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
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import Transaction from '../entity/transactions/transaction';
import User from '../entity/user/user';
import BalanceService from '../service/balance-service';
import Mailer from '../mailer';
import UserDebtNotification from '../mailer/templates/notifications/user-debt-notification';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { getLogger } from 'log4js';
import NotificationPreference from '../entity/notifications/notification-preference';

@EventSubscriber()
export default class TransactionSubscriber implements EntitySubscriberInterface {
  listenTo(): Function | string {
    return Transaction;
  }

  async afterInsert(event: InsertEvent<Transaction>): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    // Collect entity info
    let { entity } = event;
    if (entity.subTransactions == null
      || (entity.subTransactions.length > 0 && entity.subTransactions[0].subTransactionRows == null)
      || (entity.subTransactions.length > 0 && entity.subTransactions[0].subTransactionRows.length > 0 && entity.subTransactions[0].subTransactionRows[0].product == null)) {
      entity = await event.manager.findOne(Transaction, {
        where: { id: entity.id },
        relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.product'],
      });
    }

    await this.handleDebtor(event, entity);
  }

  async handleNotification(event: InsertEvent<Transaction>, entity: Transaction) {
    const user = await event.manager.findOne(User, { where: { id: entity.from.id } });
    const preference = await NotificationPreference.findOne({ where: { user: user.id, type: 'Transaction' } });

    // No notifications
    if (!preference) return;

    switch (preference.method) {
      case "Email":

    }
  }

  /**
   * Handles fines and e-mailing of (new) debtors.
   */
  async handleDebtor(event: InsertEvent<Transaction>, entity: Transaction) {
    const user = await event.manager.findOne(User, { where: { id: entity.from.id } });
    const balance = await BalanceService.getBalance(user.id);

    let currentBalance = balance.amount.amount;
    if (balance.lastTransactionId < event.entity.id) {
      currentBalance -= entity.subTransactions[0].subTransactionRows[0].amount * entity.subTransactions[0].subTransactionRows[0].product.priceInclVat.getAmount();
    }

    if (currentBalance >= 0) return;
    // User is now in debt

    const balanceBefore = await BalanceService.getBalance(
      user.id,
      new Date(entity.createdAt.getTime() - 1),
    );

    if (balanceBefore.amount.amount < 0) return;
    // User was not in debt before this new transaction

    Mailer.getInstance().send(user, new UserDebtNotification({
      name: user.firstName,
      balance: DineroTransformer.Instance.from(currentBalance),
      url: '',
    })).catch((e) => getLogger('Transaction').error(e));
  }
}
