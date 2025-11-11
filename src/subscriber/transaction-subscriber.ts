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

/**
 * This is the module page of the transaction-subscriber.
 *
 * @module internal/subscribers/transaction-subscriber
 */

import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import Transaction from '../entity/transactions/transaction';
import User, { TransactionReceiptsOption, NotifyDebtUserTypes } from '../entity/user/user';
import BalanceService from '../service/balance-service';
import Mailer from '../mailer';
import UserDebtNotification from '../mailer/messages/user-debt-notification';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import log4js from 'log4js';
import TransactionService from '../service/transaction-service';
import { TransactionResponse } from '../controller/response/transaction-response';
import TransactionNotification from '../mailer/messages/transaction-notification';

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
    const balance = await new BalanceService().getBalance(user.id);
    const transaction = await new TransactionService().asTransactionResponse(entity);

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

    if (TransactionSubscriber.checkReceiptSending(user, entity)) {
      await new TransactionSubscriber().sendReceipt(user, transaction, currentBalance);
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

    Mailer.getInstance().send(user, new UserDebtNotification({
      balance: DineroTransformer.Instance.from(currentBalance),
      url: '',
    })).catch((e) => log4js.getLogger('Transaction').error(e));
  }

  async sendReceipt(user: User, transaction: TransactionResponse, balance: number) {
    Mailer.getInstance().send(user, new TransactionNotification({
      transaction: transaction,
      balance: DineroTransformer.Instance.from(balance),
    })).catch((e) => log4js.getLogger('Transaction').error(e));
  }

  private static checkReceiptSending(user: User, transaction: Transaction): boolean {
    return (user.transactionReceipts === TransactionReceiptsOption.ALWAYS) ||
      (transaction.createdBy.id !== user.id && user.transactionReceipts === TransactionReceiptsOption.CHARGEDBYOTHERS);
  }
}
