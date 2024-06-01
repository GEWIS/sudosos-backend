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

import User from '../../src/entity/user/user';
import Transaction from '../../src/entity/transactions/transaction';
import SubTransaction from '../../src/entity/transactions/sub-transaction';
import Transfer from '../../src/entity/transactions/transfer';
import Balance from '../../src/entity/transactions/balance';
import SubTransactionRow from '../../src/entity/transactions/sub-transaction-row';
import DineroTransformer from '../../src/entity/transformer/dinero-transformer';

export function calculateBalance(user: User, transactions: Transaction[], subTransactions: SubTransaction[], transfers: Transfer[], date?: Date): Balance {
  let transactionsOutgoing = transactions.filter((t) => t.from.id === user.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (date) {
    transactionsOutgoing = transactionsOutgoing
      .filter((t) => t.createdAt.getTime() <= date.getTime());
  }
  let transactionsIncoming = subTransactions.filter((s) => s.to.id === user.id)
    .sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime())
    .map((s) => s.transaction);
  if (date) {
    transactionsIncoming = transactionsIncoming
      .filter((t) => t.createdAt.getTime() <= date.getTime());
  }
  let transfersOutgoing = transfers.filter((t) => t.from && t.from.id === user.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (date) {
    transfersOutgoing = transfersOutgoing
      .filter((t) => t.createdAt.getTime() <= date.getTime());
  }
  let transfersIncoming = transfers.filter((t) => t.to && t.to.id === user.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (date) {
    transfersIncoming = transfersIncoming
      .filter((t) => t.createdAt.getTime() <= date.getTime());
  }

  const valueTransactionsOutgoing: number = Array.prototype
    .concat(...Array.prototype.concat(...transactionsOutgoing
      .map((t) => t.subTransactions
        .map((s) => s.subTransactionRows))))
    .reduce((prev: number, curr: SubTransactionRow) => (
      prev - (curr.amount * curr.product.priceInclVat.getAmount())
    ), 0);
  const valueTransactionsIncoming: number = Array.prototype
    .concat(...Array.prototype.concat(...transactionsIncoming
      .map((t) => t.subTransactions
        .map((s) => s.subTransactionRows))))
    .reduce((prev: number, curr: SubTransactionRow) => (
      prev + (curr.amount * curr.product.priceInclVat.getAmount())
    ), 0);
  const valueTransfersOutgoing = transfersOutgoing
    .reduce((prev, curr) => prev - curr.amount.getAmount(), 0);
  const valueTransfersIncoming = transfersIncoming
    .reduce((prev, curr) => prev + curr.amount.getAmount(), 0);

  // Calculate the user's personal last transaction/transfer
  let lastTransaction: Transaction;
  const allTransactions = transactionsIncoming.concat(transactionsOutgoing)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (allTransactions.length > 0) {
    // eslint-disable-next-line prefer-destructuring
    lastTransaction = allTransactions
      .filter((t) => t.createdAt.getTime() === allTransactions[0].createdAt.getTime())
      .sort((a, b) => b.id - a.id)[0];
  }
  let lastTransfer: Transfer;
  const allTransfers = transfersIncoming.concat(transfersOutgoing)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (allTransfers.length > 0) {
    // eslint-disable-next-line prefer-destructuring
    lastTransfer = allTransfers
      .filter((t) => t.createdAt.getTime() === allTransfers[0].createdAt.getTime())
      .sort((a, b) => b.id - a.id)[0];
  }

  return {
    user,
    lastTransaction,
    lastTransfer,
    amount: DineroTransformer.Instance.from(valueTransactionsOutgoing + valueTransactionsIncoming
      + valueTransfersOutgoing + valueTransfersIncoming),
  } as Balance;
}

export function calculateFine(balance: number): number {
  // Fine is 20%, rounded down to whole euros with a maximum of 5 euros.
  return Math.max(0, Math.min(Math.floor(balance * -0.2 / 100), 5) * 100);
}
