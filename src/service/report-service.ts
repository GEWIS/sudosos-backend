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
import { AppDataSource } from '../database/database';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import ProductRevision from '../entity/product/product-revision';
import Dinero from 'dinero.js';
import VatGroup from '../entity/vat-group';
import ProductCategory from '../entity/product/product-category';
import { toMySQLString } from '../helpers/timestamps';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import SubTransaction from '../entity/transactions/sub-transaction';
import { asDinero, asNumber } from '../helpers/validators';
import PointOfSaleRevision from "../entity/point-of-sale/point-of-sale-revision";
import Transaction from "../entity/transactions/transaction";
import ContainerRevision from "../entity/container/container-revision";

interface ReportEntry {
  totalExclVat: Dinero.Dinero,
  totalInclVat: Dinero.Dinero
}

export interface ReportProductEntry extends ReportEntry {
  count: number,
  product: ProductRevision,
}

export interface ReportVatEntry extends ReportEntry {
  vat: VatGroup,
}

export interface ReportCategoryEntry extends ReportEntry {
  category: ProductCategory,
}

export interface ReportPosEntry extends ReportEntry {
  pos: PointOfSaleRevision,
}

export interface ReportContainerEntry extends ReportEntry {
  container: ContainerRevision,
}

export interface ReportData {
  entries?: ReportProductEntry[],
  categories?: ReportCategoryEntry[],
  vat?: ReportVatEntry[],
  pos?: ReportPosEntry[],
  containers?: ReportContainerEntry[],
}

export interface Report {
  forId: number,
  fromDate: Date,
  tillDate: Date,
  data: ReportData,
  totalExclVat: Dinero.Dinero,
  totalInclVat: Dinero.Dinero,
}

export interface SalesReport extends Report {}

export interface BuyerReport extends Report {}


export default abstract class ReportService {

  private manager: EntityManager;

  protected constructor(manager?: EntityManager) {
    this.manager = manager ? manager : AppDataSource.manager;
  }

  protected abstract addSubTransactionRowFilter<T>(query: SelectQueryBuilder<T>, forId: number, fromDate: Date, tillDate: Date): SelectQueryBuilder<T>;

  /**
     * Adds the totals to the given query
     * Note that the VAT is rounded per product, not per transaction.
     * @param query - The query to add the totals to
     * @private
     */
  private addSelectTotals<T>(query: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return query
      .addSelect('sum(subTransactionRow.amount * ROUND(productRevision.priceInclVat * (1 - (vatGroup.percentage / 100))))', 'total_excl_vat')
      .addSelect('sum(subTransactionRow.amount * productRevision.priceInclVat)', 'total_incl_vat');
  }

  /**
     * Gets the product report for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<ReportProductEntry[]>} - The product report
     */
  public async getProductEntries(forId: number, fromDate: Date, tillDate: Date): Promise<ReportProductEntry[]> {
    const query = this.manager.createQueryBuilder(ProductRevision, 'productRevision')
      .innerJoinAndSelect('productRevision.vat', 'vatGroup')
      .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
      .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
      .innerJoin(Transaction, 'transaction', 'transaction.id = subTransaction.transactionId')
      .addSelect('sum(subTransactionRow.amount)', 'sum_amount');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
      .groupBy('subTransactionRow.productProductId, subTransactionRow.productRevision')
      .getRawAndEntities();

    return data.entities.map((productRevision, index) => {
      const count = asNumber(data.raw[index].sum_amount);
      const totalInclVat = asDinero(data.raw[index].total_incl_vat);
      const totalExclVat = asDinero(data.raw[index].total_excl_vat);
      return {
        count,
        product: productRevision,
        totalInclVat,
        totalExclVat,
      };
    });
  }

  /**
     * Gets the VAT report for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<ReportVatEntry[]>} - The VAT report
     */
  public async getVatEntries(forId: number, fromDate: Date, tillDate: Date): Promise<ReportVatEntry[]> {
    const query = this.manager.createQueryBuilder(VatGroup, 'vatGroup')
      .innerJoin(ProductRevision, 'productRevision', 'productRevision.vat = vatGroup.id')
      .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
      .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
      .innerJoin(Transaction, 'transaction', 'transaction.id = subTransaction.transactionId');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
      .groupBy('vatGroup.id')
      .getRawAndEntities();

    return data.entities.map((vatGroup, index) => {
      const totalInclVat = asDinero(data.raw[index].total_incl_vat);
      const totalExclVat = asDinero(data.raw[index].total_excl_vat);
      return {
        vat: vatGroup,
        totalExclVat,
        totalInclVat,
      };
    });
  }

  /**
     * Gets the category report for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<ReportCategoryEntry[]>} - The category report
     */
  public async getCategoryEntries(forId: number, fromDate: Date, tillDate: Date): Promise<ReportCategoryEntry[]> {
    const query = this.manager.createQueryBuilder(ProductCategory, 'productCategory')
      .innerJoin(ProductRevision, 'productRevision', 'productRevision.category = productCategory.id')
      .innerJoin(VatGroup, 'vatGroup', 'vatGroup.id = productRevision.vat')
      .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
      .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
      .innerJoin(Transaction, 'transaction', 'transaction.id = subTransaction.transactionId');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
      .groupBy('productCategory.id')
      .getRawAndEntities();

    return data.entities.map((productCategory, index) => {
      const totalInclVat = asDinero(data.raw[index].total_incl_vat);
      const totalExclVat = asDinero(data.raw[index].total_excl_vat);
      return {
        category: productCategory,
        totalExclVat,
        totalInclVat,
      };
    });
  }

  /**
   * Gets the POS report for the given user
   * @param forId - The user ID to get the entries for
   * @param fromDate - The from date to get the entries for (inclusive)
   * @param tillDate - The till date to get the entries for (exclusive)
   * @returns {Promise<ReportPosEntry[]>} - The POS report
   */
  public async getPosEntries(forId: number, fromDate: Date, tillDate: Date): Promise<ReportPosEntry[]> {
    const query = this.manager.createQueryBuilder(PointOfSaleRevision, 'pointOfSaleRevision')
        .innerJoin(Transaction, 'transaction', 'transaction.pointOfSalePointOfSaleId = pointOfSaleRevision.pointOfSaleId AND transaction.pointOfSaleRevision = pointOfSaleRevision.revision')
        .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.transactionId = transaction.id')
        .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.subTransactionId = subTransaction.id')
        .innerJoin(ProductRevision, 'productRevision', 'productRevision.productId = subTransactionRow.productProductId AND productRevision.revision = subTransactionRow.productRevision')
        .innerJoin(VatGroup, 'vatGroup', 'vatGroup.id = productRevision.vat');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
        .groupBy('pointOfSaleRevision.pointOfSaleId')
        .getRawAndEntities();

    return data.entities.map((pos, index) => {
      const totalInclVat = asDinero(data.raw[index].total_incl_vat);
      const totalExclVat = asDinero(data.raw[index].total_excl_vat);
      return {
        pos,
        totalExclVat,
        totalInclVat,
      };
    });
  }

  /**
   * Gets the container report for the given user
   * @param forId - The user ID to get the entries for
   * @param fromDate - The from date to get the entries for (inclusive)
   * @param tillDate - The till date to get the entries for (exclusive)
   * @returns {Promise<ReportContainerEntry[]>} - The container report
   */
  public async getContainerEntries(forId: number, fromDate: Date, tillDate: Date): Promise<ReportContainerEntry[]> {
    const query = this.manager.createQueryBuilder(ContainerRevision, 'container')
        .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.containerContainerId = container.containerId and subTransaction.containerRevision = container.revision')
        .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.subTransactionId = subTransaction.id')
        .innerJoin(Transaction, 'transaction', 'transaction.id = subTransaction.transactionId')
        .innerJoin(ProductRevision, 'productRevision', 'productRevision.productId = subTransactionRow.productProductId AND productRevision.revision = subTransactionRow.productRevision')
        .innerJoin(VatGroup, 'vatGroup', 'vatGroup.id = productRevision.vat');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
        .groupBy('container.containerId')
        .getRawAndEntities();

    return data.entities.map((container, index) => {
      const totalInclVat = asDinero(data.raw[index].total_incl_vat);
      const totalExclVat = asDinero(data.raw[index].total_excl_vat);
      return {
        container,
        totalExclVat,
        totalInclVat,
      };
    });
  }

  /**
     * Gets the totals for the given user
     * @param forId - The user ID to get the totals for
     * @param fromDate - The from date to get the totals for (inclusive)
     * @param tillDate - The till date to get the totals for (exclusive)
     * @returns {Promise<{ totalExclVat: Dinero.Dinero, totalInclVat: Dinero.Dinero }>} - The totals
     */
  public async getTotals(forId: number, fromDate: Date, tillDate: Date): Promise<{ totalExclVat: Dinero.Dinero, totalInclVat: Dinero.Dinero }> {
    const query = this.manager.createQueryBuilder(ProductRevision, 'productRevision')
      .innerJoin('productRevision.vat', 'vatGroup')
      .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
      .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
      .innerJoin(Transaction, 'transaction', 'transaction.id = subTransaction.transactionId');
    this.addSelectTotals(query);

    const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
      .getRawAndEntities();

    const totalExclVat = asDinero(data.raw[0].total_excl_vat);
    const totalInclVat = asDinero(data.raw[0].total_incl_vat);
    return {
      totalExclVat,
      totalInclVat,
    };
  }

  /**
     * Gets the report for the given user
     * @param forId - The user ID to get the report for
     * @param fromDate - The from date to get the report for (inclusive)
     * @param tillDate - The till date to get the report for (exclusive)
     * @returns {Promise<Report>} - The report
     */
  public async getReport(forId: number, fromDate: Date, tillDate: Date): Promise<Report> {
    const productEntries = await this.getProductEntries(forId, fromDate, tillDate);
    const vatEntries = await this.getVatEntries(forId, fromDate, tillDate);
    const categoryEntries = await this.getCategoryEntries(forId, fromDate, tillDate);
    const getPosEntries = await this.getPosEntries(forId, fromDate, tillDate);
    const getContainerEntries = await this.getContainerEntries(forId, fromDate, tillDate);
    const totals = await this.getTotals(forId, fromDate, tillDate);

    // console.error(JSON.stringify(getPosEntries, null, 2));
    console.error(JSON.stringify(getContainerEntries, null, 2));

    return {
      forId,
      fromDate,
      tillDate,
      data: {
        entries: productEntries,
        categories: categoryEntries,
        vat: vatEntries,
        pos: getPosEntries,
        containers: getContainerEntries,
      },
      totalExclVat: totals.totalExclVat,
      totalInclVat: totals.totalInclVat,
    };
  }
}

export class SalesReportService extends ReportService {

  constructor(manager?: EntityManager) {
    super(manager);
  }

  protected addSubTransactionRowFilter<T>(query: SelectQueryBuilder<T>, forId: number, fromDate: Date, tillDate: Date): SelectQueryBuilder<T> {
    return query
        .where('subTransaction.toId = :userId', {userId: forId})
        .andWhere('subTransaction.createdAt >= :fromDate', {fromDate: toMySQLString(fromDate)})
        .andWhere('subTransaction.createdAt < :tillDate', {tillDate: toMySQLString(tillDate)});
  }

  getReport(forId: number, fromDate: Date, tillDate: Date): Promise<SalesReport> {
    return super.getReport(forId, fromDate, tillDate);
  }
}

export class BuyerReportService extends ReportService {

  constructor(manager?: EntityManager) {
    super(manager);
  }

  protected addSubTransactionRowFilter<T>(query: SelectQueryBuilder<T>, forId: number, fromDate: Date, tillDate: Date): SelectQueryBuilder<T> {
    return query
        .where('transaction.fromId = :userId', {userId: forId})
        .andWhere('subTransaction.createdAt >= :fromDate', {fromDate: toMySQLString(fromDate)})
        .andWhere('subTransaction.createdAt < :tillDate', {tillDate: toMySQLString(tillDate)});
  }

  getReport(forId: number, fromDate: Date, tillDate: Date): Promise<BuyerReport> {
    return super.getReport(forId, fromDate, tillDate);
  }
}