import { AppDataSource } from "../database/database";
import {EntityManager, SelectQueryBuilder} from "typeorm";
import ProductRevision from "../entity/product/product-revision";
import Dinero from "dinero.js";
import VatGroup from "../entity/vat-group";
import ProductCategory from "../entity/product/product-category";
import {toMySQLString} from "../helpers/timestamps";
import SubTransactionRow from "../entity/transactions/sub-transaction-row";
import SubTransaction from "../entity/transactions/sub-transaction";
import {asDinero, asNumber} from "../helpers/validators";


export interface SalesReportProductEntry {
    count: number,
    product: ProductRevision,
    totalExclVat: Dinero.Dinero,
    totalInclVat: Dinero.Dinero
}

export interface SalesReportVatEntry {
    vat: VatGroup,
    totalExclVat: Dinero.Dinero,
    totalInclVat: Dinero.Dinero
}

export interface SalesReportCategoryEntry {
    category: ProductCategory,
    totalExclVat: Dinero.Dinero,
    totalInclVat: Dinero.Dinero
}

export interface SalesReportData {
    entries?: SalesReportProductEntry[],
    categories?: SalesReportCategoryEntry[],
    vat?: SalesReportVatEntry[],
}

export interface SalesReport {
    forId: number,
    fromDate: Date,
    tillDate: Date,
    data: SalesReportData,
    totalExclVat: Dinero.Dinero,
    totalInclVat: Dinero.Dinero,
}

export default class SalesReportService {

    private manager: EntityManager;

    constructor(manager?: EntityManager) {
        this.manager = manager ? manager : AppDataSource.manager;
    }


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
     * Adds a filter on the sub transaction row to the given query
     * @param query - The query to add the filter to
     * @param toId - The user ID to filter on
     * @param fromDate - The from date to filter on (inclusive)
     * @param tillDate - The till date to filter on (exclusive)
     * @private
     */
    private addSubTransactionRowFilter<T>(query: SelectQueryBuilder<T>, toId: number, fromDate: Date, tillDate: Date): SelectQueryBuilder<T> {
        return query
            .where('subTransaction.toId = :userId', {userId: toId})
            .andWhere('subTransaction.createdAt >= :fromDate', {fromDate: toMySQLString(fromDate)})
            .andWhere('subTransaction.createdAt < :tillDate', {tillDate: toMySQLString(tillDate)});
    }

    /**
     * Gets the product sales for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<SalesReportProductEntry[]>} - The product sales
     */
    public async getProductEntries(forId: number, fromDate: Date, tillDate: Date): Promise<SalesReportProductEntry[]> {
        const query = this.manager.createQueryBuilder(ProductRevision, 'productRevision')
            .innerJoinAndSelect('productRevision.vat', 'vatGroup')
            .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
            .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
            .addSelect('sum(subTransactionRow.amount)', 'sum_amount');
        this.addSelectTotals(query);

        const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
            .groupBy('subTransactionRow.productProductId, subTransactionRow.productRevision')
            .getRawAndEntities();

        return data.entities.map((productRevision, index) => {
            const count = asNumber(data.raw[index].sum_amount)
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
     * Gets the VAT sales for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<SalesReportVatEntry[]>} - The VAT sales
     */
    public async getVatEntries(forId: number, fromDate: Date, tillDate: Date): Promise<SalesReportVatEntry[]> {
        const query = this.manager.createQueryBuilder(VatGroup, 'vatGroup')
            .innerJoin(ProductRevision, 'productRevision', 'productRevision.vat = vatGroup.id')
            .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
            .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId');
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
                totalInclVat
            };
        });
    }

    /**
     * Gets the category sales for the given user
     * @param forId - The user ID to get the entries for
     * @param fromDate - The from date to get the entries for (inclusive)
     * @param tillDate - The till date to get the entries for (exclusive)
     * @returns {Promise<SalesReportCategoryEntry[]>} - The category sales
     */
    public async getCategoryEntries(forId: number, fromDate: Date, tillDate: Date): Promise<SalesReportCategoryEntry[]> {
        const query = this.manager.createQueryBuilder(ProductCategory, 'productCategory')
            .innerJoin(ProductRevision, 'productRevision', 'productRevision.category = productCategory.id')
            .innerJoin(VatGroup, 'vatGroup', 'vatGroup.id = productRevision.vat')
            .innerJoin(SubTransactionRow, 'subTransactionRow', 'subTransactionRow.productProductId = productRevision.productId AND subTransactionRow.productRevision = productRevision.revision')
            .innerJoin(SubTransaction, 'subTransaction', 'subTransaction.id = subTransactionRow.subTransactionId')
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
                totalInclVat
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
        this.addSelectTotals(query);

        const data = await this.addSubTransactionRowFilter(query, forId, fromDate, tillDate)
            .getRawAndEntities();

        const totalExclVat = asDinero(data.raw[0].total_excl_vat);
        const totalInclVat = asDinero(data.raw[0].total_incl_vat);
        return {
            totalExclVat,
            totalInclVat
        };
    }

    /**
     * Gets the sales report for the given user
     * @param forId - The user ID to get the report for
     * @param fromDate - The from date to get the report for (inclusive)
     * @param tillDate - The till date to get the report for (exclusive)
     * @returns {Promise<SalesReport>} - The sales report
     */
    public async getSalesReport(forId: number, fromDate: Date, tillDate: Date): Promise<SalesReport> {
        console.error(forId, fromDate, tillDate);

        const productEntries = await this.getProductEntries(forId, fromDate, tillDate);
        const vatEntries = await this.getVatEntries(forId, fromDate, tillDate);
        const categoryEntries = await this.getCategoryEntries(forId, fromDate, tillDate);
        const totals = await this.getTotals(forId, fromDate, tillDate);

        return {
            forId,
            fromDate,
            tillDate,
            data: {
                entries: productEntries,
                categories: categoryEntries,
                vat: vatEntries,
            },
            totalExclVat: totals.totalExclVat,
            totalInclVat: totals.totalInclVat,
        }
    }
}