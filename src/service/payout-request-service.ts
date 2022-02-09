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
import { PaginationParameters } from '../helpers/pagination';
import PayoutRequest from '../entity/transactions/payout-request';
import PayoutRequestStatus, { PayoutRequestState } from '../entity/transactions/payout-request-status';
import QueryFilter from '../helpers/query-filter';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { BasePayoutRequestResponse } from '../controller/response/payout-request-response';

export interface PayoutRequestFilters {
  id?: number | number[],
  requestedById?: number | number[],
  approvedById?: number | number[],
  fromDate?: Date,
  tillDate?: Date,
  status?: [PayoutRequestState],
}

export default class PayoutRequestService {
  private static buildGetPayoutRequestsQuery(filters: PayoutRequestFilters = {})
    : SelectQueryBuilder<PayoutRequest> {
    const { fromDate, tillDate, ...p } = filters;

    const builder = createQueryBuilder()
      .addSelect((qb) => qb.subQuery()
        .select('status.state as status')
        .from(PayoutRequestStatus, 'status')
        .orderBy('status.createdAt', 'DESC')
        .where('status.payoutRequestId = payoutRequest.id')
        .limit(1))
      .from(PayoutRequest, 'payoutRequest')
      .leftJoinAndSelect('payoutRequest.requestBy', 'requestBy')
      .leftJoinAndSelect('payoutRequest.approvedBy', 'approvedBy')
      // .leftJoinAndSelect('payoutRequest.payoutRequestStatus', 'status')
      .distinct(true);

    if (fromDate) builder.andWhere('"payoutRequest"."createdAt" >= :fromDate', { fromDate: fromDate.toISOString() });
    if (tillDate) builder.andWhere('"payoutRequest"."createdAt" < :tillDate', { tillDate: tillDate.toISOString() });
    const mapping = {
      id: 'payoutRequest.id',
      requestedById: 'payoutRequest.requestedById',
      approvedById: 'payoutRequest.approvedById',
    };
    QueryFilter.applyFilter(builder, mapping, p);

    return builder;
  }

  public static async getPayoutRequests(
    filters: PayoutRequestFilters, pagination: PaginationParameters,
  ) {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetPayoutRequestsQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetPayoutRequestsQuery(filters).getCount(),
    ]);

    const dineroTransformer = DineroTransformer.Instance;
    const records = results[0].map((o) => {
      const dinero = dineroTransformer.from(o.amount);
      const v: BasePayoutRequestResponse = {
        id: o.payoutRequest_id,
        createdAt: new Date(o.payoutRequest_createdAt).toISOString(),
        updatedAt: new Date(o.payoutRequest_updatedAt).toISOString(),
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
        status: o.status,
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
}
