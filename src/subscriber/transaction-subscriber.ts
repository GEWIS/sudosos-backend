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

/**
 * This is the module page of the transaction-subscriber.
 *
 * @module internal/subscribers/transaction-subscriber
 */

import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import Transaction from '../entity/transactions/transaction';
import User, { NotifyDebtUserTypes } from '../entity/user/user';
import BalanceService from '../service/balance-service';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { NotificationTypes } from '../notifications/notification-types';
import Notifier, { UserDebtNotificationOptions } from '../notifications';
import log4js from 'log4js';
import TransactionService from '../service/transaction-service';
import { TransactionResponse } from '../controller/response/transaction-response';
import { TransactionNotificationOptions } from '../notifications/notification-options';

@EventSubscriber()
export default class TransactionSubscriber implements EntitySubscriberInterface {
  listenTo(): Function | string {
    return Transaction;
  }

  async afterInsert(event: InsertEvent<Transaction>): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    let { entity } = event;
    if (entity.subTransactions == null
      || (entity.subTransactions.length > 0 && entity.subTransactions[0].subTransactionRows == null)
      || (entity.subTransactions.length > 0 && entity.subTransactions[0].subTransactionRows.length > 0 && entity.subTransactions[0].subTransactionRows[0].product == null)) {
      entity = await event.manager.findOne(Transaction, {
        where: { id: entity.id },
        relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.product'],
      });
    }

    const user = await event.manager.findOne(User, { where: { id: entity.from.id } });
    if (!user) {
      log4js.getLogger('Transaction').error(`User not found for transaction ${entity.id}`);
      return;
    }

    const balance = await new BalanceService().getBalance(user.id);

    let currentBalance = balance.amount.amount;
    if (balance.lastTransactionId < event.entity.id) {
      // Check if subTransactions exists, is not empty, and subTransactionRows exists and is not empty
      if (
        entity.subTransactions?.length > 0 &&
        entity.subTransactions[0].subTransactionRows?.length > 0
      ) {
        for (const subTrans of entity.subTransactions) {
          for (const subTransRow of subTrans.subTransactionRows) {
            // Ensure the amount and product.priceInclVat.getAmount() exist before performing the calculation
            if (
              subTransRow.amount &&
              typeof subTransRow.product?.priceInclVat?.getAmount === 'function'
            ) {
              currentBalance -=
                subTransRow.amount *
                subTransRow.product.priceInclVat.getAmount();
            }
          }
        }
      }
    }

    const transaction = await new TransactionService().asTransactionResponse(entity);
    if (transaction) {
      await this.sendReceipt(user, transaction, currentBalance);
    }

    if (currentBalance >= 0) return;
    // User is now in debt

    const balanceBefore = await new BalanceService().getBalance(
      user.id,
      new Date(entity.createdAt.getTime() - 1),
    );

    if (balanceBefore.amount.amount < 0) return;
    // User was not in debt before this new transaction

    if (!NotifyDebtUserTypes.includes(user.type)) return;

    // User should be notified of debt
    try {
      await Notifier.getInstance().notify({
        type: NotificationTypes.UserDebtNotification,
        userId: user.id,
        params: new UserDebtNotificationOptions(
          '',
          DineroTransformer.Instance.from(currentBalance),
        ),
      });
    } catch (e) {
      log4js.getLogger('Transaction').error(e);
    }
  }

  private async sendReceipt(user: User, transaction: TransactionResponse, balance: number) {
    try {
      const type = TransactionSubscriber.checkOwnTransaction(transaction)
        ? NotificationTypes.TransactionNotificationSelf
        : NotificationTypes.TransactionNotificationChargedByOther;

      await Notifier.getInstance().notify({
        type,
        userId: user.id,
        params: new TransactionNotificationOptions(
          transaction,
          DineroTransformer.Instance.from(balance),
        ),
      });
    } catch (e) {
      // "No channel found" is expected when user doesn't have notification enabled
      if (e instanceof Error && e.message === 'No channel found to send for.') {
        return;
      }
      log4js.getLogger('Transaction').error(e);
    }
  }


  private static checkOwnTransaction(transaction: TransactionResponse): boolean {
    return  transaction.from.id === transaction.createdBy.id;
  }
}
