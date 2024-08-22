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
import Transaction from '../../src/entity/transactions/transaction';
import Transfer from '../../src/entity/transactions/transfer';
import SellerPayout from '../../src/entity/transactions/payout/seller-payout';
import User, { UserType } from '../../src/entity/user/user';
import { calculateBalance } from '../helpers/balance';
import SubTransaction from '../../src/entity/transactions/sub-transaction';


export async function seedSellerPayouts(
  users: User[],
  transactions: Transaction[],
  subTransactions: SubTransaction[],
  transfers: Transfer[],
): Promise<{ sellerPayouts: SellerPayout[], transfers: Transfer[] }> {
  const organs = users.filter((u) => u.type === UserType.ORGAN);

  const sellerPayouts: SellerPayout[] = [];
  for (let i = 0; i < organs.length; i++) {
    if (i % 3 !== 1) continue;

    const organ = organs[i];
    const balance = calculateBalance(organ, transactions, subTransactions, transfers);
    if (balance.amount.getAmount() <= 0) continue;

    // Get the greatest end date
    const endDate = balance.lastTransaction?.createdAt && balance.lastTransfer?.createdAt
      ? (balance.lastTransaction.createdAt > balance.lastTransfer.createdAt
        ? balance.lastTransaction.createdAt
        : balance.lastTransfer.createdAt)
      : (balance.lastTransaction?.createdAt || balance.lastTransfer?.createdAt);

    const transfer = await Transfer.save({
      from: organ,
      amountInclVat: balance.amount,
    });
    const sellerPayout = await SellerPayout.save({
      createdAt: endDate,
      requestedBy: organ,
      transfer,
      amount: balance.amount,
      startDate: new Date(0),
      endDate,
      reference: '',
    });
    sellerPayouts.push(sellerPayout);
  }

  return { sellerPayouts, transfers: sellerPayouts.map((s) => s.transfer) };
}
