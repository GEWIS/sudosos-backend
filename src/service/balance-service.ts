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
import { getConnection, getManager } from 'typeorm';
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
    const { transactionMax, transferMax } = lastIds[0];

    if (params && params.ids) {
      const idStr = `(${params.ids.join(',')})`;
      // eslint-disable-next-line prefer-template
      await entityManager.query(`REPLACE INTO balance select id, sum(amount), ${transactionMax}, ${transferMax} from ( `
          + 'select t.fromId as `id`, str.amount * pr.priceInclVat * -1 as `amount` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
            + `where t.id <= ? and t.fromId in ${idStr} `
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `amount` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
            + `where st2.transactionId <= ? and st2.toId in ${idStr} `
          + 'UNION ALL '
          + `select t2.fromId as \`id\`, amount*-1 as \`amount\` from transfer t2 where t2.id <= ? and fromId in ${idStr}`
          + 'UNION ALL '
          + `select t2.toId as \`id\`, amount as \`amount\` from transfer t2 where t2.id <= ? and toId in ${idStr}) as moneys `
        + 'group by moneys.id', [transactionMax, transactionMax, transferMax, transferMax]);
    } else {
      // eslint-disable-next-line prefer-template
      await entityManager.query(`REPLACE INTO balance select id, sum(amount), ${transactionMax}, ${transferMax} from ( `
          + 'select t.fromId as `id`, str.amount * pr.priceInclVat * -1 as `amount` from `transaction` as `t` '
            + 'inner join sub_transaction st on t.id=st.transactionId '
            + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
            + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
            + 'where t.id <= ? '
          + 'UNION ALL '
          + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `amount` from sub_transaction st2 '
            + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
            + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
            + 'where st2.transactionId <= ? '
          + 'UNION ALL '
          + 'select t2.fromId as `id`, amount*-1 as `amount` from transfer t2 where t2.id <= ? and fromId is not NULL '
          + 'UNION ALL '
          + 'select t3.toId as `id`, amount as `amount` from transfer t3 where t3.id <= ? and toId is not NULL) as moneys '
        + 'group by moneys.id', [transactionMax, transactionMax, transferMax, transferMax]);
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
    const connection = getConnection();

    const laterTransactions = await connection.query('SELECT moneys2.id as id, '
      + 'moneys2.totalValue + COALESCE(b5.amount, 0) as amount, '
      + 'moneys2.count as count, '
      + 'b5.lastTransaction as lastTransaction, '
      + 'b5.lastTransfer as lastTransfer, '
      + 'b5.amount as cachedAmount '
      + 'from ( '
      + 'SELECT COALESCE(moneys.id, ?) as id, '
      + 'COALESCE(sum(moneys.totalValue), 0) as totalValue, '
      + 'count(moneys.totalValue) as count '
      + 'from ( '
      + 'select t.fromId as `id`, str.amount * pr.priceInclVat * -1 as `totalValue` from `transaction` as `t` '
      + 'left join balance b1 on t.fromId=b1.user_id '
      + 'inner join sub_transaction st on t.id=st.transactionId '
      + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
      + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
      + 'where t.fromId = ? and t.id > COALESCE(b1.lastTransaction, 0) '
      + 'UNION ALL '
      + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `totalValue` from sub_transaction st2 '
      + 'left join balance b2 on st2.toId=b2.user_id '
      + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
      + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
      + 'where st2.toId = ? and st2.transactionId > COALESCE(b2.lastTransaction, 0) '
      + 'UNION ALL '
      + 'select t2.fromId as `id`, t2.amount*-1 as `totalValue` from transfer t2 '
      + 'left join balance b3 on t2.fromId=b3.user_id '
      + 'where fromId = ? and t2.id > COALESCE(b3.lastTransfer, 0) '
      + 'UNION ALL '
      + 'select t3.toId as `id`, t3.amount as `totalValue` from transfer t3 '
      + 'left join balance b4 on t3.toId=b4.user_id '
      + 'where t3.toId = ? and t3.id > COALESCE(b4.lastTransfer, 0) '
      + ') as moneys '
      + ') as moneys2 '
      + 'left join balance b5 on b5.user_id=moneys2.id', [id, id, id, id, id]);

    if (laterTransactions.length > 0 && laterTransactions[0].amount) {
      return laterTransactions[0].amount;
    }

    return 0;
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
