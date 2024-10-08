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

import WithManager from '../../../src/database/with-manager';
import Transaction from '../../../src/entity/transactions/transaction';
import User, { UserType } from '../../../src/entity/user/user';
import Invoice from '../../../src/entity/invoices/invoice';
import Transfer from '../../../src/entity/transactions/transfer';
import dinero from 'dinero.js';
import InvoiceStatus, { InvoiceState } from '../../../src/entity/invoices/invoice-status';
import SubTransactionRow from '../../../src/entity/transactions/sub-transaction-row';

export default class InvoiceSeeder extends WithManager {
  private defineInvoiceEntries(invoiceId: number, startEntryId: number,
    transactions: Transaction[]): { subTransactionRows: SubTransactionRow[], cost: number } {
    const subTransactions = (
      transactions.map((t) => t.subTransactions).reduce((acc, tSub) => acc.concat(tSub)));

    const subTransactionRows = (
      subTransactions.map(
        (tSub) => tSub.subTransactionRows,
      ).reduce((acc, tSubRow) => acc.concat(tSubRow)));

    let cost = 0;
    for (let i = 0; i < subTransactionRows.length; i += 1) {
      cost += subTransactionRows[i].amount * subTransactionRows[i].product.priceInclVat.getAmount();
      subTransactionRows[i].invoiceId = invoiceId;
    }
    return { subTransactionRows, cost };
  }

  public async seed(
    users: User[],
    transactions: Transaction[],
  ): Promise<{
      invoices: Invoice[],
      invoiceTransfers: Transfer[],
    }> {
    let invoices: Invoice[] = [];

    const invoiceUsers = users.filter((u) => u.type === UserType.INVOICE);
    let invoiceTransfers: Transfer[] = [];
    let rows: SubTransactionRow[] = [];

    for (let i = 0; i < invoiceUsers.length; i += 1) {
      const invoiceTransactions = transactions.filter((t) => t.from.id === invoiceUsers[i].id);
      const to: User = invoiceUsers[i];

      const { subTransactionRows, cost } = (
        this.defineInvoiceEntries(i + 1, 1, invoiceTransactions));
      // Edgecase in the seeder
      if (cost === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      rows = rows.concat(subTransactionRows);

      const transfer = Object.assign(new Transfer(), {
        from: null,
        to,
        amountInclVat: dinero({
          amount: cost,
        }),
        description: `Invoice Transfer for ${cost}`,
      });
      await this.manager.save(Transfer, transfer);

      const invoice = Object.assign(new Invoice(), {
        id: i + 1,
        to,
        addressee: `Addressed to ${to.firstName}`,
        reference: `BAC-${i}`,
        city: `city-${i}`,
        country: `country-${i}`,
        postalCode: `postalCode-${i}`,
        street: `street-${i}`,
        description: `Invoice #${i}`,
        transfer,
        date: new Date(),
        subTransactionRows,
        invoiceStatus: [],
      });
      transfer.invoice = invoice;

      await this.manager.save(Invoice, invoice);
      let status = Object.assign(new InvoiceStatus(), {
        id: i + 1,
        invoice,
        changedBy: users[i],
        state: InvoiceState.CREATED,
        dateChanged: new Date(new Date(2020, 0, 1).getTime() + ((1000 * 60 * 60 * 24) * (2 - (i * 2))) ),
      });
      invoice.invoiceStatus.push(status);
      invoices = invoices.concat(invoice);
      invoiceTransfers = invoiceTransfers.concat(transfer);
    }

    await this.manager.save(SubTransactionRow, rows);
    await this.manager.save(Invoice, invoices);

    for (let i = 0; i < invoices.length; i += 1) {
      if (i % 4 === 0) continue;
      const current = invoices[i].invoiceStatus[0].changedBy.id;
      const status = Object.assign(new InvoiceStatus(), {
        invoice: invoices[i],
        changedBy: current,
        state: [InvoiceState.SENT, InvoiceState.PAID, InvoiceState.DELETED][i % 3],
        dateChanged: new Date(new Date(2020, 0, 1).getTime() + ((1000 * 60 * 60 * 24) * (2 - (i * 2))) ),
      });
      invoices[i].invoiceStatus.push(status);
      await this.manager.save(Invoice, invoices[i]);
    }


    return { invoices, invoiceTransfers };
  }
}
