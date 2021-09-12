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

export interface BalanceParameters {
  ids: number[],
}
export default class BalanceService {
  /**
   * Update the balance cache with active values
   * Insafe Query! Safety leveraged by type safety
   */
  public static async updateBalances(params?: BalanceParameters) {
    const entityManager = getManager();
    const lastIds: any = await entityManager.query(`select max(\`transaction\`) as transactionMax, max(transfer) as transferMax from (
      select max(id) as "transaction", 0 as "transfer" from \`transaction\` 
      union select 0 as "transaction", max(id) as "transfer" from \`transfer\` 
    )`);
    const { transactionMax } = lastIds[0];
    const { transferMax } = lastIds[0];

    if (params && params.ids) {
      const idStr = `(${params.ids.join(',')})`;
      // eslint-disable-next-line prefer-template
      await entityManager.query(`REPLACE INTO balance select id, sum(amount), ${transactionMax}, ${transferMax} from ( `
          + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
            + `where t.id <= ? and t.fromId in ${idStr} `
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
            + `where st2.transactionId <= ? and st2.toId in ${idStr} `
          + 'UNION ALL '
          + `select t2.fromId as \`id\`, amount*-1 as \`amount\`, t2.updatedAt as \`stamp\` from transfer t2 where t2.id <= ? and fromId in ${idStr}`
          + 'UNION ALL '
          + `select t2.toId as \`id\`, amount as \`amount\`, updatedAt as \`stamp\` from transfer t2 where t2.id <= ? and toId in ${idStr}) as moneys `
        + 'group by moneys.id', [transactionMax, transactionMax, transferMax, transferMax]);
    } else {
      // eslint-disable-next-line prefer-template
      await entityManager.query(`REPLACE INTO balance select id, sum(amount), ${transactionMax}, ${transferMax} from ( `
          + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
            + 'where t.id <= ? '
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
            + 'where st2.transactionId <= ? '
          + 'UNION ALL '
          + 'select t2.fromId as `id`, amount*-1 as `amount`, t2.updatedAt as `stamp` from transfer t2 where t2.id <= ? and fromId is not NULL '
          + 'UNION ALL '
          + 'select t2.toId as `id`, amount as `amount`, updatedAt as `stamp` from transfer t2 where t2.id <= ? and toId is not NULL) as moneys '
        + 'group by moneys.id', [transactionMax, transactionMax]);
    }
  }

  /**
   * Clear balance cache
   */
  public static async clearBalanceCache(ids?: number | number[]) {
    if (ids) {
      await Balance.delete(ids);
    } else {
      const entityManager = getManager();
      await entityManager.query('DELETE from balance where 1=1;');
    }
  }

  /**
   * Get current balance of a user, if user does not exist balance is 0
   * @param id id of user to get balance of
   * @returns the current balance of a user
   */
  public static async getBalance(id: number): Promise<number> {
    const entityManager = getManager();
    const balanceArray = await entityManager.query('SELECT amount, lastTransaction, lastTransfer FROM balance where user_id = ?', [id]);

    let balance: number = 0;
    let lastTransaction: number = 0;
    let lastTransfer: number = 0;

    if (balanceArray.length > 0) {
      balance = balanceArray[0].amount;
      lastTransaction = balanceArray[0].lastTransaction;
      lastTransfer = balanceArray[0].lastTransfer;
    }

    const laterTransactions = await entityManager.query('SELECT id, sum(amount) as amount from ( '
      + 'select t.fromId as `id`, str.amount * pr.price * -1 as `amount`, str.updatedAt as `stamp` from `transaction` as `t` '
      + 'inner join sub_transaction st on t.id=st.transactionId '
      + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
      + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
      + 'where t.fromId = ? and t.id > ?'
      + 'UNION ALL '
      + 'select st2.toId as `id`, str2.amount * pr2.price as `amount`, str2.updatedAt as `stamp` from sub_transaction st2 '
      + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
      + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
      + 'where st2.toId = ? and st2.transactionId > ? '
      + 'UNION ALL '
      + 'select t2.fromId as `id`, amount*-1 as `amount`, t2.updatedAt as `stamp` from transfer t2 where fromId=? and t2.id > ? '
      + 'UNION ALL '
      + 'select t3.toId as `id`, amount as `amount`, updatedAt as `stamp` from transfer t3 where t3.toId=? and t3.id > ?) as moneys ', [id, lastTransaction, id, lastTransaction, id, lastTransfer, id, lastTransfer]);

    if (laterTransactions.length > 0 && laterTransactions[0].amount) {
      balance += laterTransactions[0].amount;
    }

    return balance;
  }

  /**
   * Get balances of all specified users or everyone if no parameters are given
   * USE ONLY IF LARGE PART OF BALANCES IS NEEDED, since call is quite inefficient
   * it triggers a full rebuild of the balances table and returns from there
   *
   * If user does not exist no entry is returned for that user
   *
   * @returns the balances of all (specified) users
   */
  public static async getAllBalances(params?: BalanceParameters): Promise<Map<number, number>> {
    await this.updateBalances(params);
    const entityManager = getManager();

    let balanceArray = [];
    if (params && params.ids) {
      const idStr = ',?'.repeat(params.ids.length * 2).substr(1);

      balanceArray = await entityManager.query(`select id, sum(amount) as 'amount' from (
        select id, 0 as 'amount' from user where id in (${idStr}) union 
        select user_id as id, amount as 'amount' from balance where id in (${idStr})
      ) group by id`, params.ids.concat(params.ids));
    } else {
      balanceArray = await entityManager.query(`select id, sum(amount) as 'amount' from (
        select id, 0 as 'amount' from user union 
        select user_id as id, amount as 'amount' from balance
      ) group by id`);
    }

    const balanceMap = balanceArray.reduce((map: Map<number, number>, obj: any) => {
      map.set(obj.id, obj.amount);
      return map;
    }, new Map());
    return balanceMap;
  }
}
