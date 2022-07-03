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
import BalanceResponse from '../controller/response/balance-response';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { dateToUTC, toMySQLString } from '../helpers/timestamps';

export interface BalanceParameters {
  ids?: number[],
}

export default class BalanceService {
  protected static asBalanceResponse(rawBalance: any): BalanceResponse {
    return {
      id: rawBalance.id,
      amount: DineroTransformer.Instance.from(rawBalance.amount).toObject(),
      lastTransactionId: rawBalance.lastTransactionId,
      lastTransferId: rawBalance.lastTransferId,
    };
  }

  protected static addWhereClauseForIds(
    query: string, parameters: any[], column: string, ids?: number[],
  ) {
    if (ids !== undefined) {
      // eslint-disable-next-line no-param-reassign
      query += `AND ${column} IN ( ${(new Array(ids.length)).fill('?').toString()} ) `;
      parameters.push(...ids);
    }
    return query;
  }

  /**
   * Update the balance cache with active values
   * Insafe Query! Safety leveraged by type safety
   */
  public static async updateBalances(params: BalanceParameters) {
    const entityManager = getManager();

    const parameters: any[] = [];

    // eslint-disable-next-line prefer-template
    let query = 'REPLACE INTO balance '
      + "select datetime('now'), datetime('now'), 1, moneys2.id, max(moneys2.amount), max(t1.id), max(t2.id) from ("
        + 'select id, sum(amount) as `amount`, max(createdAt1) as `createdAt1`, max(createdAt2) as `createdAt2` from ( '
        + 'select t1.fromId as `id`, str.amount * pr.priceInclVat * -1 as `amount`, t1.createdAt as `createdAt1`, null as `createdAt2` from `transaction` as `t1` '
          + 'left join `sub_transaction` st on t1.id=st.transactionId '
          + 'left join `sub_transaction_row` str on st.id=str.subTransactionId '
          + 'left join `product_revision` pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
          + 'where 1 ';
    query = this.addWhereClauseForIds(query, parameters, 't1.fromId', params.ids);
    query += 'UNION ALL '
        + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `amount`, t1.createdAt as `createdAt1`, null as `createdAt2` from sub_transaction st2 '
          + 'inner join `transaction` t1 on t1.id=st2.transactionId '
          + 'left join `sub_transaction_row` str2 on st2.id=str2.subTransactionId '
          + 'left join `product_revision` pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
          + 'where 1 ';
    query = this.addWhereClauseForIds(query, parameters, 'st2.toId', params.ids);
    query += 'UNION ALL '
        + 'select t2.fromId as `id`, amount*-1 as `amount`, null as `createdAt1`, t2.createdAt as `createdAt2` from `transfer` t2 where t2.fromId is not null ';
    query = this.addWhereClauseForIds(query, parameters, 'fromId', params.ids);
    query += 'UNION ALL '
        + 'select t2.toId as `id`, amount as `amount`, null as `createdAt1`, t2.createdAt as `createdAt2` from `transfer` t2 where t2.toId is not null ';
    query = this.addWhereClauseForIds(query, parameters, 'toId', params.ids);
    query += ') as moneys '
        + 'group by moneys.id '
      + ') as moneys2 '
      + 'left join ( '
      + 'select t.id, t.fromId, t.createdAt, st.toId from `transaction` t left join `sub_transaction` st on t.id = st.transactionId '
      + ') as t1 on (t1.createdAt = moneys2.createdAt1 and (t1.fromId = moneys2.id OR t1.toId = moneys2.id)) '
      + 'left join `transfer` t2 on (t2.createdAt = moneys2.createdAt2 and (t2.fromId = moneys2.id OR t2.toId = moneys2.id)) '
      + 'group by moneys2.id ';
    await entityManager.query(query, parameters);
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
   * Get balance of users with given IDs
   * @param ids ids of users to get balance of
   * @param date date at which the "balance snapshot" should be taken
   * @returns the current balance of a user
   */
  public static async getBalances(ids?: number[], date?: Date): Promise<BalanceResponse[]> {
    const connection = getConnection();

    const parameters: any[] = [];
    const d = date ? toMySQLString(dateToUTC(date)) : undefined;

    const balanceSubquery = () => {
      let result = '( '
      + 'SELECT b.userId as userId, b.amount as amount, t1.createdAt as lastTransactionDate, t2.createdAt as lastTransferDate '
      + 'from balance b '
      + 'left join `transaction` t1 on b.lastTransactionId=t1.id '
      + 'left join `transfer` t2 on b.lastTransferId=t2.id ';
      if (d !== undefined) {
        result += 'where t1.createdAt > ? AND t2.createdAt > ? ';
        parameters.push(...[d, d]);
      }
      result += ') ';
      return result;
    };

    let query = 'SELECT moneys2.id as id, '
      + 'moneys2.totalValue + COALESCE(b5.amount, 0) as amount, '
      + 'moneys2.count as count, '
      + 'b5.lastTransactionId as lastTransactionId, '
      + 'b5.lastTransferId as lastTransferId, '
      + 'b5.amount as cachedAmount '
      + 'from ( '
      + 'SELECT user.id as id, '
      + 'COALESCE(sum(moneys.totalValue), 0) as totalValue, '
      + 'count(moneys.totalValue) as count '
      + 'from user '
      + 'left join ( '
      + 'select t.fromId as `id`, str.amount * pr.priceInclVat * -1 as `totalValue` '
      + 'from `transaction` as `t` '
      + `left join ${balanceSubquery()} as b on t.fromId=b.userId `
      + 'inner join sub_transaction st on t.id=st.transactionId '
      + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
      + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProduct=pr.productId '
      + 'where t.createdAt > COALESCE(b.lastTransactionDate, 0) ';
    query = this.addWhereClauseForIds(query, parameters, 't.fromId', ids);
    query += 'UNION ALL '
      + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `totalValue` from sub_transaction st2 '
      + `left join ${balanceSubquery()} b on st2.toId=b.userId `
      + 'inner join `transaction` t on t.id=st2.transactionId '
      + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
      + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProduct=pr2.productId '
      + 'where t.createdAt > COALESCE(b.lastTransactionDate, 0) ';
    query = this.addWhereClauseForIds(query, parameters, 'st2.toId', ids);
    query += 'UNION ALL '
      + 'select t2.fromId as `id`, t2.amount*-1 as `totalValue` from transfer t2 '
      + `left join ${balanceSubquery()} b on t2.fromId=b.userId `
      + 'where t2.createdAt > COALESCE(b.lastTransferDate, 0) ';
    query = this.addWhereClauseForIds(query, parameters, 't2.fromId', ids);
    query += 'UNION ALL '
      + 'select t3.toId as `id`, t3.amount as `totalValue` from transfer t3 '
      + `left join ${balanceSubquery()} b on t3.toId=b.userId `
      + 'where t3.createdAt > COALESCE(b.lastTransferDate, 0) ';
    query = this.addWhereClauseForIds(query, parameters, 't3.toId', ids);
    query += ') as moneys on moneys.id=user.id '
      + 'where 1 ';
    query = this.addWhereClauseForIds(query, parameters, 'user.id', ids);
    query += 'group by user.id '
      + ') as moneys2 '
      + 'left join ( '
      + 'select b.userId, b.amount, b.lastTransactionId, b.lastTransferId '
      + 'from balance b '
      + 'left join `transaction` t1 on b.lastTransactionId=t1.id '
      + 'left join `transfer` t2 on b.lastTransferId=t2.id ';
    if (date !== undefined) {
      query += 'where t1.createdAt <= ? AND t2.createdAt <= ? ';
      parameters.push(...[d, d]);
    }
    query += ') AS b5 ON b5.userId=moneys2.id';

    const balances = await connection.query(query, parameters);

    if (balances.length === 0 && balances[0].amount === undefined) {
      throw new Error('No balance returned');
    }
    return balances.map((b: object) => this.asBalanceResponse(b));
  }

  /**
   * Get balance for single user
   * @param id ID of user
   */
  public static async getBalance(id: number): Promise<BalanceResponse> {
    return (await this.getBalances([id]))[0];
  }
}
