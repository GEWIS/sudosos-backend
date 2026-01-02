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
import WrappedResponse from '../controller/response/wrapped-response';
import WithManager from '../database/with-manager';
import Wrapped from '../entity/wrapped';
import User from '../entity/user/user';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import ProductRevision from '../entity/product/product-revision';
import OrganMembership from '../entity/organ/organ-membership';
import WrappedOrganMember from '../entity/wrapped/wrapped-organ-member';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import { Between, In } from 'typeorm';

export interface UpdateWrappedParameters {
  ids?: number[],
}

/**
 * Service responsible for computing and updating the "Wrapped" overview
 * information for users (transaction counts, percentiles, heatmaps, etc.).
 *
 * It extends WithManager to get a transactional EntityManager instance.
 */
export default class WrappedService extends WithManager {
  /**
   * Fetch the Wrapped row for a single user and map it to the public response
   * shape.
   *
   * @param userId - database id of the user to fetch
   * @returns the Wrapped for the user
   */
  public async getWrappedForUser(userId: number): Promise<Wrapped | null> {
    const entityManager = this.manager;

    return entityManager.findOne(Wrapped, {
      where: { userId },
      relations: ['organs'],
    });
  }

  /**
   * Map internal Wrapped entity to the external response DTO.
   *
   * This method normalizes nullable numeric values and parses stored JSON
   * heatmap strings into number arrays.
   *
   * @param data - Wrapped entity from the database
   */
  public static asWrappedResponse(data: Wrapped): WrappedResponse {
    return {
      userId: data.userId,
      transactions: {
        transactionCount: Number(data.transactionCount ?? 0),
        transactionPercentile: Number(data.transactionPercentile ?? 0),
        transactionMaxDate: data.transactionMaxDate.toISOString(),
        transactionMaxAmount: Number(data.transactionMaxAmount ?? 0),
        transactionHeatmap: this.parseHeatmap(data.transactionHeatmap),
      },
      spentPercentile: Number(data.spentPercentile ?? 0),
      syncedFrom: data.syncedFrom.toISOString(),
      syncedTo: data.syncedTo.toISOString(),
      organs: (data.organs || []).map((wom) => ({
        organId: wom.organId,
        ordinalTransactionCreated: Number(wom.ordinalTransactionCreated ?? 0),
        ordinalTurnoverCreated: Number(wom.ordinalTurnoverCreated ?? 0),
      })),
    } as WrappedResponse;
  }

  /**
   * Parse a stored heatmap string into an array of numbers.
   *
   * Returns an empty array when input is null/undefined or parsing fails. The
   * stored value is expected to be a JSON array (e.g. "[0,1,2,...]").
   *
   * @param raw - raw heatmap string from the database
   */
  private static parseHeatmap(raw: string): number[] {
    if (raw === undefined || raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as number[];
    } catch (e) {
      throw new Error('Invalid heatmap data');
    }
    return [];
  }

  /**
   * Create or update Wrapped rows for users and run all per-user update
   * computation steps (transaction counts, day stats, percentiles, etc.).
   *
   * If `params.ids` is provided, the operation is limited to those user ids.
   *
   * @param params - optional filter with specific user ids to update
   */
  public async updateWrapped(params: UpdateWrappedParameters = {}) {
    let users : User[];
    let rows : Wrapped[] = [];

    const wrappedYear = Number(process.env.WRAPPED_YEAR || new Date().getFullYear());

    if (params.ids && params.ids.length > 0) {
      users = await this.manager.find(User, {
        where: { id: In(params.ids), deleted: false, active: true, extensiveDataProcessing: true },
      });
    } else {
      users = await this.manager.find(User, { where: { deleted: false, active: true, extensiveDataProcessing: true } });
    }

    const userIds = users.map((u) => u.id).filter((id) => !!id);
    let existingWrapped: Wrapped[] = [];
    if (userIds.length > 0) {
      existingWrapped = await this.manager.find(Wrapped, { where: { userId: In(userIds) } });
    }

    const existingMap = new Map<number, Wrapped>();
    for (const w of existingWrapped) {
      existingMap.set(Number(w.userId), w);
    }

    for (const user of users) {
      let wrapped = existingMap.get(user.id);
      if (!wrapped) {
        wrapped = new Wrapped();
        Object.assign(wrapped, {
          userId: user.id,
          transactionCount: 0,
          transactionPercentile: 0,
          spentPercentile: 0,
          transactionMaxAmount: 0,
          transactionHeatmap: JSON.stringify([]),
        });
      }
      rows.push(wrapped);
    }

    await this.manager.save(rows);

    await this.updateTransactionCount(rows, wrappedYear);
    await this.updateTransactionDayStats(rows, wrappedYear);
    await this.updateTransactionPercentile(rows);
    await this.updateSpentPercentile(rows);

    await this.updateSyncedDates(rows, wrappedYear);
    await this.updateWrappedOrganMembers(rows, wrappedYear);
  }

  /**
   * Prepare a common context used by update methods: start/end dates for the
   * Wrapped year, the entity manager and the filtered userIds list.
   * Returns null when input rows are empty or no valid userIds found.
   *
   * @param rows - list of Wrapped rows to operate on
   * @param wrappedYear - year for the Wrapped computation
   */
  private prepareUpdateContext(rows: Wrapped[], wrappedYear: number) {
    const manager = this.manager;
    if (!rows || rows.length === 0) throw new Error('No rows provided');

    const userIds = rows.map((r) => Number(r.userId ?? 0)).filter((id) => id > 0);
    if (userIds.length === 0) return null;

    const start = new Date(wrappedYear, 0, 1, 0, 0, 0);
    const end = new Date(wrappedYear, 11, 31, 23, 59, 59);

    return { start, end, manager, userIds };
  }

  /**
   * Update the transaction count for each Wrapped row using a grouped query.
   *
   * The counts are computed only for transactions that fall between the
   * start and end dates of the Wrapped year.
   *
   * @param rows - list of Wrapped rows to operate on
   * @param wrappedYear - year for the Wrapped computation
   */
  private async updateTransactionCount(rows: Wrapped[], wrappedYear: number): Promise<void> {
    const ctx = this.prepareUpdateContext(rows, wrappedYear);
    if (!ctx) return;
    const { start, end, manager, userIds } = ctx;

    const countResults = await manager
      .createQueryBuilder(Transaction, 't')
      .select('t.fromId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('t.fromId IN (:...userIds)', { userIds })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('t.fromId')
      .getRawMany();

    const countMap = new Map<number, number>();
    for (const result of countResults) {
      countMap.set(Number(result.userId), Number(result.count));
    }

    const updatePromises = rows.map((wrapped) => {
      const count = countMap.get(wrapped.userId) ?? 0;
      return manager.update(Wrapped, { userId: wrapped.userId }, { transactionCount: count });
    });

    await Promise.all(updatePromises);
  }

  /**
   * Compute per-day statistics for transactions in the given year and update
   * the Wrapped rows with a heatmap and the date with the most transactions.
   *
   * The heatmap is a 365-length array where index 0 corresponds to Jan 1st.
   *
   * @param rows - list of Wrapped rows to operate on
   * @param wrappedYear - year for the Wrapped computation
   */
  public async updateTransactionDayStats(rows: Wrapped[], wrappedYear: number): Promise<void> {
    const ctx = this.prepareUpdateContext(rows, wrappedYear);
    if (!ctx) return;
    const { start, end, manager, userIds } = ctx;

    const transactions = await manager.find(Transaction, {
      where: {
        from: { id: In(userIds) },
        createdAt: Between(start, end),
      },
      select: ['id', 'createdAt'],
      relations: ['from'],
    });

    // Group transactions by user id
    const userTransactionsMap = new Map<number, Transaction[]>();
    for (const transaction of transactions) {
      const userId = transaction.from.id;
      if (!userTransactionsMap.has(userId)) {
        userTransactionsMap.set(userId, []);
      }
      userTransactionsMap.get(userId)!.push(transaction);
    }

    const updatePromises = rows.map(async (wrapped) => {
      const userId = Number(wrapped.userId ?? 0);
      if (!userId) return;

      const userTransactions = userTransactionsMap.get(userId) || [];

      if (userTransactions.length === 0) {
        return manager.update(Wrapped, { userId }, {
          transactionMaxDate: null,
          transactionMaxAmount: 0,
          transactionHeatmap: JSON.stringify(new Array(365).fill(0)),
        });
      }

      const dayCountMap = new Map<number, number>();
      const dateCountMap = new Map<string, number>();

      for (const transaction of userTransactions) {
        const transDate = new Date(transaction.createdAt);

        // Compute the zero-based day index relative to start of year
        const dayOfYear = Math.floor((transDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        // Only store counts for valid indices inside the 0..364 range.
        if (dayOfYear >= 0 && dayOfYear < 365) {
          dayCountMap.set(dayOfYear, (dayCountMap.get(dayOfYear) || 0) + 1);
        }

        // Also keep a date->count map to find the exact calendar date with
        // the most transactions (used for transactionMaxDate and transactionMaxAmount)
        const dateStr = transDate.toISOString().slice(0, 10);
        dateCountMap.set(dateStr, (dateCountMap.get(dateStr) || 0) + 1);
      }

      const heatmap = new Array(365).fill(0);
      for (const [dayIndex, count] of dayCountMap.entries()) {
        heatmap[dayIndex] = count;
      }

      // Find the date with the highest number of transactions
      let maxCount = 0;
      let maxDateStr = '';
      for (const [dateStr, count] of dateCountMap.entries()) {
        if (count > maxCount) {
          maxCount = count;
          maxDateStr = dateStr;
        }
      }

      const transactionMaxDate = maxDateStr ? new Date(maxDateStr) : null;

      return manager.update(Wrapped, { userId }, {
        transactionMaxDate,
        transactionMaxAmount: maxCount,
        transactionHeatmap: JSON.stringify(heatmap),
      });
    });

    await Promise.all(updatePromises);
  }

  /**
   * Compute percentile rank for each entry in the input list.
   *
   * This function calculates, for each entry, the percentile that its `value`
   * falls into among all provided values.
   *
   * Example: if 2 out of 10 values are strictly less than a value, its percentile
   * becomes 100 * (1 - 2/10) = 80.00.
   *
   * @param values - Array of objects containing `id` and numeric `value`.
   * @returns Map where each key is the original `id` and the value is the percentile rounded to 2 decimals
   */
  private static computePercentiles(values: { id: number; value: number }[]) {
    const total = values.length;
    if (total === 0) return new Map<number, number>();

    const sorted = [...values].sort((a, b) => a.value - b.value);

    // Map value -> count of items strictly less than that value
    const lessCountMap = new Map<number, number>();
    for (let i = 0; i < sorted.length; i++) {
      const value = sorted[i].value;
      if (!lessCountMap.has(value)) {
        lessCountMap.set(value, i);
      }
    }

    // Compute percentile for each original entry using the formula:
    // percentile = 100 * (1 - (count_strictly_less / total))
    const res = new Map<number, number>();
    for (const entry of values) {
      const less = lessCountMap.get(entry.value) ?? 0;
      const pct = 100 * (1 - (less / total));
      // Store rounded to two decimals
      res.set(entry.id, Number(pct.toFixed(2)));
    }
    return res;
  }

  /**
   * Update transaction percentile for the provided Wrapped rows.
   *
   * This method loads the full eligible user list (with their Wrapped
   * transactionCount) and computes percentiles across that population.
   *
   * @param rows - list of Wrapped rows to operate on
   */
  private async updateTransactionPercentile(rows: Wrapped[]) {
    const manager = this.manager;
    if (!rows || rows.length === 0) return;

    const usersQb = manager.createQueryBuilder(User, 'u')
      .leftJoin(Wrapped, 'w', 'w.userId = u.id')
      .select('u.id', 'id')
      .addSelect('COALESCE(w.transactionCount, 0)', 'transactionCount')
      .where('u.deleted = 0 AND u.active = 1 AND u.extensiveDataprocessing = 1');

    const allUsers: { id: number; transactionCount: number }[] = await usersQb.getRawMany();

    const valueList = allUsers.map((u) => ({ id: Number(u.id), value: Number(u.transactionCount ?? 0) }));
    const percentileMap = WrappedService.computePercentiles(valueList);

    const updatePromises = rows.map((wrapped) => {
      const percentile = percentileMap.get(wrapped.userId) ?? 100;
      return manager.update(Wrapped, { userId: wrapped.userId }, { transactionPercentile: percentile });
    });

    await Promise.all(updatePromises);
  }

  /**
   * Update spent-percentile for the provided Wrapped rows.
   *
   * The method computes total spent per user by joining transactions ->
   * subtransactions -> subtransaction rows -> product revisions to multiply
   * amounts and prices. Users who are inactive / deleted or do not allow
   * extensive data processing are excluded.
   *
   * @param rows - list of Wrapped rows to operate on
   */
  private async updateSpentPercentile(rows: Wrapped[]) {
    const manager = this.manager;
    if (!rows || rows.length === 0) return;

    const userFilterCore = 'u.deleted = 0 AND u.active = 1 AND u.extensiveDataProcessing = 1';

    const qb = manager.createQueryBuilder(Transaction, 't')
      .select('t.fromId', 'userId')
      .addSelect('COALESCE(SUM(str.amount * pr.priceInclVat), 0)', 'total_spent')
      .innerJoin(SubTransaction, 'st', 'st.transactionId = t.id')
      .innerJoin(SubTransactionRow, 'str', 'str.subTransactionId = st.id')
      .innerJoin(ProductRevision, 'pr', 'pr.productId = str.productProductId AND pr.revision = str.productRevision')
      .groupBy('t.fromId');

    const rowsResult: { userId: number; total_spent: string }[] = await qb.getRawMany();

    const usersQb = manager.createQueryBuilder(User, 'u')
      .leftJoin(Wrapped, 'w', 'w.userId = u.id')
      .select('u.id', 'id')
      .where(userFilterCore);
    const eligibleUsers: { id: number }[] = await usersQb.getRawMany();

    // Initialize spent map with zero for all eligible users so that users
    // without transactions still appear in percentile computation.
    const spentMap = new Map<number, number>();
    for (const e of eligibleUsers) spentMap.set(Number(e.id), 0);
    for (const r of rowsResult) spentMap.set(Number(r.userId), Number(r.total_spent ?? 0));

    const valueList = Array.from(spentMap.entries()).map(([id, value]) => ({ id, value }));
    const percentileMap = WrappedService.computePercentiles(valueList);

    const updatePromises = rows.map((wrapped) => {
      const pct = percentileMap.get(wrapped.userId) ?? 100;
      return manager.update(Wrapped, { userId: wrapped.userId }, { spentPercentile: pct });
    });

    await Promise.all(updatePromises);
  }

  /**
   * Update the syncedFrom/syncedTo timestamps for the provided rows. syncedFrom
   * is set to the beginning of the Wrapped year and syncedTo to 'now'.
   *
   * @param rows - list of Wrapped rows to operate on
   * @param wrappedYear - year for the Wrapped computation
   */
  private async updateSyncedDates(rows: Wrapped[], wrappedYear: number): Promise<void> {
    if (!rows || rows.length === 0) return;

    const manager = this.manager;
    const userIds = rows.map((r) => Number(r.userId ?? 0)).filter((id) => id > 0);
    if (userIds.length === 0) return;

    const syncedFrom = new Date(wrappedYear, 0, 1, 0, 0, 0);
    const syncedTo = new Date();

    // Update all matched Wrapped rows in a single query
    await manager.createQueryBuilder()
      .update(Wrapped)
      .set({ syncedFrom, syncedTo })
      .where('userId IN (:...userIds)', { userIds })
      .execute();
  }

  /**
   * Update organ member statistics for the provided Wrapped rows.
   *
   * For each user, finds all organs they're a member of, then computes ordinal
   * rankings (0-based, sequential) for transaction count and turnover among all
   * sellers (createdBy users) who created transactions for that organ's POS.
   *
   * @param rows - list of Wrapped rows to operate on
   * @param wrappedYear - year for the Wrapped computation
   */
  private async updateWrappedOrganMembers(rows: Wrapped[], wrappedYear: number): Promise<void> {
    const ctx = this.prepareUpdateContext(rows, wrappedYear);
    if (!ctx) return;
    const { start, end, manager, userIds } = ctx;

    // Get all organ memberships for the users
    const organMemberships = await manager.find(OrganMembership, {
      where: { userId: In(userIds) },
    });

    if (organMemberships.length === 0) {
      // Delete any existing WrappedOrganMember records for these users
      await manager.delete(WrappedOrganMember, { userId: In(userIds) });
      return;
    }

    // Group memberships by organId
    const organIds = [...new Set(organMemberships.map((om) => om.organId))];
    const userOrgansMap = new Map<number, number[]>();
    for (const om of organMemberships) {
      const userId = Number(om.userId);
      if (!userOrgansMap.has(userId)) {
        userOrgansMap.set(userId, []);
      }
      userOrgansMap.get(userId)!.push(Number(om.organId));
    }

    // For each organ, compute seller statistics
    const organStatsMap = new Map<number, Map<number, { count: number; turnover: number }>>();

    for (const organId of organIds) {
      // Query transactions for this organ's POS
      const transactionStats = await manager
        .createQueryBuilder(Transaction, 't')
        .select('t.createdById', 'sellerId')
        .addSelect('COUNT(*)', 'transactionCount')
        .addSelect('COALESCE(SUM(str.amount * pr.priceInclVat), 0)', 'turnover')
        .innerJoin(PointOfSaleRevision, 'posr', 'posr.pointOfSaleId = t.pointOfSalePointOfSaleId AND posr.revision = t.pointOfSaleRevision')
        .innerJoin('posr.pointOfSale', 'pos')
        .innerJoin('pos.owner', 'owner')
        .innerJoin(SubTransaction, 'st', 'st.transactionId = t.id')
        .innerJoin(SubTransactionRow, 'str', 'str.subTransactionId = st.id')
        .innerJoin(ProductRevision, 'pr', 'pr.productId = str.productProductId AND pr.revision = str.productRevision')
        .innerJoin(User, 'seller', 'seller.id = t.createdById')
        .where('owner.id = :organId', { organId })
        .andWhere('owner.active = 1')
        .andWhere('t.createdAt BETWEEN :start AND :end', { start, end })
        .andWhere('seller.extensiveDataProcessing = 1')
        .andWhere('seller.deleted = 0')
        .andWhere('seller.active = 1')
        .groupBy('t.createdById')
        .getRawMany();

      const sellerStats = new Map<number, { count: number; turnover: number }>();
      for (const stat of transactionStats) {
        sellerStats.set(Number(stat.sellerId), {
          count: Number(stat.transactionCount),
          turnover: Number(stat.turnover),
        });
      }
      organStatsMap.set(organId, sellerStats);
    }

    // Compute ordinals for each organ
    const organOrdinalsMap = new Map<number, Map<number, { transactionOrdinal: number; turnoverOrdinal: number }>>();

    for (const [organId, sellerStats] of organStatsMap.entries()) {
      // Sort sellers by transaction count (descending)
      const sortedByCount = Array.from(sellerStats.entries())
        .sort((a, b) => b[1].count - a[1].count);

      // Sort sellers by turnover (descending)
      const sortedByTurnover = Array.from(sellerStats.entries())
        .sort((a, b) => b[1].turnover - a[1].turnover);

      // Assign 0-based sequential ordinals
      const transactionOrdinals = new Map<number, number>();
      for (let i = 0; i < sortedByCount.length; i++) {
        transactionOrdinals.set(sortedByCount[i][0], i);
      }

      const turnoverOrdinals = new Map<number, number>();
      for (let i = 0; i < sortedByTurnover.length; i++) {
        turnoverOrdinals.set(sortedByTurnover[i][0], i);
      }

      const ordinalsMap = new Map<number, { transactionOrdinal: number; turnoverOrdinal: number }>();
      for (const [sellerId] of sellerStats.entries()) {
        ordinalsMap.set(sellerId, {
          transactionOrdinal: transactionOrdinals.get(sellerId) ?? sortedByCount.length,
          turnoverOrdinal: turnoverOrdinals.get(sellerId) ?? sortedByTurnover.length,
        });
      }
      organOrdinalsMap.set(organId, ordinalsMap);
    }

    // Delete existing WrappedOrganMember records for these users
    await manager.delete(WrappedOrganMember, { userId: In(userIds) });

    // Create new WrappedOrganMember records
    const wrappedOrganMembers: WrappedOrganMember[] = [];
    for (const wrapped of rows) {
      const userId = Number(wrapped.userId);
      const oIds = userOrgansMap.get(userId) || [];

      for (const organId of oIds) {
        const ordinals = organOrdinalsMap.get(organId)?.get(userId);
        if (ordinals !== undefined) {
          const wom = new WrappedOrganMember();
          wom.userId = userId;
          wom.organId = organId;
          wom.ordinalTransactionCreated = ordinals.transactionOrdinal;
          wom.ordinalTurnoverCreated = ordinals.turnoverOrdinal;
          wrappedOrganMembers.push(wom);
        }
      }
    }

    if (wrappedOrganMembers.length > 0) {
      await manager.save(wrappedOrganMembers);
    }
  }
}
