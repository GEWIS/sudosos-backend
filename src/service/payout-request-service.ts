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
 *
 *  @license
 */

/**
 * This is the module page of the payout-service.
 *
 * @module payout-requests
 */

import {
  FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere, In,
  Raw,
} from 'typeorm';
import Dinero from 'dinero.js';
import { PaginationParameters } from '../helpers/pagination';
import PayoutRequest from '../entity/transactions/payout/payout-request';
import PayoutRequestStatus, { PayoutRequestState } from '../entity/transactions/payout/payout-request-status';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import {
  BasePayoutRequestResponse,
  PaginatedBasePayoutRequestResponse,
  PayoutRequestResponse,
  PayoutRequestStatusResponse,
} from '../controller/response/payout-request-response';
import PayoutRequestRequest from '../controller/request/payout-request-request';
import User from '../entity/user/user';
import TransferService from './transfer-service';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate } from '../helpers/validators';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';

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
  public static asBasePayoutRequestResponse(req: PayoutRequest): BasePayoutRequestResponse {
    const status = req.payoutRequestStatus && req.payoutRequestStatus.length > 0
      ? req.payoutRequestStatus[req.payoutRequestStatus.length - 1].state : undefined;
    return {
      id: req.id,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
      amount: req.amount.toObject(),
      requestedBy: parseUserToBaseResponse(req.requestedBy, true),
      approvedBy: req.approvedBy == null ? undefined : parseUserToBaseResponse(req.approvedBy, true),
      status,
      pdf: req.pdf ? req.pdf.downloadName : undefined,
    };
  }

  public static asPayoutRequestResponse(req: PayoutRequest): PayoutRequestResponse {
    return {
      ...this.asBasePayoutRequestResponse(req),
      bankAccountNumber: req.bankAccountNumber,
      bankAccountName: req.bankAccountName,
      approvedBy: req.approvedBy == null ? undefined : {
        id: req.approvedBy.id,
        createdAt: req.approvedBy.createdAt.toISOString(),
        updatedAt: req.approvedBy.updatedAt.toISOString(),
        firstName: req.approvedBy.firstName,
        lastName: req.approvedBy.lastName,
      },
      statuses: req.payoutRequestStatus.map((status): PayoutRequestStatusResponse => ({
        id: status.id,
        createdAt: status.createdAt.toISOString(),
        updatedAt: status.updatedAt.toISOString(),
        state: status.state,
      })),
    };
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

    const [data, count]  = await PayoutRequest.findAndCount({
      ...(await this.getOptions(filters)),
      take,
      skip,
    });

    const records = data.map((o) => this.asBasePayoutRequestResponse(o));

    return {
      _pagination: {
        take, skip, count,
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
    const payoutRequest = await PayoutRequest.findOne(await this.getOptions({ id }));

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
      amount: Dinero(payoutRequestRequest.amount),
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
    const currentStates = payoutRequest.statuses.map((s) => s.state as PayoutRequestState);
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
      payoutRequest.transfer = await new TransferService().createTransfer({
        amount: payoutRequest.amount.toObject(),
        description: 'Payout Request',
        fromId: payoutRequest.requestedBy.id,
        toId: undefined,
      });
      payoutRequest.approvedBy = user;
      await payoutRequest.save();
    }

    return PayoutRequestService.getSinglePayoutRequest(payoutRequest.id);
  }

  public static stateSubQuery(): string {
    return PayoutRequestStatus.getRepository()
      .createQueryBuilder('payoutRequestStatus')
      .select('MAX(createdAt) as createdAt')
      .where('payoutRequestStatus.payoutRequestId = `PayoutRequest`.`id`')
      .getSql();
  }

  public static async getOptions(params: PayoutRequestFilters): Promise<FindManyOptions<PayoutRequest>> {
    const filterMapping: FilterMapping = {
      id: 'id',
    };

    const relations: FindOptionsRelations<PayoutRequest> = {
      requestedBy: true,
      approvedBy: true,
      payoutRequestStatus: true,
    };

    let whereClause: FindOptionsWhere<PayoutRequest> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
      createdAt: QueryFilter.createFilterWhereDate(params.fromDate, params.tillDate),
    };

    let stateFilter: FindOptionsWhere<PayoutRequest> = { };
    if (params.status) {
      stateFilter.payoutRequestStatus = {
        // Get the latest status
        createdAt: Raw((raw) => `${raw} = (${this.stateSubQuery()})`),
        state: Raw((raw) => `${raw} IN (${params.status.map((s) => `'${s}'`)})`),
      };
    }

    let userIdFilter: any = {};
    if (params.requestedById) {
      userIdFilter.requestedBy = { id: Array.isArray(params.requestedById) ? In(params.requestedById) : params.requestedById };
    }
    if (params.approvedById) {
      userIdFilter.approvedBy = { id: Array.isArray(params.approvedById) ? In(params.approvedById) : params.approvedById };
    }

    const where: FindOptionsWhere<PayoutRequest> = {
      ...whereClause,
      ...stateFilter,
      ...userIdFilter,
    };

    const options: FindManyOptions<PayoutRequest> = {
      where,
      order: { updatedAt: 'DESC' },
    };

    return { ...options, relations };
  }
}
