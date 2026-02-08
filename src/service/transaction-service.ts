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
 * This is the module page of the transaction-service.
 *
 * @module transactions
 */

import { In, IsNull, SelectQueryBuilder } from 'typeorm';
import dinero from 'dinero.js';
import { RequestWithToken } from '../middleware/token-middleware';
import {
  BaseTransactionResponse,
  PaginatedBaseTransactionResponse,
  SubTransactionResponse,
  SubTransactionRowResponse,
  TransactionResponse,
} from '../controller/response/transaction-response';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import {
  parseContainerToBaseResponse,
  parsePOSToBasePOS,
  parseProductToBaseResponse,
  parseUserToBaseResponse,
  parseVatGroupToResponse,
} from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import WebSocketService from './websocket-service';
import log4js from 'log4js';
import {
  SubTransactionRequest,
  SubTransactionRowRequest,
  TransactionRequest,
} from '../controller/request/transaction-request';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import ContainerRevision from '../entity/container/container-revision';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import ProductRevision from '../entity/product/product-revision';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import { DineroObjectResponse } from '../controller/response/dinero-response';
import BalanceService from './balance-service';
import { asBoolean, asDate, asNumber } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import { toMySQLString, utcToDate } from '../helpers/timestamps';
import {
  TransactionReport,
  TransactionReportCategoryEntryResponse,
  TransactionReportData,
  TransactionReportDataResponse,
  TransactionReportEntryResponse,
  TransactionReportResponse,
  TransactionReportVatEntryResponse,
} from '../controller/response/transaction-report-response';
import {
  collectProductsByCategory,
  collectProductsByRevision,
  collectProductsByVat,
  reduceMapToCategoryEntries,
  reduceMapToReportEntries,
  reduceMapToVatEntries,
} from '../helpers/transaction-mapper';
import ProductCategoryService from './product-category-service';
import WithManager from '../database/with-manager';
import ProductService from './product-service';
import { convertToPositional } from '../helpers/params';
import UserService from './user-service';

export interface TransactionFilterParameters {
  transactionId?: number | number[],
  fromId?: number,
  createdById?: number,
  toId?: number,
  exclusiveToId?: boolean,
  pointOfSaleId?: number,
  pointOfSaleRevision?: number,
  containerId?: number,
  containerRevision?: number,
  productId?: number,
  productRevision?: number,
  fromDate?: Date,
  tillDate?: Date,
  invoiceId?: number,
  excludeById?: number,
  excludeFromId?: number,
}

/**
 * Context object to cache loaded entities and calculated values during transaction processing
 */
interface TransactionContext {
  users: Map<number, User>;
  pointOfSale?: PointOfSaleRevision;
  containers: Map<string, ContainerRevision>;
  products: Map<string, ProductRevision>;
  totalCost?: Dinero.Dinero;
  subTransactionCosts?: Map<number, Dinero.Dinero>; // Indexed by subtransaction index
}

export function parseGetTransactionsFilters(req: RequestWithToken): TransactionFilterParameters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
    || (req.query.containerRevision && !req.query.containerId)
    || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  const filters: TransactionFilterParameters = {
    // TODO Make this work on arrays
    transactionId: asNumber(req.query.transactionId),
    fromId: asNumber(req.query.fromId),
    createdById: asNumber(req.query.createdById),
    toId: asNumber(req.query.toId),
    exclusiveToId: req.query.exclusiveToId ? asBoolean(req.query.exclusiveToId) : true,
    pointOfSaleId: asNumber(req.query.pointOfSaleId),
    pointOfSaleRevision: asNumber(req.query.pointOfSaleRevision),
    containerId: asNumber(req.query.containerId),
    containerRevision: asNumber(req.query.containerRevision),
    productId: asNumber(req.query.productId),
    productRevision: asNumber(req.query.productRevision),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
    invoiceId: asNumber(req.query.invoiceId),
    excludeById: asNumber(req.query.excludeById),
    excludeFromId: asNumber(req.query.excludeFromId),
  };

  return filters;
}

export default class TransactionService extends WithManager {
  /**
   * Gets total cost of a transaction with values stored in the database
   * @returns {DineroObject.model} - the total cost of a transaction
   * @param rows
   * @param productMap - Optional map of pre-loaded products to avoid queries
   */
  public async getTotalCost(
    rows: SubTransactionRowRequest[],
    productMap?: Map<string, ProductRevision>,
  ): Promise<Dinero.Dinero> {
    // If product map is provided, use it; otherwise batch load all products
    let products: Map<string, ProductRevision>;
    
    if (productMap) {
      products = productMap;
    } else {
      // Batch load all products in a single query
      const productKeys = rows.map((row) => ({ id: row.product.id, revision: row.product.revision }));
      const uniqueProducts = Array.from(
        new Map(productKeys.map((p) => [`${p.id}-${p.revision}`, p])).values(),
      );

      if (uniqueProducts.length === 0) {
        return dinero({ amount: 0 });
      }

      // Batch load all products in parallel using Promise.all
      const allProducts = await Promise.all(
        uniqueProducts.map(async (p) => {
          const options = await ProductService.getOptions({
            productRevision: p.revision,
            productId: p.id,
            allowDeleted: true,
          });
          return this.manager.findOne(ProductRevision, options);
        }),
      );
      
      // Filter out null results
      const validProducts = allProducts.filter((p): p is ProductRevision => p !== null);

      products = new Map();
      validProducts.forEach((product) => {
        products.set(`${product.productId}-${product.revision}`, product);
      });
    }

    // Calculate total cost in a single pass using reduce
    return rows.reduce((total, row) => {
      const key = `${row.product.id}-${row.product.revision}`;
      const product = products.get(key);
      if (!product) {
        return total; // Skip missing products instead of adding 0
      }
      return total.add(product.priceInclVat.multiply(row.amount));
    }, dinero({ amount: 0 }));
  }

  /**
   * Verifies whether a user has a sufficient balance to complete the transaction
   * @param {TransactionRequest.model} req - the transaction request to verify
   * @param totalCost - Optional pre-calculated total cost to avoid recalculation
   * @returns {boolean} - whether user's balance is ok or not
   */
  public async verifyBalance(req: TransactionRequest, totalCost?: Dinero.Dinero): Promise<boolean> {
    let cost: Dinero.Dinero;
    
    if (totalCost) {
      cost = totalCost;
    } else {
      const rows: SubTransactionRowRequest[] = [];
      req.subTransactions.forEach((sub) => sub.subTransactionRows.forEach((row) => rows.push(row)));
      cost = await this.getTotalCost(rows);
    }

    // get user balance and compare
    const userBalance = dinero((await new BalanceService().getBalance(req.from)).amount);

    // return whether user balance is sufficient to complete the transaction
    return userBalance.greaterThanOrEqual(cost);
  }

  /**
   * Tests whether a dinero request equals a dinero object
   * @param {DineroObjectRequest.model} req - dinero request
   * @param {DineroObject.model} din - dinero object
   * @returns {boolean} - equality of the parameters
   */
  public static dineroEq(req: DineroObjectRequest, din: Dinero.Dinero): boolean {
    const price = dinero(req);
    return price.equalsTo(din);
  }

  /**
   * Verifies whether a sub transaction row within a sub transaction is valid (using context)
   * @param {SubTransactionRowRequest.model} req - the sub transaction row request to verify
   * @param container
   * @param context - transaction context with loaded entities
   * @returns {boolean} - whether sub transaction row is ok or not
   */
  private async verifySubTransactionRow(
    req: SubTransactionRowRequest,
    container: ContainerRevision,
    context: TransactionContext,
  ): Promise<boolean> {
    // check if fields provided in subtransactionrow
    if (!req.product || !req.totalPriceInclVat
        || !req.amount || req.amount <= 0 || !Number.isInteger(req.amount)) {
      return false;
    }

    // check if product is in the container
    if (!container.products.some((product) => product.product
      && product.product.deletedAt == null
      && product.product.id === req.product.id
      && product.revision === req.product.revision)) {
      return false;
    }

    // check if product exists using context
    const productKey = `${req.product.id}-${req.product.revision}`;
    const product = context.products.get(productKey);
    if (!product) {
      return false;
    }

    // check whether the request price corresponds to the database price using cached product
    const cost = await this.getTotalCost([req], context.products);
    return TransactionService.dineroEq(req.totalPriceInclVat, cost);
  }


  /**
   * Verifies whether a sub transaction within a transaction is valid (using context)
   * @param {SubTransactionRequest.model} req - the sub transaction request to verify
   * @param {PointOfSaleRevision.model} pointOfSale - the point of sale in the request
   * @param context - transaction context with loaded entities
   * @param isUpdate
   * @returns {boolean} - whether sub transaction is ok or not
   */
  private async verifySubTransaction(
    req: SubTransactionRequest,
    pointOfSale: PointOfSaleRevision,
    context: TransactionContext,
    isUpdate?: boolean,
  ): Promise<boolean> {
    // check if fields provided in the transaction
    if (!req.to || !req.container || !req.totalPriceInclVat
        || !req.subTransactionRows || req.subTransactionRows.length === 0) {
      return false;
    }

    // check if container is in the point of sale
    if (!pointOfSale.containers.some((container) => container.container && container.container.id === req.container.id
        && container.revision === req.container.revision)) {
      return false;
    }

    // check if to user exists using context
    const user = context.users.get(req.to);
    if (!user || (!isUpdate && !user.active)) {
      return false;
    }

    // check whether the request price corresponds to the database price using cached products
    const rows: SubTransactionRowRequest[] = [];
    req.subTransactionRows.forEach((row) => rows.push(row));
    const cost = await this.getTotalCost(rows, context.products);
    if (!TransactionService.dineroEq(req.totalPriceInclVat, cost)) {
      return false;
    }

    // get container from context
    const containerKey = `${req.container.id}-${req.container.revision}`;
    const container = context.containers.get(containerKey);
    if (!container) {
      return false;
    }

    // verify subtransaction rows using context
    const verification = await Promise.all(req.subTransactionRows.map(
      async (row) => this.verifySubTransactionRow(row, container, context),
    ));

    return !verification.includes(false);
  }


  /**
   * Verifies whether a transaction is valid and returns context with loaded entities
   * @param {TransactionRequest.model} req - the transaction request to verify
   * @param isUpdate
   * @returns {Promise<{valid: boolean, context?: TransactionContext}>} - verification result and context (context is always provided if valid)
   */
  public async verifyTransaction(
    req: TransactionRequest,
    isUpdate?: boolean,
  ): Promise<{ valid: boolean; context?: TransactionContext }> {
    const context: TransactionContext = {
      users: new Map(),
      containers: new Map(),
      products: new Map(),
    };

    // check fields provided in the transaction
    if (!req.from || !req.createdBy
        || !req.subTransactions || req.subTransactions.length === 0
        || !req.pointOfSale || !req.totalPriceInclVat) {
      return { valid: false };
    }

    // Collect all user IDs needed
    const userIds = new Set<number>([req.from, req.createdBy]);
    req.subTransactions.forEach((sub) => {
      if (sub.to) {
        userIds.add(sub.to);
      }
    });

    // Batch load all users
    const users = await this.manager.find(User, { where: { id: In(Array.from(userIds)) } });
    if (users.length !== userIds.size
      || (!isUpdate && !users.every((user) => user.active && user.acceptedToS !== TermsOfServiceStatus.NOT_ACCEPTED))) {
      return { valid: false };
    }

    users.forEach((user) => context.users.set(user.id, user));

    const fromUser = context.users.get(req.from);
    if (!fromUser || fromUser.type === UserType.ORGAN) {
      return { valid: false };
    }

    // Collect all product IDs/revisions for batch loading
    const rows: SubTransactionRowRequest[] = [];
    req.subTransactions.forEach((sub) => sub.subTransactionRows.forEach((row) => rows.push(row)));

    // Batch load all products in parallel using Promise.all
    const productKeys = rows.map((row) => ({ id: row.product.id, revision: row.product.revision }));
    const uniqueProducts = Array.from(
      new Map(productKeys.map((p) => [`${p.id}-${p.revision}`, p])).values(),
    );

    if (uniqueProducts.length > 0) {
      const allProducts = await Promise.all(
        uniqueProducts.map(async (p) => {
          const options = await ProductService.getOptions({
            productRevision: p.revision,
            productId: p.id,
            allowDeleted: true,
          });
          return this.manager.findOne(ProductRevision, options);
        }),
      );
      
      // Filter out null results and add to context
      allProducts
        .filter((p): p is ProductRevision => p !== null)
        .forEach((product) => {
          context.products.set(`${product.productId}-${product.revision}`, product);
        });
    }

    // Calculate total cost using loaded products
    const cost = await this.getTotalCost(rows, context.products);
    context.totalCost = cost;
    if (!TransactionService.dineroEq(req.totalPriceInclVat, cost)) {
      return { valid: false };
    }

    // Calculate cost per subtransaction and cache in context
    context.subTransactionCosts = new Map<number, Dinero.Dinero>();
    req.subTransactions.forEach((sub, index) => {
      const subRows = sub.subTransactionRows;
      const subCost = subRows.reduce((total, row) => {
        const productKey = `${row.product.id}-${row.product.revision}`;
        const product = context.products.get(productKey);
        if (product) {
          return total.add(product.priceInclVat.multiply(row.amount));
        }
        return total;
      }, dinero({ amount: 0 }));
      context.subTransactionCosts.set(index, subCost);
    });

    // Load point of sale
    const pointOfSale = await this.manager.findOne(PointOfSaleRevision, {
      where: {
        revision: req.pointOfSale.revision,
        pointOfSale: { id: req.pointOfSale.id, deletedAt: IsNull() },
      },
      relations: ['pointOfSale', 'containers'],
    });

    if (!pointOfSale) {
      return { valid: false };
    }
    context.pointOfSale = pointOfSale;

    // Load all containers
    const containerKeys = req.subTransactions.map((sub) => ({
      id: sub.container.id,
      revision: sub.container.revision,
    }));
    const uniqueContainers = Array.from(
      new Map(containerKeys.map((c) => [`${c.id}-${c.revision}`, c])).values(),
    );

    // Batch load all containers in parallel using Promise.all
    const allContainers = await Promise.all(
      uniqueContainers.map(async ({ id, revision }) => {
        return this.manager.findOne(ContainerRevision, {
          where: {
            revision,
            container: { id, deletedAt: IsNull() },
          },
          relations: ['container', 'products'],
        });
      }),
    );
    
    // Filter out null results and add to context
    allContainers
      .filter((c): c is ContainerRevision => c !== null)
      .forEach((container) => {
        context.containers.set(`${container.containerId}-${container.revision}`, container);
      });

    // Verify subtransactions using context
    const verification = await Promise.all(req.subTransactions.map(
      async (sub) => this.verifySubTransaction(sub, pointOfSale, context, isUpdate),
    ));
    
    if (verification.includes(false)) {
      return { valid: false };
    }

    return { valid: true, context };
  }


  /**
   * Creates a transaction from a transaction request
   * @param {TransactionRequest.model} req - the transaction request to cast
   * @param context - transaction context with loaded entities (required)
   * @param update
   * @returns {Transaction.model} - the transaction
   */
  public async asTransaction(
    req: TransactionRequest,
    context: TransactionContext,
    update?: Transaction,
  ): Promise<Transaction | undefined> {
    if (!req) {
      return undefined;
    }

    // init transaction
    const transaction = ((update) ? Object.assign(new Transaction(), {
      ...update,
      version: update.version + 1,
      updatedAt: new Date(),
    }) : Object.assign(new Transaction(), {})) as Transaction;

    // get users from context
    transaction.from = context.users.get(req.from);
    transaction.createdBy = context.users.get(req.createdBy);

    // set subtransactions using context
    transaction.subTransactions = await Promise.all(req.subTransactions.map(
      async (subTransaction) => this.asSubTransaction(subTransaction, context),
    ));

    // get point of sale revision from context
    transaction.pointOfSale = context.pointOfSale;

    return transaction;
  }


  /**
   * Creates a transaction response from a transaction (using cached cost)
   * @returns {TransactionResponse.model} - the transaction response
   * @param transaction
   * @param totalCost - Optional pre-calculated total cost
   * @param context - Optional transaction context with cached entities and costs
   */
  public async asTransactionResponse(
    transaction: Transaction,
    totalCost?: Dinero.Dinero,
    context?: TransactionContext,
  ): Promise<TransactionResponse | undefined> {
    if (!transaction) {
      return undefined;
    }

    // Use cached cost if provided, otherwise calculate
    let cost: Dinero.Dinero;
    if (totalCost) {
      cost = totalCost;
    } else {
      const rows: SubTransactionRowRequest[] = [];
      transaction.subTransactions.forEach(
        (sub) => sub.subTransactionRows.forEach((row) => rows.push(
          {
            product: {
              id: row.product.product.id,
              revision: row.product.revision,
            },
            amount: row.amount,
            totalPriceInclVat: undefined,
          } as SubTransactionRowRequest,
        )),
      );
      cost = await this.getTotalCost(rows);
    }

    // Use cached subtransaction costs from context if available
    const subTransactionCosts = context?.subTransactionCosts;
    const subTransactions = await Promise.all(transaction.subTransactions.map(
      async (subTransaction, index) => {
        const cachedSubCost = subTransactionCosts?.get(index);
        return this.asSubTransactionResponse(subTransaction, cachedSubCost);
      },
    ));

    return {
      id: transaction.id,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      from: parseUserToBaseResponse(transaction.from, false),
      createdBy: parseUserToBaseResponse(transaction.createdBy, false),
      subTransactions,
      pointOfSale: parsePOSToBasePOS(transaction.pointOfSale, false),
      totalPriceInclVat: { ...cost.toObject() } as DineroObjectResponse,
    } as TransactionResponse;
  }

  /**
   * Creates a sub transaction from a sub transaction request
   * @param {SubTransactionRequest.model} req - the sub transaction request to cast
   * @param context - transaction context with loaded entities (required)
   * @returns {SubTransaction.model} - the sub transaction
   */
  private async asSubTransaction(
    req: SubTransactionRequest,
    context: TransactionContext,
  ): Promise<SubTransaction | undefined> {
    if (!req) {
      return undefined;
    }

    // the subtransaction
    const subTransaction = {} as SubTransaction;

    // get user from context
    subTransaction.to = context.users.get(req.to);

    // get container revision from context
    const containerKey = `${req.container.id}-${req.container.revision}`;
    subTransaction.container = context.containers.get(containerKey);

    // sub transaction rows using context
    subTransaction.subTransactionRows = await Promise.all(req.subTransactionRows.map(
      async (row) => this.asSubTransactionRow(row, subTransaction, context),
    ));

    return subTransaction;
  }


  /**
   * Creates a sub transaction response from a sub transaction
   * @returns {SubTransactionResponse.model} - the sub transaction response
   * @param subTransaction
   * @param cachedCost - Optional pre-calculated cost to avoid recalculation
   */
  public async asSubTransactionResponse(
    subTransaction: SubTransaction,
    cachedCost?: Dinero.Dinero,
  ): Promise<SubTransactionResponse | undefined> {
    if (!subTransaction) {
      return undefined;
    }

    // Use cached cost if provided, otherwise calculate
    let cost: Dinero.Dinero;
    if (cachedCost) {
      cost = cachedCost;
    } else {
      // get sub transaction rows to calculate total cost
      const rows: SubTransactionRowRequest[] = [];
      subTransaction.subTransactionRows.forEach((row) => rows.push(
        {
          product: {
            id: row.product.product.id,
            revision: row.product.revision,
          },
          amount: row.amount,
          totalPriceInclVat: undefined,
        } as SubTransactionRowRequest,
      ));
      cost = await this.getTotalCost(rows);
    }

    return {
      id: subTransaction.id,
      to: parseUserToBaseResponse(subTransaction.to, false),
      container: parseContainerToBaseResponse(subTransaction.container, false),
      subTransactionRows: subTransaction.subTransactionRows.map((row) => ({
        id: row.id,
        product: parseProductToBaseResponse(row.product, false),
        amount: row.amount,
        totalPriceInclVat: row.product.priceInclVat.multiply(row.amount).toObject(),
      } as SubTransactionRowResponse)),
      totalPriceInclVat: { ...cost.toObject() } as DineroObjectResponse,
    } as SubTransactionResponse;
  }

  /**
   * Creates a sub transaction row from a sub transaction row request (using context)
   * @param {SubTransactionRowRequest.model} req - the sub transaction row request to cast
   * @param {SubTransaction.model} subTransaction - the sub transaction to connect
   * @param context - transaction context with loaded entities
   * @returns {SubTransactionRow.model} - the sub transaction row
   */
  private async asSubTransactionRow(
    req: SubTransactionRowRequest,
    subTransaction: SubTransaction,
    context: TransactionContext,
  ): Promise<SubTransactionRow | undefined> {
    if (!req) {
      return undefined;
    }

    // get product from context
    const productKey = `${req.product.id}-${req.product.revision}`;
    const product = context.products.get(productKey);
    return { product, amount: req.amount, subTransaction } as SubTransactionRow;
  }


  /**
   * Invalidates user balance cache
   * @param {TransactionResponse.model} transaction - transaction holding users to invalidate
   */
  public static async invalidateBalanceCache(transaction: TransactionResponse):
  Promise<void> {
    // get user ids to invalidate
    const userIds = [...new Set(transaction.subTransactions.map((sub) => sub.to.id))];
    if (!userIds.includes(transaction.from.id)) {
      userIds.push(transaction.from.id);
    }
    await new BalanceService().clearBalanceCache(userIds);
  }

  private buildGetTransactionsQueryBase(
    params: TransactionFilterParameters = {},
  ): SelectQueryBuilder<Transaction> {
    // Extract fromDate and tillDate, as they cannot be directly passed to QueryFilter.
    const { fromDate, tillDate, ...p } = params;

    // Mapping for sub-transaction-related filters
    const subFilterMapping: FilterMapping = {
      transactionId: 'transaction.id',
      toId: 'subTransaction.toId',
      pointOfSaleId: 'transaction.pointOfSalePointOfSaleId',
      pointOfSaleRevision: 'transaction.pointOfSaleRevision',
      containerId: 'subTransaction.containerContainerId',
      containerRevision: 'subTransaction.containerRevision',
      productId: 'subTransactionRow.productProductId',
      invoiceId: 'subTransactionRow.invoice',
      productRevision: 'subTransactionRow.productRevision',
    };

    // Mapping for main transaction filters
    const mainFilterMapping: FilterMapping = {
      fromId: 'transaction.fromId',
      createdById: 'transaction.createdById',
    };

    // Build the query with all necessary joins
    const query = this.manager.createQueryBuilder(Transaction, 'transaction')
      .leftJoinAndSelect('transaction.from', 'from')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
      .withDeleted()
      .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
      .withDeleted()
      .leftJoin('transaction.subTransactions', 'subTransaction')
      .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
      .leftJoin('subTransactionRow.product', 'product')
      .addSelect('SUM(subTransactionRow.amount * product.priceInclVat)', 'value')
      .groupBy('transaction.id')
      .addGroupBy('from.id')
      .addGroupBy('createdBy.id')
      .addGroupBy('pointOfSaleRev.pointOfSaleId')
      .addGroupBy('pointOfSaleRev.revision')
      .addGroupBy('pointOfSale.id');

    // Transaction main filters
    if (p.excludeById) {
      query.andWhere('createdById != :excludeById', { excludeById: p.excludeById });
    }
    if (p.excludeFromId) {
      query.andWhere('transaction.fromId != :excludeFromId', { excludeFromId: p.excludeFromId });
    }

    if (fromDate) {
      query.andWhere('transaction.createdAt >= :fromDate', { fromDate: toMySQLString(fromDate) });
    }
    if (tillDate) {
      query.andWhere('transaction.createdAt < :tillDate', { tillDate: toMySQLString(tillDate) });
    }

    QueryFilter.applyFilter(query, mainFilterMapping, p);
    QueryFilter.applyFilter(query, subFilterMapping, p);

    return query;
  }

  private buildGetTransactionsQuery(
    params: TransactionFilterParameters = {},
  ): SelectQueryBuilder<Transaction> {
    const query = this.buildGetTransactionsQueryBase(params);
    query.orderBy({ 'transaction.createdAt': 'DESC' });
    return query;
  }

  /**
   * Converts a raw transaction object to a BaseTransactionResponse
   * @param o - The raw transaction object
   * @private
   */
  private mapRawTransactionToResponse(o: any): BaseTransactionResponse {
    const value = DineroTransformer.Instance.from(o.value || 0);
    return {
      id: o.transaction_id,
      createdAt: utcToDate(o.transaction_createdAt).toISOString(),
      updatedAt: utcToDate(o.transaction_updatedAt).toISOString(),
      from: {
        id: o.from_id,
        createdAt: utcToDate(o.from_createdAt).toISOString(),
        updatedAt: utcToDate(o.from_updatedAt).toISOString(),
        firstName: o.from_firstName,
        lastName: o.from_lastName,
      },
      createdBy: o.createdBy_id ? {
        id: o.createdBy_id,
        createdAt: utcToDate(o.createdBy_createdAt).toISOString(),
        updatedAt: utcToDate(o.createdBy_updatedAt).toISOString(),
        firstName: o.createdBy_firstName,
        lastName: o.createdBy_lastName,
      } : undefined,
      pointOfSale: {
        id: o.pointOfSale_id,
        createdAt: utcToDate(o.pointOfSale_createdAt).toISOString(),
        updatedAt: utcToDate(o.pointOfSaleRev_updatedAt).toISOString(),
        name: o.pointOfSaleRev_name,
        revision: o.pointOfSaleRev_revision,
        useAuthentication: Boolean(o.pointOfSaleRev_useAuthentication),
      },
      value: value.toObject(),
    };
  }

  /**
   * Returns all transactions requested with the filter
   *
   * We split the queries into two parts, instead of using a OR WHERE clause.
   * This is because "OR" queries between table indices require a full table scan.
   *
   * We use UNION to combine the two queries, and then apply the pagination.
   *
   * @param {TransactionFilterParameters} params - the filter parameters
   * @param {PaginationParameters} pagination
   * @param user - A user that is involved in all transactions
   * @private
   */
  private async getUsersTransactionQuery(
    params: TransactionFilterParameters,
    pagination: PaginationParameters,
    user: User,
  ): Promise<PaginatedBaseTransactionResponse> {
    const { take, skip } = pagination;

    // For the "from" side
    const qbFrom = this.buildGetTransactionsQueryBase({
      ...params,
      fromId: user.id,
    });

    // For the "to" side
    const qbTo = this.buildGetTransactionsQueryBase({
      ...params,
      toId: user.id,
    });

    // Convert to positional SQL and params
    const { sql: sqlFromPos, values: valsFrom } = convertToPositional(
      qbFrom.getQuery(),
      qbFrom.getParameters(),
    );
    const { sql: sqlToPos, values: valsTo } = convertToPositional(
      qbTo.getQuery(),
      qbTo.getParameters(),
    );

    // Combine for UNION, use positional params
    const unionSql = `
    SELECT * FROM (
      ${sqlFromPos}
      UNION
      ${sqlToPos}
    ) AS merged
    ORDER BY merged.transaction_createdAt DESC
    ` + (take !== undefined && skip !== undefined ? ' LIMIT ? OFFSET ?' : '');

    const allParams = take !== undefined && skip !== undefined
      ? [...valsFrom, ...valsTo, take, skip]
      : [...valsFrom, ...valsTo];

    const countSql = `
    SELECT COUNT(*) as total FROM (
      ${sqlFromPos}
      UNION
      ${sqlToPos}
    ) AS merged
  `;
    const countParams = [...valsFrom, ...valsTo];

    const recordsRaw = await this.manager.query(unionSql, allParams);
    const [{ total }] = await this.manager.query(countSql, countParams);
    const records = recordsRaw.map(this.mapRawTransactionToResponse);

    return {
      records,
      _pagination: {
        take,
        skip,
        count: Number(total),
      },
    };
  }

  /**
   * Returns all transactions requested with the filter
   * @param {TransactionFilterParameters.model} params - the filter parameters
   * @param {PaginationParameters} pagination
   * @param {User.model} user - A user that is involved in all transactions
   * @returns {BaseTransactionResponse[]} - the transactions without sub transactions
   */
  public async getTransactions(
    params: TransactionFilterParameters, pagination: PaginationParameters = {}, user?: User,
  ): Promise<PaginatedBaseTransactionResponse> {
    const { take, skip } = pagination;

    if (user) {
      return this.getUsersTransactionQuery(params, pagination, user);
    }

    const builder = this.buildGetTransactionsQuery(params);
    const results = await Promise.all([
      builder.limit(take).offset(skip).getRawMany(),
      builder.getCount(),
    ]);

    const records = results[0].map(this.mapRawTransactionToResponse);

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Saves a transaction to the database, the transaction request should be verified beforehand
   * @param {TransactionRequest.model} req - the transaction request to save
   * @param context - transaction context with loaded entities (required)
   * @returns {TransactionResponse.model} - the saved transaction
   */
  public async createTransaction(
    req: TransactionRequest,
    context: TransactionContext,
  ): Promise<TransactionResponse | undefined> {
    const transaction = await this.asTransaction(req, context);

    // Use manager.save() instead of entity.save() for better batch performance
    // TypeORM will handle cascade saves more efficiently with manager.save()
    const savedTransaction = await this.manager.save(Transaction, transaction);
    
    if (savedTransaction.from.inactiveNotificationSend === true) {
      await UserService.updateUser(savedTransaction.from.id, { inactiveNotificationSend: false });
    }

    // save transaction and return response using cached cost and context
    const transactionResponse = await this.asTransactionResponse(savedTransaction, context.totalCost, context);
    
    // Emit WebSocket event for transaction creation (fire-and-forget to not block transaction flow)
    if (transactionResponse) {
      void WebSocketService.emitTransactionCreated(transactionResponse).catch((error) => {
        // Log error but don't fail transaction creation if WebSocket emission fails
        log4js.getLogger('TransactionService').error('Failed to emit transaction created event:', error);
      });
    }
    
    return transactionResponse;
  }

  /**
   * Gets a single transaction from the database by id
   * @param {integer} id - the id of the requested transaction
   * @returns {Transaction.model} - the requested transaction transaction
   */
  public async getSingleTransaction(id: number): Promise<TransactionResponse | undefined> {
    const transaction = await this.manager.findOne(Transaction, {
      where: { id },
      relations: [
        'from', 'createdBy', 'subTransactions', 'subTransactions.to', 'subTransactions.subTransactionRows',
        // We query a lot here, but we will parse this later to a very simple BaseResponse
        'pointOfSale', 'pointOfSale.pointOfSale',
        'subTransactions.container', 'subTransactions.container.container',
        'subTransactions.subTransactionRows.product', 'subTransactions.subTransactionRows.product.product',
        'subTransactions.subTransactionRows.product.vat',
      ],
      withDeleted: true,
    });

    return this.asTransactionResponse(transaction);
  }

  /**
   * Updates a transaction and its user relations in the database
   * @param {string} id - requested transaction id
   * @param {TransactionRequest.model} req - new transaction request
   * @returns {TransactionResponse.model} updated transaction
   * @returns {undefined} undefined when transaction not found
   */
  public async updateTransaction(id: number, req: TransactionRequest):
  Promise<TransactionResponse | undefined> {
    // Verify and get context
    const verification = await this.verifyTransaction(req, true);
    if (!verification.valid || !verification.context) {
      return undefined;
    }

    const existingTransaction = await this.manager.findOne(Transaction, { where: { id } });
    const transaction = await this.asTransaction(req, verification.context, existingTransaction);

    // delete old transaction
    await this.deleteTransaction(id);

    // save updated transaction with same id
    await this.manager.save(Transaction, transaction);

    // invalidate updated transaction user balance cache
    const updatedTransaction = await this.getSingleTransaction(id);
    await TransactionService.invalidateBalanceCache(updatedTransaction);

    // return updatedTransaction;
    return updatedTransaction;
  }

  /**
   * Deletes a transaction
   * @param {number} id - the id of the requested transaction
   * @returns {TransactionResponse.model} - the deleted transaction
   */
  public async deleteTransaction(id: number):
  Promise<TransactionResponse | undefined> {
    // get the transaction we should delete
    const transaction = await this.getSingleTransaction(id);
    await this.manager.delete(Transaction, id);

    // invalidate user balance cache
    await TransactionService.invalidateBalanceCache(transaction);

    // return deleted transaction
    return transaction;
  }

  /**
   * Converts a transactionReport to a TransactionReportResponse
   * @param transactionReport
   * @private
   */
  private static transactionReportToResponse(transactionReport: TransactionReport): TransactionReportResponse {
    const categories: TransactionReportCategoryEntryResponse[] = [];
    transactionReport.data.categories.forEach((entry) => {
      const category: TransactionReportCategoryEntryResponse = {
        category: ProductCategoryService.asProductCategoryResponse(entry.category),
        totalExclVat: dinero({ amount : Math.round(entry.totalExclVat) }).toObject(),
        totalInclVat: entry.totalInclVat.toObject() as DineroObjectResponse,
      };
      categories.push(category);
    });

    let totalExclVat = 0;
    let totalInclVat = 0;

    const entries: TransactionReportEntryResponse[] = [];
    transactionReport.data.entries.forEach((productEntry) => {
      const count = productEntry.count;
      const amountInclVat = productEntry.product.priceInclVat.getAmount() * count;
      const amountExclVat = amountInclVat / (1 + (productEntry.product.vat.percentage / 100));
      totalInclVat += amountInclVat;
      totalExclVat += amountExclVat;
      const entry: TransactionReportEntryResponse = {
        count,
        product: parseProductToBaseResponse(productEntry.product, false),
        totalExclVat: dinero({ amount: Math.round(amountExclVat) }).toObject(),
        totalInclVat: dinero({ amount: amountInclVat }).toObject(),
      };
      entries.push(entry);
    });

    const vat: TransactionReportVatEntryResponse[] = [];
    transactionReport.data.vat.forEach((vatEntry) => {
      const entry: TransactionReportVatEntryResponse = {
        totalExclVat: dinero({ amount: Math.round(vatEntry.totalExclVat) }).toObject(),
        totalInclVat: vatEntry.totalInclVat.toObject(),
        vat: parseVatGroupToResponse(vatEntry.vat),
      };
      vat.push(entry);
    });

    const data: TransactionReportDataResponse = {
      categories,
      entries,
      vat,
    };

    return {
      data,
      parameters: transactionReport.parameters,
      totalExclVat: dinero({ amount: Math.round(totalExclVat) }).toObject(),
      totalInclVat: dinero({ amount: totalInclVat }).toObject(),
    };
  }

  /**
   * Generates a transaction report object from the given transaction filter parameters
   * @param parameters - Parameters describing what should be included in the report
   */
  public async getTransactionReport(parameters: TransactionFilterParameters): Promise<TransactionReport> {
    let baseTransactions = (await this.getTransactions(parameters)).records;

    const transactionReportData = await this.getTransactionReportData(baseTransactions, parameters.exclusiveToId ? parameters.toId : undefined);
    return {
      data: transactionReportData,
      parameters,
    };
  }

  /**
   * Creates a transaction report response from the given parameters
   * @param parameters
   */
  public async getTransactionReportResponse(parameters: TransactionFilterParameters): Promise<TransactionReportResponse> {
    const transactionReport = await this.getTransactionReport(parameters);
    return TransactionService.transactionReportToResponse(transactionReport);
  }

  public async getTransactionsFromBaseTransactions(baseTransactions: BaseTransactionResponse[], dropInvoiced = true): Promise<Transaction[]> {
    const ids = baseTransactions.map((t) => t.id);

    let transactions = await this.manager.find(Transaction, {
      where: {
        id: In(ids),
      },
      relations: [
        'subTransactions',
        'from',
        'subTransactions.to',
        'subTransactions.subTransactionRows',
        'subTransactions.subTransactionRows.product',
        'subTransactions.subTransactionRows.product.category',
        'subTransactions.subTransactionRows.product.product',
        'subTransactions.subTransactionRows.product.vat',
        'subTransactions.subTransactionRows.invoice',
      ],
    });

    // Don't consider transactions from invoice accounts
    if (dropInvoiced) {
      const invoiceUsers = new Set((await this.manager.find(User, { where: { type: In([UserType.INVOICE]) } })).map((u) => u.id));
      transactions = transactions.filter((t) => !invoiceUsers.has(t.from.id));
    }

    return transactions;
  }

  /**
   * Creates TransactionReportData for the given baseTransactions
   * @param baseTransactions - Transactions to parse
   * @param exclusiveToId - If not undefined it will drop all Sub transactions with a toId different from the param.
   * @param dropInvoiced - If invoiced SubTransactionRows should be ignored, defaults to true
   */
  public async getTransactionReportData(baseTransactions: BaseTransactionResponse[], exclusiveToId: number | undefined, dropInvoiced = true): Promise<TransactionReportData> {
    const transactions = await this.getTransactionsFromBaseTransactions(baseTransactions, dropInvoiced);

    const productEntryMap = new Map<string, SubTransactionRow[]>();
    const vatEntryMap = new Map<number, SubTransactionRow[]>();
    const categoryEntryMap = new Map<number, SubTransactionRow[]>();

    let subTransactions = transactions.reduce<SubTransaction[]>((acc, cur) => acc.concat(cur.subTransactions), []);

    if (exclusiveToId) {
      subTransactions = subTransactions.filter((st) => st.to.id === exclusiveToId);
    }

    const subTransactionRows = subTransactions.reduce<SubTransactionRow[]>((acc, cur) => acc.concat(cur.subTransactionRows), []);

    subTransactionRows.forEach((tSubRow) => {
      if (dropInvoiced && tSubRow.invoice) return;
      collectProductsByRevision(productEntryMap, tSubRow);
      collectProductsByCategory(categoryEntryMap, tSubRow);
      collectProductsByVat(vatEntryMap, tSubRow);
    });

    return {
      categories: reduceMapToCategoryEntries(categoryEntryMap),
      entries: reduceMapToReportEntries(productEntryMap),
      vat: reduceMapToVatEntries(vatEntryMap),
    };
  }
}
