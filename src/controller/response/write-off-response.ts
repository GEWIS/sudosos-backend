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
import { BaseUserResponse } from './user-response';
import { DineroObjectResponse } from './dinero-response';
import { TransferResponse } from './transfer-response';
import { BaseVatGroupResponse } from './vat-group-response';
import BaseResponse from './base-response';
import { PaginationResult } from '../../helpers/pagination';

/**
 * @typedef {allOf|BaseResponse} WriteOffResponse
 * @property {BaseUserResponse} to.required - The person who has write off
 * @property {DineroObjectResponse} amount.required - The amount of the write off
 * @property {TransferResponse} transfer.required - The transfer linked to the write off
 * @property {BaseVatGroupResponse} vat.required - The vat group linked to the write off
 * @property {string} pdf - Pdf url path linked to the write off
 */
export interface WriteOffResponse extends BaseResponse {
  to: BaseUserResponse
  amount: DineroObjectResponse
  transfer: TransferResponse
  vat: BaseVatGroupResponse
  pdf?: string
}

/**
 * @typedef {object} PaginatedWriteOffResponse
 * @property {PaginationResult} _pagination.required - Pagination metadata
 * @property {Array.<WriteOffResponse>} records.required - Returned write offs
 */
export interface PaginatedWriteOffResponse {
  _pagination: PaginationResult,
  records: WriteOffResponse[],
}
