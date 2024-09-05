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
import dinero from 'dinero.js';
import { FindManyOptions, FindOptionsWhere, Raw } from 'typeorm';
import Transfer from '../entity/transactions/transfer';
import { PaginatedTransferResponse, TransferResponse } from '../controller/response/transfer-response';
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
import WithManager from '../with-manager';

export interface TransferFilterParameters {
  id?: number;
  fromId?: number,
  toId?: number
  fromDate?: Date,
  tillDate?: Date,
}

export function parseGetTransferFilters(req: RequestWithToken): TransferFilterParameters {
  return {
    id: asNumber(req.query.id),
    fromId: asNumber(req.query.id),
    toId: asNumber(req.query.id),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
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
      vat: transfer.vat ? parseVatGroupToResponse(transfer.vat) : null,
    };
  }

  public async createTransfer(request: TransferRequest) : Promise<Transfer> {
    return this.manager.getRepository(Transfer).save({
      createdAt: request.createdAt ? new Date(request.createdAt) : undefined,
      description: request.description,
      amountInclVat: dinero(request.amount as Dinero.Options),
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
    : Promise<PaginatedTransferResponse> {
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
        fine: { userFineGroup: { user: true } },
        waivedFines: { fines: { userFineGroup: true } },
      },
      take,
      skip,
      order: { createdAt: 'DESC' },
    };

    const results = await Promise.all([
      this.manager.find(Transfer, options),
      this.manager.count(Transfer, options),
    ]);

    const records = results[0].map((rawTransfer) => TransferService.asTransferResponse(rawTransfer));
    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  public async postTransfer(request: TransferRequest) : Promise<TransferResponse> {
    const transfer = await this.createTransfer(request);
    return TransferService.asTransferResponse(transfer);
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
}
