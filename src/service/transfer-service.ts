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
 * This is the module page of transfer-service.
 *
 * @module transfers
 */

import dinero, { Dinero } from 'dinero.js';
import { FindManyOptions, FindOptionsWhere, Raw } from 'typeorm';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import Transfer from '../entity/transactions/transfer';
import { TransferResponse } from '../controller/response/transfer-response';
import TransferRequest from '../controller/request/transfer-request';
import User from '../entity/user/user';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { PaginationParameters } from '../helpers/pagination';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate, asNumber } from '../helpers/validators';
import { parseUserToBaseResponse, parseVatGroupToResponse } from '../helpers/revision-to-response';
import InvoiceService from './invoice-service';
import StripeService from './stripe-service';
import PayoutRequestService from './payout-request-service';
import DebtorService from './debtor-service';
import VatGroup from '../entity/vat-group';
import { toMySQLString } from '../helpers/timestamps';
import WriteOffService from './write-off-service';
import SellerPayoutService from './seller-payout-service';
import WithManager from '../database/with-manager';
import UserService from './user-service';
import BalanceService from './balance-service';

export interface TransferFilterParameters {
  id?: number;
  fromId?: number,
  toId?: number
  fromDate?: Date,
  tillDate?: Date,
}

export enum TransferCategory {
  DEPOSIT = 'deposit',
  PAYOUT_REQUEST = 'payoutRequest',
  SELLER_PAYOUT = 'sellerPayout',
  INVOICE = 'invoice',
  CREDIT_INVOICE = 'creditInvoice',
  FINE = 'fine',
  WAIVED_FINES = 'waivedFines',
  WRITE_OFF = 'writeOff',
  INACTIVE_ADMINISTRATIVE_COST = 'inactiveAdministrativeCost',
  /**
   * Orphaned transfer with no entity attached where fromId IS NULL — money entering the system
   * without a linked deposit, invoice, etc.
   */
  MANUAL_CREATION = 'manualCreation',
  /**
   * Orphaned transfer with no entity attached where toId IS NULL — money leaving the system
   * without a linked payout request, invoice, etc.
   */
  MANUAL_DELETION = 'manualDeletion',
}

export interface TransferAggregateResult {
  total: Dinero;
  count: number;
}

export interface TransferSummaryResult {
  total: TransferAggregateResult;
  deposits: TransferAggregateResult;
  payoutRequests: TransferAggregateResult;
  sellerPayouts: TransferAggregateResult;
  invoices: TransferAggregateResult;
  creditInvoices: TransferAggregateResult;
  fines: TransferAggregateResult;
  waivedFines: TransferAggregateResult;
  writeOffs: TransferAggregateResult;
  inactiveAdministrativeCosts: TransferAggregateResult;
  manualCreations: TransferAggregateResult;
  manualDeletions: TransferAggregateResult;
}

export interface TransferAggregateFilterParameters {
  fromId?: number,
  toId?: number,
  fromDate?: Date,
  tillDate?: Date,
  category?: TransferCategory,
}

export function parseGetTransferFilters(req: RequestWithToken): TransferFilterParameters {
  return {
    id: asNumber(req.query.id),
    fromId: asNumber(req.query.fromId),
    toId: asNumber(req.query.toId),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };
}

export function parseGetTransferSummaryFilters(req: RequestWithToken): Omit<TransferAggregateFilterParameters, 'category'> {
  return {
    fromId: asNumber(req.query.fromId),
    toId: asNumber(req.query.toId),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };
}

export function parseGetTransferAggregateFilters(req: RequestWithToken): TransferAggregateFilterParameters {
  const { category } = req.query;
  if (category !== undefined && !Object.values(TransferCategory).includes(category as TransferCategory)) {
    throw new Error(`Invalid category '${category}'. Must be one of: ${Object.values(TransferCategory).join(', ')}`);
  }
  return {
    fromId: asNumber(req.query.fromId),
    toId: asNumber(req.query.toId),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
    category: category as TransferCategory | undefined,
  };
}

export default class TransferService extends WithManager {
  public static asTransferResponse(transfer: Transfer) : TransferResponse {
    return {
      amountInclVat: transfer.amountInclVat.toObject(),
      amount: transfer.amountInclVat.toObject(),
      from: parseUserToBaseResponse(transfer.from, false),
      to: parseUserToBaseResponse(transfer.to, false),
      id: transfer.id,
      description: transfer.description,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
      invoice: transfer.invoice ? InvoiceService.asBaseInvoiceResponse(transfer.invoice) : null,
      deposit: transfer.deposit ? StripeService.asStripeDepositResponse(transfer.deposit) : null,
      payoutRequest: transfer.payoutRequest ? PayoutRequestService.asBasePayoutRequestResponse(transfer.payoutRequest) : null,
      fine: transfer.fine ? DebtorService.asFineResponse(transfer.fine) : null,
      waivedFines: transfer.waivedFines ? DebtorService.asUserFineGroupResponse(transfer.waivedFines) : null,
      writeOff: transfer.writeOff ? WriteOffService.asBaseWriteOffResponse(transfer.writeOff) : null,
      inactiveAdministrativeCost: transfer.inactiveAdministrativeCost ? transfer.inactiveAdministrativeCost.toBaseResponse() : null,
      sellerPayout: transfer.sellerPayout ? SellerPayoutService.asSellerPayoutResponse(transfer.sellerPayout) : null,
      vat: transfer.vat ? parseVatGroupToResponse(transfer.vat) : null,
    };
  }

  public async createTransfer(request: TransferRequest) : Promise<Transfer> {
    return this.manager.getRepository(Transfer).save({
      createdAt: request.createdAt ? new Date(request.createdAt) : undefined,
      description: request.description,
      amountInclVat: dinero(request.amount),
      from: request.fromId ? await this.manager.findOne(User, { where: { id: request.fromId } }) : undefined,
      to: request.toId ? await this.manager.findOne(User, { where: { id: request.toId } }) : undefined,
      vat: request.vatId ? await this.manager.findOne(VatGroup, { where: { id: request.vatId } }) : undefined,
    });
  }

  /**
   * Query to return transfers from the database
   * @param filters - Parameters to query the transfers with
   * @param pagination
   * @param user
   */
  public async getTransfers(filters: TransferFilterParameters = {},
    pagination: PaginationParameters = {}, user?: User)
    : Promise<[Transfer[], number]> {
    const { take, skip } = pagination;

    const filterMapping: FilterMapping = {
      id: 'id',
      fromId: 'fromId',
      toId: 'toId',
      type: 'type',
    };

    let whereClause: FindOptionsWhere<Transfer> = QueryFilter.createFilterWhereClause(filterMapping, filters);

    // Apply from/till date filters
    if (filters.fromDate && filters.tillDate) {
      whereClause = {
        ...whereClause,
        createdAt: Raw(
          (alias) => `${alias} >= :fromDate AND ${alias} < :tillDate`,
          { fromDate: toMySQLString(filters.fromDate), tillDate: toMySQLString(filters.tillDate) },
        ),
      };
    } else if (filters.fromDate) {
      whereClause = {
        ...whereClause,
        createdAt: Raw(
          (alias) => `${alias} >= :fromDate`,
          { fromDate: toMySQLString(filters.fromDate) },
        ),
      };
    } else if (filters.tillDate) {
      whereClause = {
        ...whereClause,
        createdAt: Raw(
          (alias) => `${alias} < :tillDate`,
          { tillDate: toMySQLString(filters.tillDate) },
        ),
      };
    }
    let whereOptions: any = [];

    // Apparently this is how you make a and-or clause in typeorm without a query builder.
    if (user) {
      whereOptions = [{
        fromId: user.id,
        ...whereClause,
      }, {
        toId: user.id,
        ...whereClause,
      }];
    } else {
      whereOptions = whereClause;
    }

    const options: FindManyOptions<Transfer> = {
      where: whereOptions,
      relations: {
        from: true, to: true, vat: true, writeOff: true,
        invoice: { invoiceStatus: true, transfer: true },
        deposit: { stripePaymentIntent: { paymentIntentStatuses: true } },
        payoutRequest: { payoutRequestStatus: true, requestedBy: true },
        sellerPayout: { requestedBy: true },
        fine: { userFineGroup: { user: true } },
        waivedFines: { fines: { userFineGroup: true } },
        inactiveAdministrativeCost: {  transfer: true  },
      },
      take,
      skip,
      order: { createdAt: 'DESC' },
    };

    return Promise.all([
      this.manager.find(Transfer, options),
      this.manager.count(Transfer, options),
    ]);
  }

  public async postTransfer(request: TransferRequest) : Promise<Transfer> {
    const transfer = await this.createTransfer(request);
    if (transfer.from != undefined && transfer.from.inactiveNotificationSend == true) {
      await UserService.updateUser(transfer.fromId, { inactiveNotificationSend: false });
    }
    return transfer;
  }

  public async verifyTransferRequest(request: TransferRequest) : Promise<boolean> {
    // the type of the request should be in TransferType enums
    // if the type is custom a description is necessary
    // a transfer is always at least from a valid user OR to a valid user
    // a transfer may be from null to an user, or from an user to null
    return (request.fromId || request.toId)
        && (await this.manager.findOne(User, { where: { id: request.fromId } })
        || await this.manager.findOne(User, { where: { id: request.toId } }))
        && request.amount.precision === dinero.defaultPrecision
        && request.amount.currency === dinero.defaultCurrency;
  }

  /**
   * Returns the aggregate (SUM and COUNT) of transfers matching the given filters.
   * The aggregation is performed entirely on the database side.
   * @param filters - Optional filters to narrow the set of transfers
   */
  public async getTransferAggregate(filters: TransferAggregateFilterParameters = {}): Promise<TransferAggregateResult> {
    const categoryRelationMap: Partial<Record<TransferCategory, string>> = {
      [TransferCategory.DEPOSIT]: 'deposit',
      [TransferCategory.PAYOUT_REQUEST]: 'payoutRequest',
      [TransferCategory.SELLER_PAYOUT]: 'sellerPayout',
      [TransferCategory.INVOICE]: 'invoice',
      [TransferCategory.CREDIT_INVOICE]: 'creditInvoice',
      [TransferCategory.FINE]: 'fine',
      [TransferCategory.WAIVED_FINES]: 'waivedFines',
      [TransferCategory.WRITE_OFF]: 'writeOff',
      [TransferCategory.INACTIVE_ADMINISTRATIVE_COST]: 'inactiveAdministrativeCost',
    };

    const excludeAllCategories = (q: typeof query) => {
      for (const category of Object.values(categoryRelationMap)) {
        q = q.leftJoin(`transfer.${category}`, category)
          .andWhere(`${category}.id IS NULL`);
      }
      return q;
    };

    let query = this.manager.createQueryBuilder(Transfer, 'transfer');

    if (filters.category !== undefined) {
      switch (filters.category) {
        case TransferCategory.MANUAL_CREATION:
          query = excludeAllCategories(query)
            .andWhere('transfer.fromId IS NULL');
          break;
        case TransferCategory.MANUAL_DELETION:
          query = excludeAllCategories(query)
            .andWhere('transfer.toId IS NULL');
          break;
        default: {
          const rel = categoryRelationMap[filters.category];
          if (!rel) throw new Error(`Unsupported transfer category: ${filters.category}`);
          query = query.innerJoin(`transfer.${rel}`, rel);
        }
      }
    }

    if (filters.fromId !== undefined) {
      query = query.andWhere('transfer.fromId = :fromId', { fromId: filters.fromId });
    }
    if (filters.toId !== undefined) {
      query = query.andWhere('transfer.toId = :toId', { toId: filters.toId });
    }
    if (filters.fromDate) {
      query = query.andWhere('transfer.createdAt >= :fromDate', { fromDate: toMySQLString(filters.fromDate) });
    }
    if (filters.tillDate) {
      query = query.andWhere('transfer.createdAt < :tillDate', { tillDate: toMySQLString(filters.tillDate) });
    }

    const result = await query
      .select('COALESCE(SUM(transfer.amountInclVat), 0)', 'total')
      .addSelect('COUNT(transfer.id)', 'count')
      .getRawOne();

    return {
      total: DineroTransformer.Instance.from(parseInt(result?.total ?? '0', 10)),
      count: parseInt(result?.count ?? '0', 10),
    };
  }

  /**
   * Returns an aggregate breakdown of transfers for every category plus an overall total.
   * All filters except `category` are forwarded to each per-category query.
   * @param filters - Optional filters (fromId, toId, fromDate, tillDate)
   */
  public async getTransferSummary(filters: Omit<TransferAggregateFilterParameters, 'category'> = {}): Promise<TransferSummaryResult> {
    const [total, deposits, payoutRequests, sellerPayouts, invoices, creditInvoices, fines, waivedFines, writeOffs, inactiveAdministrativeCosts, manualCreations, manualDeletions] = await Promise.all([
      this.getTransferAggregate(filters),
      this.getTransferAggregate({ ...filters, category: TransferCategory.DEPOSIT }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.PAYOUT_REQUEST }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.SELLER_PAYOUT }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.INVOICE }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.CREDIT_INVOICE }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.FINE }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.WAIVED_FINES }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.WRITE_OFF }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.INACTIVE_ADMINISTRATIVE_COST }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.MANUAL_CREATION }),
      this.getTransferAggregate({ ...filters, category: TransferCategory.MANUAL_DELETION }),
    ]);

    return { total, deposits, payoutRequests, sellerPayouts, invoices, creditInvoices, fines, waivedFines, writeOffs, inactiveAdministrativeCosts, manualCreations, manualDeletions };
  }

  public async deleteTransfer(id: number): Promise<void> {
    const transfer = await this.manager.findOne(Transfer, {
      where: { id },
      relations: ['from', 'to', 'payoutRequest', 'sellerPayout', 'deposit', 'invoice', 'creditInvoice', 'fine', 'writeOff', 'waivedFines', 'inactiveAdministrativeCost'],
    });

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.payoutRequest || transfer.sellerPayout || transfer.deposit || transfer.invoice || transfer.creditInvoice || transfer.fine || transfer.writeOff || transfer.waivedFines || transfer.inactiveAdministrativeCost) {
      throw new Error('Cannot delete transfer because it is referenced by another entity');
    }

    await this.manager.delete(Transfer, id);

    await TransferService.invalidateBalanceCaches(transfer);
  }

  public static async invalidateBalanceCaches(transfer: Transfer): Promise<void> {
    // both the from and to users' balances are affected by a transfer
    const userIds: number[] = [];
    if (transfer.from?.id !== undefined) {
      userIds.push(transfer.from.id);
    }
    if (transfer.to?.id !== undefined) {
      userIds.push(transfer.to.id);
    }

    if (userIds.length > 0) {
      await new BalanceService().clearBalanceCache(userIds);
    }
  }
}
