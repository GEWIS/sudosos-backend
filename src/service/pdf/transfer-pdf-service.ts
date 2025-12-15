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
 * This is the page of transfer-pdf-service.
 *
 * @module internal/pdf/transfer-pdf-service
 */

import { HtmlUnstoredPdfService } from './pdf-service';
import Transfer from '../../entity/transactions/transfer';
import { createTransferPdf, ITransferPdf } from '../../html/transfer.html';

export default class TransferPdfService extends HtmlUnstoredPdfService<Transfer, ITransferPdf> {

  htmlGenerator = createTransferPdf;

  async getParameters(entity: Transfer): Promise<ITransferPdf> {
    const transfer = await this.manager.findOne(Transfer, {
      where: { id: entity.id },
      relations: ['from', 'to', 'invoice', 'deposit', 'payoutRequest', 'fine', 'writeOff', 'waivedFines', 'inactiveAdministrativeCost'],
    });

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.invoice || transfer.deposit || transfer.payoutRequest || transfer.fine
      || transfer.writeOff || transfer.waivedFines || transfer.inactiveAdministrativeCost) {
      throw new Error('Transfer is not a base transfer and cannot be used to generate a PDF directly.');
    }

    return {
      transferId: transfer.id.toString(),
      fromUserFirstName: transfer.from?.firstName || 'N/A',
      fromUserLastName: transfer.from?.lastName || '',
      fromAccount: transfer.from?.id.toString() || 'N/A',
      toUserFirstName: transfer.to?.firstName || 'N/A',
      toUserLastName: transfer.to?.lastName || '',
      toAccount: transfer.to?.id.toString() || 'N/A',
      date: transfer.createdAt.toLocaleDateString('nl-NL'),
      description: transfer.description || '',
      amount: transfer.amountInclVat.toFormat(),
      serviceEmail: process.env.FINANCIAL_RESPONSIBLE || '',
    };
  }
}

