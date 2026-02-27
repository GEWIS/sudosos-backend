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
 * This is the module page of balance-service.
 *
 * @module balance
 */

import Balance from '../entity/transactions/balance';
import BalanceResponse, {
  PaginatedBalanceResponse,
  TotalBalanceResponse,
  UserTypeTotalBalanceResponse,
} from '../controller/response/balance-response';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { toMySQLString } from '../helpers/timestamps';
import { Dinero } from 'dinero.js';
import { OrderingDirection } from '../helpers/ordering';
import { defaultPagination, PaginationParameters } from '../helpers/pagination';
import { UserType } from '../entity/user/user';
import WithManager from '../database/with-manager';
import { DineroObjectResponse } from '../controller/response/dinero-response';

export enum BalanceOrderColumn {
  ID = 'id',
  AMOUNT = 'amount',
  FINEAMOUNT = 'fine',
  FINESINCE = 'fineSince',
}

export interface UpdateBalanceParameters {
  ids?: number[],
}

export interface GetBalanceParameters extends UpdateBalanceParameters {
  date?: Date;
  minBalance?: Dinero;
  maxBalance?: Dinero;
  hasFine?: boolean;
  minFine?: Dinero;
  maxFine?: Dinero;
  userTypes?: UserType[];
  orderBy?: BalanceOrderColumn;
  orderDirection?: OrderingDirection;
  allowDeleted?: boolean;
  inactive?: boolean;
}



/**
 * Converts the input to an VatDeclarationPeriod
 * @param input - The input which should be converted.
 * @returns VatDeclarationPeriod - The parsed VatDeclarationPeriod.
 * @throws TypeError - If the input is not a valid VatDeclarationPeriod
 */
export function asBalanceOrderColumn(input: any): BalanceOrderColumn | undefined {
  if (!input) return undefined;
  if (!Object.values(BalanceOrderColumn).includes(input)) {
    throw new TypeError(`Input '${input}' is not a valid BalanceOrderColumn.`);
  }
  return input;
}

export default class BalanceService extends WithManager {
  /**
   * Parse the given SQL date to a ISO date. This custom conversion is necessary, because
   * SQLite returns timestamps in UTC, while MariaDB/MySQL returns timestamps in the local timezone.
   * @param rawDate
   * @private
   */
  private static sqlTimeToISOTime(rawDate: any): string | null {
    let date = null;
    if (rawDate) {
      const dateSinceUtc = process.env.TYPEORM_CONNECTION === 'sqlite' ? rawDate + 'Z' : rawDate;
      date = new Date(dateSinceUtc).toISOString();
    }
    return date;
  }

  private static asBalanceResponse(rawBalance: any, date: Date): BalanceResponse {
    let fineSince = this.sqlTimeToISOTime(rawBalance.fineSince);
    let lastTransactionDate = this.sqlTimeToISOTime(rawBalance.lastTransactionDate);

    return {
      id: rawBalance.id,
      firstName: rawBalance.firstName,
      lastName: rawBalance.lastName,
      nickname: rawBalance.nickname,
      type: rawBalance.type,
      date: date.toISOString(),
      amount: DineroTransformer.Instance.from(rawBalance.amount).toObject(),
      lastTransactionId: rawBalance.lastTransactionId,
      lastTransactionDate,
      lastTransferId: rawBalance.lastTransferId,
      fine: rawBalance.fine ? DineroTransformer.Instance.from(rawBalance.fine).toObject() : null,
      fineSince,
      fineWaived: rawBalance.fine && rawBalance.fineWaived
        ? DineroTransformer.Instance.from(rawBalance.fineWaived).toObject() : null,
      nrFines: Number(rawBalance.nrFines) ?? 0,
      memberId: rawBalance.memberId ?? null,
    };
  }

  private static addWhereClauseForIds(
    query: string, parameters: any[], column: string, ids?: number[],
  ) {
    if (ids !== undefined) {
      // eslint-disable-next-line no-param-reassign
      query += `AND ${column} IN ( ${(new Array(ids.length)).fill('?').toString()} ) `;
      parameters.push(...ids);
    }
    return query;
  }

  private static addWhereClauseForDate(
    query: string, parameters: any[], column: string, date?: string,
  ) {
    if (date !== undefined) {
      // eslint-disable-next-line no-param-reassign
      query += `AND ${column} <= ? `;
      parameters.push(date);
    }
    return query;
  }

  /**
   * Update the balance cache with active values
   * Insafe Query! Safety leveraged by type safety
   */
  public async updateBalances(params: UpdateBalanceParameters) {
    const entityManager = this.manager;

    const parameters: any[] = [];

    // eslint-disable-next-line prefer-template
    let query = 'REPLACE INTO balance '
      + 'select '
      + (process.env.TYPEORM_CONNECTION === 'sqlite' ? "datetime('now'), " : 'NOW(), ')
      + (process.env.TYPEORM_CONNECTION === 'sqlite' ? "datetime('now'), " : 'NOW(), ')
      + '1, '
      + 'moneys2.id, '
      + 'max(moneys2.amount), '
      + 'max(t1.id), '
      + 'max(t2.id) from ('
        + 'select id, sum(amount) as `amount`, max(createdAt1) as `createdAt1`, max(createdAt2) as `createdAt2` from ( '
        + 'select t1.fromId as `id`, str.amount * pr.priceInclVat * -1 as `amount`, t1.createdAt as `createdAt1`, null as `createdAt2` from `transaction` as `t1` '
          + 'left join `sub_transaction` st on t1.id=st.transactionId '
          + 'left join `sub_transaction_row` str on st.id=str.subTransactionId '
          + 'left join `product_revision` pr on str.productRevision=pr.revision and str.productProductId=pr.productId '
          + 'where 1 ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 't1.fromId', params.ids);
    query += 'UNION ALL '
        + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `amount`, t1.createdAt as `createdAt1`, null as `createdAt2` from sub_transaction st2 '
          + 'inner join `transaction` t1 on t1.id=st2.transactionId '
          + 'left join `sub_transaction_row` str2 on st2.id=str2.subTransactionId '
          + 'left join `product_revision` pr2 on str2.productRevision=pr2.revision and str2.productProductId=pr2.productId '
          + 'where 1 ';
    query =  BalanceService.addWhereClauseForIds(query, parameters, 'st2.toId', params.ids);
    query += 'UNION ALL '
        + 'select t2.fromId as `id`, amountInclVat*-1 as `amount`, null as `createdAt1`, t2.createdAt as `createdAt2` from `transfer` t2 where t2.fromId is not null ';
    query =  BalanceService.addWhereClauseForIds(query, parameters, 'fromId', params.ids);
    query += 'UNION ALL '
        + 'select t2.toId as `id`, amountInclVat as `amount`, null as `createdAt1`, t2.createdAt as `createdAt2` from `transfer` t2 where t2.toId is not null ';
    query =  BalanceService.addWhereClauseForIds(query, parameters, 'toId', params.ids);
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
  public async clearBalanceCache(ids?: number | number[]) {
    if (ids) {
      await Balance.delete(ids);
    } else {
      const entityManager = this.manager;
      await entityManager.query('DELETE from balance where 1=1;');
    }
  }

  /**
   * Get balance of users with given IDs
   * @param ids ids of users to get balance of
   * @param date date at which the "balance snapshot" should be taken
   * @param minBalance return only balances which are at least this amount
   * @param maxBalance return only balances which are at most this amount
   * @param hasFine return only balances which do (not) have a fine
   * @param minFine return only balances which have at least this fine
   * @param maxFine return only balances which have at most this fine
   * @param userTypes array of types of users
   * @param orderDirection column to order result at
   * @param orderBy order direction
   * @param allowDeleted allow balances of deleted users to be returned
   * @param inactive only return inactive users
   * @param pagination pagination options
   * @returns the current balance of a user
   */
  public async getBalances({
    ids, date, minBalance, maxBalance, hasFine, minFine, maxFine, userTypes, orderDirection, orderBy, allowDeleted, inactive,
  }: GetBalanceParameters, pagination: PaginationParameters = {}): Promise<PaginatedBalanceResponse> {
    // Return the empty response if request has no ids.
    if (ids?.length === 0) {
      const { take, skip } = pagination;
      return {
        _pagination: { take, skip, count: 0 },
        records: [],
      };
    }

    const connection = this.manager.connection;

    const parameters: any[] = [];
    const d = date ? toMySQLString(date) : undefined;

    const balanceSubquery = () => {
      let result = '( '
      + 'SELECT b.userId as userId, b.amount as amount, t1.createdAt as lastTransactionDate, t2.createdAt as lastTransferDate '
      + 'from balance b '
      + 'left join `transaction` t1 on b.lastTransactionId=t1.id '
      + 'left join `transfer` t2 on b.lastTransferId=t2.id ';
      if (d !== undefined) {
        result += 'where t1.createdAt <= ? AND t2.createdAt <= ? ';
        parameters.push(...[d, d]);
      }
      result += ') ';
      return result;
    };

    const greatest = process.env.TYPEORM_CONNECTION === 'sqlite' ? 'max' : 'greatest';

    let query = 'SELECT userBalance.id as id, '
      + 'userBalance.firstName as firstName, '
      + 'userBalance.lastName as lastName, '
      + 'userBalance.nickname as nickname, '
      + 'userBalance.type as type, '
      + 'userBalance.amount as amount, '
      + 'userBalance.count as count, '
      + 'userBalance.lastTransactionId as lastTransactionId, '
      + 'userBalance.lastTransferId as lastTransferId, '
      + 'userBalance.cachedAmount as cachedAmount, '
      + 'lt.createdAt as lastTransactionDate, '
      + 'f.fine as fine, '
      + 'f.fineSince as fineSince, '
      + 'f.fineWaived as fineWaived, '
      + 'f.nrFines as nrFines, '
      + 'mu.memberId as memberId '
      + 'from ( '
        + 'SELECT moneys2.id as id, '
        + 'moneys2.firstName as firstName, '
        + 'moneys2.lastName as lastName, '
        + 'moneys2.nickname as nickname, '
        + 'moneys2.type as type, '
        + 'moneys2.totalValue + COALESCE(b5.amount, 0) as amount, '
        + 'moneys2.count as count, '
        + `${greatest}(coalesce(b5.lasttransactionid, -1), coalesce(moneys2.lastTransactionId, -1)) as lastTransactionId, `
        + `${greatest}(coalesce(b5.lasttransferid, -1), coalesce(moneys2.lastTransferId, -1)) as lastTransferId, `
        + 'b5.amount as cachedAmount '
        + 'from ( '
        + 'SELECT user.id as id, '
        + 'user.firstName as firstName, '
        + 'user.lastName as lastName, '
        + 'user.nickname as nickname, '
        + 'user.type as type, '
        + 'COALESCE(sum(moneys.totalValue), 0) as totalValue, '
        + 'count(moneys.totalValue) as count, '
        + 'max(moneys.transactionId) as lastTransactionId, '
        + 'max(moneys.transferId) as lastTransferId '
        + 'from user '
        + 'left join ( '
        + 'select t.fromId as `id`, str.amount * pr.priceInclVat * -1 as `totalValue`, t.id as `transactionId`, null as `transferId` '
        + 'from `transaction` as `t` '
        + `left join ${balanceSubquery()} as b on t.fromId=b.userId `
        + 'inner join sub_transaction st on t.id=st.transactionId '
        + 'inner join sub_transaction_row str on st.id=str.subTransactionId '
        + 'inner join product_revision pr on str.productRevision=pr.revision and str.productProductId=pr.productId '
        + 'where t.createdAt > COALESCE(b.lastTransactionDate, 0) ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 't.fromId', ids);
    query = BalanceService.addWhereClauseForDate(query, parameters, 't.createdAt', d);
    query += 'UNION ALL '
        + 'select st2.toId as `id`, str2.amount * pr2.priceInclVat as `totalValue`, t.id as `transactionId`, null as `transferId` from sub_transaction st2 '
        + `left join ${balanceSubquery()} b on st2.toId=b.userId `
        + 'inner join `transaction` t on t.id=st2.transactionId '
        + 'inner join sub_transaction_row str2 on st2.id=str2.subTransactionId '
        + 'inner join product_revision pr2 on str2.productRevision=pr2.revision and str2.productProductId=pr2.productId '
        + 'where t.createdAt > COALESCE(b.lastTransactionDate, 0) ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 'st2.toId', ids);
    query = BalanceService.addWhereClauseForDate(query, parameters, 't.createdAt', d);
    query += 'UNION ALL '
        + 'select t2.fromId as `id`, t2.amountInclVat*-1 as `totalValue`, null as `transactionId`, t2.id as `transferId` from transfer t2 '
        + `left join ${balanceSubquery()} b on t2.fromId=b.userId `
        + 'where t2.createdAt > COALESCE(b.lastTransferDate, 0) ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 't2.fromId', ids);
    query = BalanceService.addWhereClauseForDate(query, parameters, 't2.createdAt', d);
    query += 'UNION ALL '
        + 'select t3.toId as `id`, t3.amountInclVat as `totalValue`, null as `transactionId`, t3.id as `transferId` from transfer t3 '
        + `left join ${balanceSubquery()} b on t3.toId=b.userId `
        + 'where t3.createdAt > COALESCE(b.lastTransferDate, 0) ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 't3.toId', ids);
    query = BalanceService.addWhereClauseForDate(query, parameters, 't3.createdAt', d);
    query += ') as moneys on moneys.id=user.id '
        + 'where 1 ';
    query = BalanceService.addWhereClauseForIds(query, parameters, 'user.id', ids);
    query += 'group by user.id '
        + ') as moneys2 '
        + 'left join ( '
        + 'select b.userId, b.amount, b.lastTransactionId, b.lastTransferId '
        + 'from balance b '
        + 'left join `transaction` t1 on b.lastTransactionId = t1.id '
        + 'left join `transfer` t2 on b.lastTransferId = t2.id ';
    if (date !== undefined) {
      query += 'where t1.createdAt <= ? AND t2.createdAt <= ? ';
      parameters.push(...[d, d]);
    }
    query += ') AS b5 ON b5.userId=moneys2.id '
      + ') as userBalance '
      + 'inner join `user` as u on u.id = userBalance.id '
      + 'left join `transaction` as lt on lt.id = userBalance.lastTransactionId '
      + 'left join ( '
        + 'select sum(fine.amount) as fine, max(user_fine_group.createdAt) as fineSince, max(transfer.amountInclVat) as fineWaived, count(fine.id) as nrFines, user.id as id '
        + 'from fine '
        + 'inner join `user_fine_group` on fine.userFineGroupId = user_fine_group.id '
        + 'inner join `user` on user_fine_group.userId = user.id '
        + 'left join `transfer` on user_fine_group.waivedTransferId = transfer.id '
        + 'where user.currentFinesId = user_fine_group.id '
        + 'group by user.id '
      + ') as f on f.id = userBalance.id '
      + 'left join `member_user` mu on mu.userId = userBalance.id '
      + `where u.type not in ("${UserType.POINT_OF_SALE}") `;

    if (minBalance !== undefined) query += `and userBalance.amount >= ${minBalance.getAmount()} `;
    if (maxBalance !== undefined) query += `and userBalance.amount <= ${maxBalance.getAmount()} `;
    if (hasFine === false) query += 'and f.fine is null ';
    if (hasFine === true) query += 'and f.fine is not null ';
    if (minFine !== undefined) query += `and f.fine >= ${minFine.getAmount()} `;
    if (maxFine !== undefined) query += `and f.fine <= ${maxFine.getAmount()} `;
    if (userTypes !== undefined) query += `and u.type in (${userTypes.map((t) => `"${t}"`).join(',')}) `;
    if (!allowDeleted) query += 'and u.deleted = 0 ';
    if (inactive) query += 'and u.active = 0 ';

    if (orderBy !== undefined) query += `order by ${orderBy} ${orderDirection ?? ''} `;

    const take = pagination.skip || pagination.take ? pagination.take || defaultPagination() : pagination.take;
    const skip = pagination.skip;

    let recordsQuery = `${query}`;
    if (take) recordsQuery += `limit ${take} `;
    if (skip) recordsQuery += `offset ${skip} `;

    const balances = await connection.query(recordsQuery, parameters);
    if (balances.length > 0 && balances[0].amount === undefined) {
      throw new Error('No balance returned');
    }
    const count = (await connection.query(query, parameters)).length;


    return {
      _pagination: { take, skip, count },
      records: balances.map((b: object) => BalanceService.asBalanceResponse(b, date ?? new Date())),
    };
  }

  /**
   * Get balance for single user
   * @param id ID of user
   * @param date Date to calculate balance for
   */
  public async getBalance(id: number, date?: Date): Promise<BalanceResponse> {
    return (await this.getBalances({ ids: [id], allowDeleted: true, date })).records[0];
  }

  /**
   * Get the total balance of SudoSOS and
   * @param date Date to check the balances for
   * @param allowDeleted allow balances of deleted users to be returned
   */
  public async calculateTotalBalances(date: Date, allowDeleted?: boolean): Promise<TotalBalanceResponse> {
    const posBalanceRes = (await this.getBalances(
      { date, minBalance: DineroTransformer.Instance.from(0), allowDeleted })).records;
    const negBalanceRes = (await this.getBalances(
      { date, maxBalance: DineroTransformer.Instance.from(0), allowDeleted })).records;

    const totalPos =  BalanceService.calculateTotal(posBalanceRes);
    const totalNeg = BalanceService.calculateTotal(negBalanceRes);

    const typeTotals: UserTypeTotalBalanceResponse[] = [];
    const typedPosBalance: BalanceResponse[][] = [];
    const typedNegBalance: BalanceResponse[][] = [];
    const promises: Promise<any>[] = [];

    const userTypes = Object.values(UserType);

    for (const [index, type] of userTypes.entries()) {
      promises.push(this.getBalances(
        { userTypes: [type], date, minBalance: DineroTransformer.Instance.from(0), allowDeleted })
        .then((r) => typedPosBalance[index] = r.records));
      promises.push(this.getBalances({ userTypes: [type], date, maxBalance: DineroTransformer.Instance.from(0), allowDeleted })
        .then((r) => typedNegBalance[index] = r.records));
    }

    await Promise.all(promises);

    userTypes.forEach((type, index) => {
      const totalTypedPos = BalanceService.calculateTotal(typedPosBalance[index]);
      const totalTypedNeg = BalanceService.calculateTotal(typedNegBalance[index]);

      typeTotals.push({
        userType: type,
        totalPositive: totalTypedPos,
        totalNegative: totalTypedNeg,
      });
    });

    return {
      date: date.toISOString(),
      totalPositive: totalPos,
      totalNegative: totalNeg,
      userTypeBalances: typeTotals,
    };
  }

  private static calculateTotal(balanceResponse: BalanceResponse[]): DineroObjectResponse {
    return DineroTransformer.Instance.from(balanceResponse.reduce((sum, value) => sum + value.amount.amount, 0)).toObject();
  }
}
