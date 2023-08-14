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
import User from '../../src/entity/user/user';
import Transaction from '../../src/entity/transactions/transaction';
import Dinero, { DineroObject } from 'dinero.js';
import Transfer from '../../src/entity/transactions/transfer';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';


export async function addTransaction(
  newUser: User,
  pointOfSaleRevisions: PointOfSaleRevision[],
  receivedBalance: boolean,
  createdAt?: Date,
  minValue?: number,
): Promise<{
    transaction: Transaction,
    amount: DineroObject,
  }> {
  let from: User;
  let to: User;

  const pointOfSale = pointOfSaleRevisions
    .find((p) => p.containers.length > 0 && p.containers
      .find((c) => c.products.length > 0) !== undefined)!;
  const container = pointOfSale.containers
    .find((c) => c.products.length > 0)!;
  const product = container.products[0];

  if (receivedBalance) {
    from = product.product.owner;
    to = newUser;
  } else {
    to = product.product.owner;
    from = newUser;
  }
  const totalPriceInclVat = product.priceInclVat.toObject();
  let transaction = {
    from,
    createdBy: newUser,
    pointOfSale,
    createdAt: createdAt || undefined,
    updatedAt: createdAt || undefined,
    subTransactions: [
      {
        createdAt: createdAt || undefined,
        updatedAt: createdAt || undefined,
        to,
        container,
        subTransactionRows: [
          {
            createdAt: createdAt || undefined,
            updatedAt: createdAt || undefined,
            product,
            amount: minValue ? Math.ceil(minValue / product.priceInclVat.getAmount()) : 1,
          },
        ],
      },
    ],
  } as any as Transaction;
  transaction = await Transaction.save(transaction);
  return {
    transaction,
    amount: totalPriceInclVat,
  };
}

export async function addTransfer(
  newUser: User,
  users: User[],
  receivedBalance: boolean,
  createdAt?: Date,
  value: number = 1000,
): Promise<{
    transfer: Transfer,
    amount: DineroObject,
  }> {
  let from: User;
  let to: User;
  if (receivedBalance) {
    to = newUser;
    [from] = users;
  } else {
    from = newUser;
    [to] = users;
  }

  const amount: DineroObject = {
    amount: value,
    precision: 2,
    currency: 'EUR',
  };
  const transfer = Object.assign(new Transfer(), {
    createdAt,
    updatedAt: createdAt,
    amount: Dinero(amount),
    description: '',
    from,
    to,
  } as Transfer);
  await transfer.save();
  return {
    transfer,
    amount,
  };
}
