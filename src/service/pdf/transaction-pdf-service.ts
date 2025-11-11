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
 * This is the page of transaction-pdf-service.
 *
 * @module internal/pdf/transaction-pdf-service
 */

import { HtmlUnstoredPdfService } from './pdf-service';
import Transaction from '../../entity/transactions/transaction';

export default class TransactionPdfService extends HtmlUnstoredPdfService<Transaction> {

  templateFileName = 'transaction.html';

  async getParameters(entity: Transaction): Promise<any> {
    return {
      transactionId: entity.id,
      fromUserFirstName: entity.from.firstName,
      fromUserLastName: entity.from.lastName,
      createdByUserFirstName: entity.createdBy.firstName,
      createdByUserLastName: entity.createdBy.lastName,
      date: entity.createdAt.toISOString(),
      serviceEmail: 'test@gewis.nl',
    };
  }
}