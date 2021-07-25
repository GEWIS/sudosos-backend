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
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import { RequestWithToken } from '../middleware/token-middleware';
import {
  BaseTransactionResponse,
  TransactionResponse,
  SubTransactionResponse,
  SubTransactionRowResponse,
} from '../controller/response/transaction-response';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import { addPaginationToQueryBuilder } from '../helpers/pagination';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import {
  parseContainerToBaseResponse,
  parsePOSToBasePOS,
  parseProductToBaseResponse,
} from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { SubTransactionRequest, SubTransactionRowRequest, TransactionRequest } from '../controller/request/transaction-request';
import User from '../entity/user/user';
import ContainerRevision from '../entity/container/container-revision';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import ProductRevision from '../entity/product/product-revision';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import Container from '../entity/container/container';
import Product from '../entity/product/product';

export interface TransactionFilterParameters {
  fromId?: number,
  createdById?: number,
  toId?: number,
  pointOfSaleId?: number,
  pointOfSaleRevision?: number,
  containerId?: number,
  containerRevision?: number,
  productId?: number,
  productRevision?: number,
  fromDate?: Date,
  tillDate?: Date,
}

export default class TransactionService {
  /**
   * Verifies whether a user has a sufficient balance to complete the transaction
   * @param {TransactionRequest.model} req - the transaction request to verify
   * @returns {boolean} - whether user's balance is ok or not
   */
  public static async verifyBalance(req: TransactionRequest): Promise<boolean> {
    // check whether from user has sufficient balance
    let totalCost: number = 0;

    // sum costs of the transaction
    await Promise.all(req.subtransactions.map(async (subTransaction) => {
      await Promise.all(subTransaction.subTransactionRows.map(async (row) => {
        const product = await ProductRevision.findOne({
          revision: row.product.revision,
          product: {
            id: row.product.id,
          },
        });
        totalCost += DineroTransformer.Instance.to(product.price) * row.amount;
      }));
    }));

    // TODO: get user balance and compare
    return totalCost > 0;
  }

  /**
   * Verifies whether a sub transaction row within a sub transaction is valid
   * @param {SubTransactionRowRequest.model} req - the sub transaction row request to verify
   * @returns {boolean} - whether sub transaction row is ok or not
   */
  public static async verifySubTransactionRow(req: SubTransactionRowRequest): Promise<boolean> {
    // check if product exists in database and correct current revision is provided
    if (!req.product) {
      return false;
    }
    const product = await Product.findOne(req.product.id);
    if (!product || product.currentRevision !== req.product.revision) {
      return false;
    }

    // check whether amount is correct
    return req.amount > 0 && Number.isInteger(req.amount);
  }

  /**
   * Verifies whether a sub transaction within a transaction is valid
   * @param {SubTransactionRequest.model} req - the sub transaction request to verify
   * @returns {boolean} - whether sub transaction is ok or not
   */
  public static async verifySubTransaction(req: SubTransactionRequest): Promise<boolean> {
    // check if container exists in database and correct current revision is provided
    if (!req.container) {
      return false;
    }
    const container = await Container.findOne(req.container.id);
    if (!container || container.currentRevision !== req.container.revision) {
      return false;
    }

    // check if to user exists in database
    if (!req.to) {
      return false;
    }
    if (!await User.findOne(req.to)) {
      return false;
    }

    // verify subtransaction rows
    return req.subTransactionRows.every((row) => this.verifySubTransactionRow(row));
  }

  /**
   * Verifies whether a transaction is valid
   * @param {TransactionRequest.model} req - the transaction request to verify
   * @returns {boolean} - whether transaction is ok or not
   */
  public static async verifyTransaction(req: TransactionRequest): Promise<boolean> {
    // check if point of sale exists in database and correct current revision is provided
    if (!req.pointOfSale) {
      return false;
    }
    const pointOfSale = await PointOfSale.findOne(req.pointOfSale.id);
    if (!pointOfSale || pointOfSale.currentRevision !== req.pointOfSale.revision) {
      return false;
    }

    // TODO: active users check
    // check if top level users exist in database
    if (!req.from || !req.createdBy) {
      return false;
    }
    const ids: number[] = [req.from];
    if (req.createdBy !== req.from) {
      ids.push(req.createdBy);
    }

    if (req.createdBy !== req.from) {
      if ((await User.findByIds([req.from, req.createdBy])).length !== 2) {
        return false;
      }
    } else if (!await User.findOne(req.from)) {
      return false;
    }

    // verify subtransactions
    return req.subtransactions.every((subtransaction) => this.verifySubTransaction(subtransaction));
  }

  /**
   * Creates a transaction from a transaction request
   * @param {TransactionRequest.model} req - the transaction request to cast
   * @returns {Transaction.model} - the transaction
   */
  public static async asTransaction(req: TransactionRequest): Promise<Transaction | undefined> {
    if (!req) {
      return undefined;
    }

    // init transaction
    const transaction = {} as Transaction;

    // get users
    transaction.from = await User.findOne(req.from);
    transaction.createdBy = await User.findOne(req.createdBy);

    // set subtransactions
    transaction.subTransactions = await Promise.all(req.subtransactions.map(
      async (subTransaction) => this.asSubTransaction(subTransaction),
    ));

    // get point of sale
    transaction.pointOfSale = await PointOfSaleRevision.findOne({
      where: [{ revision: req.pointOfSale.revision }, { pointOfSale: req.pointOfSale.id }],
    });

    return transaction;
  }

  /**
   * Creates a transaction response from a transaction
   * @param {Transaction.model} req - the transaction to cast
   * @returns {TransactionResponse.model} - the transaction response
   */
  public static asTransactionResponse(transaction: Transaction): TransactionResponse | undefined {
    if (!transaction) {
      return undefined;
    }

    return {
      id: transaction.id,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      from: parseUserToBaseResponse(transaction.from, false),
      createdBy: parseUserToBaseResponse(transaction.createdBy, false),
      subTransactions: transaction.subTransactions.map(
        (subTransaction) => this.asSubTransactionResponse(subTransaction),
      ),
      pointOfSale: parsePOSToBasePOS(transaction.pointOfSale, false),
    } as TransactionResponse;
  }

  /**
   * Creates a sub transaction from a sub transaction request
   * @param {SubTransactionRequest.model} req - the sub transaction request to cast
   * @returns {SubTransaction.model} - the sub transaction
   */
  public static async asSubTransaction(req: SubTransactionRequest):
  Promise<SubTransaction | undefined> {
    if (!req) {
      return undefined;
    }

    // the subtransaction
    const subTransaction = {} as SubTransaction;

    // get user
    subTransaction.to = await User.findOne(req.to);

    // get container revision
    subTransaction.container = await ContainerRevision.findOne({
      where: [{ revision: req.container.revision }, { container: req.container.id }],
    });

    // sub transaction rows
    subTransaction.subTransactionRows = await Promise.all(req.subTransactionRows.map(
      async (row) => this.asSubTransactionRow(row, subTransaction),
    ));

    return subTransaction;
  }

  /**
   * Creates a sub transaction response from a sub transaction
   * @param {SubTransaction.model} req - the sub transaction to cast
   * @returns {SubTransactionResponse.model} - the sub transaction response
   */
  public static asSubTransactionResponse(subTransaction: SubTransaction):
  SubTransactionResponse | undefined {
    if (!SubTransaction) {
      return undefined;
    }
    return {
      id: subTransaction.id,
      to: parseUserToBaseResponse(subTransaction.to, false),
      container: parseContainerToBaseResponse(subTransaction.container, false),
      subTransactionRows: subTransaction.subTransactionRows.map((row) => ({
        id: row.id,
        product: parseProductToBaseResponse(row.product, false),
        amount: row.amount,
      } as SubTransactionRowResponse)),
    } as SubTransactionResponse;
  }

  /**
   * Creates a sub transaction row from a sub transaction row request
   * @param {SubTransactionRowRequest.model} req - the sub transaction row request to cast
   * @param {SubTransaction.model} subTransaction - the sub transaction to connect
   * @returns {SubTransactionRow.model} - the sub transaction row
   */
  public static async asSubTransactionRow(
    req: SubTransactionRowRequest, subTransaction: SubTransaction,
  ): Promise<SubTransactionRow | undefined> {
    if (!req) {
      return undefined;
    }
    const product = await ProductRevision.findOne({
      where: [{ revision: req.product.revision }, { product: req.product.id }],
    });
    return { product, amount: req.amount, subTransaction } as SubTransactionRow;
  }

  /**
   * Returns all transactions requested with the filter
   * @param {RequestWithToken.model} req - the request with token
   * @param {TransactionFilterParameters.model} params - the filter parameters
   * @returns {BaseTransactionResponse[]} - the transactions without sub transactions
   */
  public static async getTransactions(
    req: RequestWithToken, params: TransactionFilterParameters,
  ): Promise<BaseTransactionResponse[]> {
    // Extract fromDate and tillDate, as they cannot be directly passed to QueryFilter.
    const { fromDate, tillDate, ...p } = params;

    function applySubTransactionFilters(query: SelectQueryBuilder<any>): SelectQueryBuilder<any> {
      const mapping: FilterMapping = {
        toId: 'subTransaction.toId',
        pointOfSaleId: 'transaction.pointOfSalePointOfSale',
        pointOfSaleRevision: 'transaction.pointOfSaleRevision',
        containerId: 'subTransaction.containerContainer',
        containerRevision: 'subTransaction.containerRevision',
        productId: 'subTransactionRow.productProduct',
        productRevision: 'subTransactionRow.productRevision',
      };

      return QueryFilter.applyFilter(query, mapping, p);
    }

    let query = createQueryBuilder(Transaction, 'transaction')
      .addSelect((qb) => {
        const subquery = qb.subQuery()
          .select('sum(subTransactionRow.amount * product.price) as value')
          .from(SubTransaction, 'subTransaction')
          .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
          .leftJoin('subTransactionRow.product', 'product')
          .where('subTransaction.transactionId = transaction.id');

        return applySubTransactionFilters(subquery);
      }, 'value')
      .leftJoinAndSelect('transaction.from', 'from')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
      .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale')
      .leftJoin('transaction.subTransactions', 'subTransaction')
      .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow');

    if (fromDate) query.andWhere('"transaction"."createdAt" >= :fromDate', { fromDate: fromDate.toISOString() });
    if (tillDate) query.andWhere('"transaction"."createdAt" < :tillDate', { tillDate: tillDate.toISOString() });
    const mapping = {
      fromId: 'transaction.fromId',
      createdById: 'transaction.createdById',
    };
    QueryFilter.applyFilter(query, mapping, p);

    query = applySubTransactionFilters(query);
    query = addPaginationToQueryBuilder(req, query);

    const rawTransactions = await query.getRawMany();

    return rawTransactions.map((o) => {
      const value = DineroTransformer.Instance.from(o.value || 0);
      const v: BaseTransactionResponse = {
        id: o.transaction_id,
        createdAt: new Date(o.transaction_createdAt).toISOString(),
        updatedAt: new Date(o.transaction_updatedAt).toISOString(),
        from: {
          id: o.from_id,
          createdAt: new Date(o.from_createdAt).toISOString(),
          updatedAt: new Date(o.from_updatedAt).toISOString(),
          firstName: o.from_firstName,
          lastName: o.from_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.from_type,
        },
        createdBy: o.createdBy_id ? {
          id: o.createdBy_id,
          createdAt: new Date(o.createdBy_createdAt).toISOString(),
          updatedAt: new Date(o.createdBy_updatedAt).toISOString(),
          firstName: o.createdBy_firstName,
          lastName: o.createdBy_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.createdBy_type,
        } : undefined,
        pointOfSale: {
          id: o.pointOfSale_id,
          createdAt: new Date(o.pointOfSale_createdAt).toISOString(),
          updatedAt: new Date(o.pointOfSaleRev_updatedAt).toISOString(),
          name: o.pointOfSaleRev_name,
        },
        value: value.toObject(),
      };
      return v;
    });
  }

  /**
   * Saves a transaction to the database
   * @param {TransactionRequest.model} req - the transaction request to save
   * @returns {Transaction.model} - the saved transaction
   */
  public static async createTransaction(req: TransactionRequest):
  Promise<TransactionResponse | undefined> {
    const transaction = await this.asTransaction(req);

    // save transaction and return response
    return this.asTransactionResponse(await Transaction.save(transaction));
  }

  /**
   * Gets a single transaction from the database by id
   * @param {integer} id - the id of the requested transaction
   * @returns {Transaction.model} - the requested transaction transaction
   */
  public static async getSingleTransaction(id: number): Promise<TransactionResponse | undefined> {
    const transaction = await Transaction.findOne(id, {
      relations: [
        'from', 'createdBy', 'subTransactions', 'subTransactions.to', 'subTransactions.subTransactionRows',
        // We query a lot here, but we will parse this later to a very simple BaseResponse
        'pointOfSale', 'pointOfSale.pointOfSale',
        'subTransactions.container', 'subTransactions.container.container',
        'subTransactions.subTransactionRows.product', 'subTransactions.subTransactionRows.product.product',
      ],
    });

    return this.asTransactionResponse(transaction);
  }
}
