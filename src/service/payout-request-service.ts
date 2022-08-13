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
import Dinero, { Currency } from 'dinero.js';
import { PaginationParameters } from '../helpers/pagination';
import PayoutRequest from '../entity/transactions/payout-request';
import PayoutRequestStatus, { PayoutRequestState } from '../entity/transactions/payout-request-status';
import QueryFilter from '../helpers/query-filter';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import {
  BasePayoutRequestResponse,
  PaginatedBasePayoutRequestResponse,
  PayoutRequestResponse,
  PayoutRequestStatusResponse,
} from '../controller/response/payout-request-response';
import PayoutRequestRequest from '../controller/request/payout-request-request';
import User, { UserType } from '../entity/user/user';
import TransferService from './transfer-service';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate } from '../helpers/validators';
import { toMySQLString } from '../helpers/timestamps';

export interface PayoutRequestFilters {
  id?: number | number[],
  requestedById?: number | number[],
  approvedById?: number | number[],
  fromDate?: Date,
  tillDate?: Date,
  status?: PayoutRequestState[],
}

export function parseGetPayoutRequestsFilters(req: RequestWithToken): PayoutRequestFilters {
  const statuses = Object.values(PayoutRequestState);
  let parsedStatus;
  if (req.query.status != null) {
    if (!Array.isArray(req.query.status)) {
      parsedStatus = [req.query.status];
    } else {
      parsedStatus = req.query.status;
    }
    parsedStatus.forEach((status) => {
      if (!statuses.includes(status as PayoutRequestState)) throw TypeError('status is not of type PayoutRequestState');
    });
    parsedStatus = parsedStatus as PayoutRequestState[];
  } else {
    parsedStatus = undefined;
  }

  return {
    requestedById: QueryFilter.extractUndefinedNumberOrArray(req.query.requestedById),
    approvedById: QueryFilter.extractUndefinedNumberOrArray(req.query.approvedById),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
    status: parsedStatus,
  };
}

export default class PayoutRequestService {
  private static asPayoutRequestResponse(req: PayoutRequest): PayoutRequestResponse {
    return {
      id: req.id,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
      amount: {
        amount: req.amount.getAmount(),
        precision: req.amount.getPrecision(),
        currency: req.amount.getCurrency(),
      },
      bankAccountNumber: req.bankAccountNumber,
      bankAccountName: req.bankAccountName,
      requestedBy: {
        id: req.requestedBy.id,
        createdAt: req.requestedBy.createdAt.toISOString(),
        updatedAt: req.requestedBy.updatedAt.toISOString(),
        type: UserType[req.requestedBy.type],
        firstName: req.requestedBy.firstName,
        lastName: req.requestedBy.lastName,
        deleted: req.requestedBy.deleted,
        active: req.requestedBy.active,
      },
      approvedBy: req.approvedBy == null ? undefined : {
        id: req.approvedBy.id,
        createdAt: req.approvedBy.createdAt.toISOString(),
        updatedAt: req.approvedBy.updatedAt.toISOString(),
        type: UserType[req.approvedBy.type],
        firstName: req.approvedBy.firstName,
        lastName: req.approvedBy.lastName,
        deleted: req.approvedBy.deleted,
        active: req.approvedBy.active,
      },
      status: req.payoutRequestStatus.map((status): PayoutRequestStatusResponse => ({
        id: status.id,
        createdAt: status.createdAt.toISOString(),
        updatedAt: status.updatedAt.toISOString(),
        state: status.state,
      })),
    };
  }

  /**
   * Build the query to get all payout requests
   * @param filters
   * @private
   */
  private static buildGetPayoutRequestsQuery(filters: PayoutRequestFilters = {})
    : SelectQueryBuilder<PayoutRequest> {
    const {
      fromDate, tillDate, ...p
    } = filters;

    const stateSubquery = (qb?: SelectQueryBuilder<PayoutRequest>) => {
      const builder = qb !== undefined ? qb.subQuery() : createQueryBuilder();
      return builder
        .select('payoutRequestStatus.state', 'status')
        .from(PayoutRequestStatus, 'payoutRequestStatus')
        .orderBy('payoutRequestStatus.createdAt', 'DESC')
        .where('payoutRequestStatus.payoutRequestId = payoutRequest.id')
        .limit(1);
    };

    const builder = createQueryBuilder(PayoutRequest, 'payoutRequest')
      .select('payoutRequest.*')
      .addSelect((qb) => stateSubquery(qb), 'status')
      .leftJoinAndSelect('payoutRequest.requestedBy', 'requestedBy')
      .leftJoinAndSelect('payoutRequest.approvedBy', 'approvedBy')
      .distinct(true);

    if (fromDate) builder.andWhere('payoutRequest.createdAt >= :fromDate', { fromDate: toMySQLString(fromDate) });
    if (tillDate) builder.andWhere('payoutRequest.createdAt < :tillDate', { tillDate: toMySQLString(tillDate) });
    const mapping = {
      id: 'payoutRequest.id',
      requestedById: 'payoutRequest.requestedById',
      approvedById: 'payoutRequest.approvedById',
      status: `(${stateSubquery().getSql()})`,
    };
    QueryFilter.applyFilter(builder, mapping, p);

    return builder;
  }

  /**
   * Get all transactions with the given filters
   * @param filters
   * @param pagination
   */
  public static async getPayoutRequests(
    filters: PayoutRequestFilters, pagination: PaginationParameters = {},
  ): Promise<PaginatedBasePayoutRequestResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetPayoutRequestsQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetPayoutRequestsQuery(filters).getCount(),
    ]);

    const dineroTransformer = DineroTransformer.Instance;
    const records = results[0].map((o) => {
      const dinero = dineroTransformer.from(o.amount);
      const v: BasePayoutRequestResponse = {
        id: o.id,
        createdAt: new Date(o.createdAt).toISOString(),
        updatedAt: new Date(o.updatedAt).toISOString(),
        requestedBy: o.requestedBy_id ? {
          id: o.requestedBy_id,
          createdAt: new Date(o.requestedBy_createdAt).toISOString(),
          updatedAt: new Date(o.requestedBy_updatedAt).toISOString(),
          firstName: o.requestedBy_firstName,
          lastName: o.requestedBy_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.requestedBy_type,
        } : undefined,
        approvedBy: o.approvedBy_id ? {
          id: o.approvedBy_id,
          createdAt: new Date(o.approvedBy_createdAt).toISOString(),
          updatedAt: new Date(o.approvedBy_updatedAt).toISOString(),
          firstName: o.approvedBy_firstName,
          lastName: o.approvedBy_lastName,
          active: o.from_active === 1,
          deleted: o.from_deleted === 1,
          type: o.approvedBy_type,
        } : undefined,
        amount: dinero.toObject(),
        status: o.status || '',
      };
      return v;
    });

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Get single payout request
   * @param id
   */
  public static async getSinglePayoutRequest(id: number)
    : Promise<PayoutRequestResponse | undefined> {
    const payoutRequest = await PayoutRequest.findOne({
      where: { id },
      relations: ['requestedBy', 'approvedBy', 'payoutRequestStatus'],
    });

    if (payoutRequest == null) return undefined;

    return PayoutRequestService.asPayoutRequestResponse(payoutRequest);
  }

  /**
   * Create a new payout request
   * @param payoutRequestRequest
   * @param requestedBy
   */
  public static async createPayoutRequest(
    payoutRequestRequest: PayoutRequestRequest, requestedBy: User,
  ): Promise<PayoutRequestResponse> {
    const payoutRequest = Object.assign(new PayoutRequest(), {
      requestedBy,
      amount: Dinero({
        amount: payoutRequestRequest.amount.amount,
        precision: payoutRequestRequest.amount.precision,
        currency: payoutRequestRequest.amount.currency as Currency,
      }),
      bankAccountNumber: payoutRequestRequest.bankAccountNumber,
      bankAccountName: payoutRequestRequest.bankAccountName,
    });

    await payoutRequest.save();
    const createdStatus = Object.assign(new PayoutRequestStatus(), {
      state: PayoutRequestState.CREATED,
      payoutRequest,
    });
    await createdStatus.save();

    return PayoutRequestService.getSinglePayoutRequest(payoutRequest.id);
  }

  /**
   * Verify that the status of the payout request with given id can be changed to the given state
   * @param id
   * @param state
   * @throws Error with message what precondition has failed
   */
  public static async canUpdateStatus(
    id: number, state: PayoutRequestState,
  ) {
    const payoutRequest = await PayoutRequestService.getSinglePayoutRequest(id);
    const currentStates = payoutRequest.status.map((s) => s.state as PayoutRequestState);
    const allStatuses = Object.values(PayoutRequestState);

    if (!allStatuses.includes(state)) throw Error(`unknown status: ${state}.`);
    if (currentStates.includes(state)) throw Error(`status ${state} already exists.`);

    switch (state) {
      case PayoutRequestState.APPROVED:
        if (currentStates.includes(PayoutRequestState.DENIED)) {
          throw Error(`status ${PayoutRequestState.DENIED} already exists.`);
        }
        if (currentStates.includes(PayoutRequestState.CANCELLED)) {
          throw Error(`status ${PayoutRequestState.CANCELLED} already exists.`);
        }
        break;
      case PayoutRequestState.DENIED:
        if (currentStates.includes(PayoutRequestState.APPROVED)) {
          throw Error(`status ${PayoutRequestState.APPROVED} already exists.`);
        }
        if (currentStates.includes(PayoutRequestState.CANCELLED)) {
          throw Error(`status ${PayoutRequestState.CANCELLED} already exists.`);
        }
        break;
      case PayoutRequestState.CANCELLED:
        if (currentStates.includes(PayoutRequestState.APPROVED)) {
          throw Error(`status ${PayoutRequestState.APPROVED} already exists.`);
        }
        if (currentStates.includes(PayoutRequestState.DENIED)) {
          throw Error(`status ${PayoutRequestState.DENIED} already exists.`);
        }
        break;
      default:
    }
  }

  /**
   * Change the status of the payout request.
   * @param id ID of payout request
   * @param state State to change payout request to
   * @param user User who performs the update
   * @return Promise<undefined> - Status cannot be created
   * @return Promise<PayoutRequestResponse> - Status created
   */
  public static async updateStatus(
    id: number, state: PayoutRequestState, user: User,
  ): Promise<PayoutRequestResponse | undefined> {
    const payoutRequest = await PayoutRequest.findOne({
      where: { id },
      relations: ['requestedBy'],
    });

    if (payoutRequest == null) throw Error(`PayoutRequest with ID ${id} does not exist`);

    await PayoutRequestService.canUpdateStatus(id, state);

    const payoutRequestStatus = Object.assign(new PayoutRequestStatus(), {
      payoutRequest,
      state,
    });

    await payoutRequestStatus.save();

    if (state === PayoutRequestState.APPROVED) {
      payoutRequest.transfer = await TransferService.createTransfer({
        amount: {
          amount: payoutRequest.amount.getAmount(),
          precision: payoutRequest.amount.getPrecision(),
          currency: payoutRequest.amount.getCurrency(),
        },
        description: 'Payout Request',
        fromId: payoutRequest.requestedBy.id,
        toId: undefined,
      });
      payoutRequest.approvedBy = user;
      await payoutRequest.save();
    }

    return PayoutRequestService.getSinglePayoutRequest(payoutRequest.id);
  }
}
