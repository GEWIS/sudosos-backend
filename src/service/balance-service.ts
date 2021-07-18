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
import { getManager } from 'typeorm';
import Balance from '../entity/transactions/balance';

export default class BalanceService {
  /**
   * Update the balance cache with active values
   * Note: insafe query! safety leveraged by typesafety
   */
  public static async updateBalances(ids?: number|number[]) {
    const entityManager = getManager();
    if (ids) {
      const idStr = typeof ids === 'number' ? `(${ids})` : `(${ids.join(',')})`;
      // eslint-disable-next-line prefer-template
      await entityManager.query('REPLACE INTO balance select id, sum(amount), max(stamp) from ( '
          + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
            + 'where t.fromId in ' + idStr
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.version and str2.productProduct=pr2.productId '
            + 'where st2.toId in ' + idStr
          + 'UNION ALL '
          + 'select t2.fromId as `id`, amount*-1 as `amount`, t2.updatedAt as `stamp` from transfer t2 where fromId in ' + idStr
          + 'UNION ALL '
          + 'select t2.toId as `id`, amount as `amount`, updatedAt as `stamp` from transfer t2 where toId in ' + idStr + ') as moneys '
        + 'group by moneys.id');
    } else {
      await entityManager.query('REPLACE INTO balance select id, sum(amount), max(stamp) from ( '
          + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.version and str2.productProduct=pr2.productId '
          + 'UNION ALL '
          + 'select t2.fromId as `id`, amount*-1 as `amount`, t2.updatedAt as `stamp` from transfer t2 where fromId is not NULL '
          + 'UNION ALL '
          + 'select t2.toId as `id`, amount as `amount`, updatedAt as `stamp` from transfer t2 where toId is not NULL) as moneys '
        + 'group by moneys.id');
    }
  }

  /**
   * Clear balance cache
   */
  public static async clearBalanceCache(ids?: number|number[]) {
    if (ids) {
      Balance.delete(ids);
    } else {
      const entityManager = getManager();
      await entityManager.query('DELETE from balance where 1=1;');
    }
  }

  /**
   * Get current balance of a user
   * @param id id of user to get balance of
   * @returns the current balance of a user
   */
  public static async getBalance(id: number): Promise<number> {
    const entityManager = getManager();
    const balanceArray = await entityManager.query('SELECT amount, updatedAt FROM balance where user_id=?', [id]);

    let balance: number = 0;
    let time: String = '1993-11-09 00:00'; // Random constant in the past

    if (balanceArray.length > 0) {
      time = balanceArray[0].updatedAt;
      balance += balanceArray[0].amount;
    }

    const laterTransactions = await entityManager.query('SELECT id, sum(amount) as amount from ( '
      + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
      + 'inner join sub_transaction st on t.id=st.transactionId '
      + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
      + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
      + 'where t.fromId = ? and str.updatedAt > ?'
      + 'UNION ALL '
      + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
      + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
      + 'inner join product_revision pr2 on str2.productRevision=pr2.version and str2.productProduct=pr2.productId '
      + 'where st2.toId = ? and str2.updatedAt > ? '
      + 'UNION ALL '
      + 'select t2.fromId as `id`, amount*-1 as `amount`, t2.updatedAt as `stamp` from transfer t2 where fromId=? and t2.updatedAt>? '
      + 'UNION ALL '
      + 'select t3.toId as `id`, amount as `amount`, updatedAt as `stamp` from transfer t3 where t3.toId=? and t3.updatedAt>?) as moneys ', [id, time, id, time, id, time, id, time]);

    if (laterTransactions.length > 0 && laterTransactions[0].amount) {
      balance += laterTransactions[0].amount;
    }

    return balance;
  }
}
