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
import { createTransactionPdf, ITransactionPdf } from '../../html/transaction.html';

export default class TransactionPdfService extends HtmlUnstoredPdfService<Transaction, ITransactionPdf> {

  htmlGenerator = createTransactionPdf;

  async getParameters(entity: Transaction): Promise<ITransactionPdf> {
    const transaction = await this.manager.findOne(Transaction, {
      where: { id: entity.id },
      relations: [
        'from',
        'createdBy',
        'subTransactions',
        'subTransactions.subTransactionRows',
        'subTransactions.subTransactionRows.product',
        'subTransactions.subTransactionRows.product.vat',
      ],
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const items = transaction.subTransactions.flatMap(st =>
      st.subTransactionRows.map(row => {
        const priceIncl = row.product.priceInclVat.getAmount();
        const vatRate = row.product.vat.percentage;
        const unitPriceExcl = Math.round(priceIncl / (1 + vatRate / 100)) / 100;

        return {
          description: row.product.name,
          qty: row.amount,
          unit: row.product.priceInclVat.toFormat(), // display only
          unitPriceExclVat: unitPriceExcl,          // calculations
          vatRate: vatRate,
        };
      }),
    );

    return {
      transactionId: transaction.id.toString(),
      fromUserFirstName: transaction.from.firstName,
      fromUserLastName: transaction.from.lastName,
      fromId: transaction.from.id.toString(),
      createdByUserFirstName: transaction.createdBy.firstName,
      createdByUserLastName: transaction.createdBy.lastName,
      date: transaction.createdAt.toLocaleDateString('nl-NL'),
      items,
      serviceEmail: process.env.FINANCIAL_RESPONSIBLE || '',
    };
  }
}