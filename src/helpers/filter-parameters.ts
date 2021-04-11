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
import { RequestWithToken } from '../middleware/token-middleware';
import { TransactionFilters } from './mappers';

export function parseGetTransactionsFilters(req: RequestWithToken): TransactionFilters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
    || (req.query.containerRevision && !req.query.containerId)
    || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  return {
    fromId: req.query.fromId,
    createdById: req.query.createdById,
    toId: req.query.toId,
    pointOfSale: req.query.pointOfSaleId ? {
      id: req.query.pointOfSaleId,
      revision: req.query.pointOfSaleRevision,
    } : undefined,
    container: req.query.containerId ? {
      id: req.query.containerId,
      revision: req.query.containerRevision,
    } : undefined,
    product: req.query.productId ? {
      id: req.query.productId,
      revision: req.query.productRevision,
    } : undefined,
    fromDate: req.query.fromDate,
    tillDate: req.query.tillDate,
  };
}
