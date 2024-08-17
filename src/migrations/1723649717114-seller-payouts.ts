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
import { IsNull, MigrationInterface, Not, QueryRunner, Table, TableForeignKey } from 'typeorm';
import Invoice from '../entity/invoices/invoice';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import InvoiceStatus from '../entity/invoices/invoice-status';
import InvoicePdf from '../entity/file/invoice-pdf';

export class SellerPayouts1723649717114 implements MigrationInterface {
  private SELLER_PAYOUT_TABLE = 'seller_payout';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: this.SELLER_PAYOUT_TABLE,
      columns: [{
        name: 'createdAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        isNullable: false,
      }, {
        name: 'updatedAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        onUpdate: 'current_timestamp',
        isNullable: false,
      }, {
        name: 'version',
        type: 'integer',
        isNullable: false,
      }, {
        name: 'id',
        type: 'integer',
        isPrimary: true,
        isGenerated: true,
        generationStrategy: 'increment',
      }, {
        name: 'requestedById',
        type: 'integer',
        isNullable: false,
      }, {
        name: 'transferId',
        type: 'integer',
        isNullable: true,
      }, {
        name: 'amount',
        type: 'integer',
        isNullable: false,
      }, {
        name: 'startDate',
        type: 'datetime(6)',
        isNullable: false,
      }, {
        name: 'endDate',
        type: 'datetime(6)',
        isNullable: false,
      }],
    }));

    await queryRunner.createForeignKeys(this.SELLER_PAYOUT_TABLE, [
      new TableForeignKey({
        columnNames: ['requestedById'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['transferId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'transfer',
        onDelete: 'RESTRICT',
      }),
    ]);

    const creditInvoices = await queryRunner.manager.getRepository(Invoice).find({
      where: { transfer: { fromId: IsNull() } },
      relations: { invoiceEntries: true, invoiceStatus: true, pdf: true, transfer: true, to: true },
      order: { date: 'ASC' },
    });

    // Mapping to keep track of the start date for each seller payout
    const userDateMap = new Map<number, Date>();
    creditInvoices.forEach((i) => {
      if (!userDateMap.has(i.to.id)) {
        userDateMap.set(i.to.id, i.to.createdAt);
      }
    });

    const repo = queryRunner.manager.getRepository(SellerPayout);
    // Create a seller payout for each invoice with the same value as the transfer
    for (const invoice of creditInvoices) {
      // Do not create a seller payout with value zero
      if (invoice.transfer.amountInclVat.isZero()) continue;

      await repo.save({
        transfer: invoice.transfer,
        requestedBy: invoice.to,
        amount: invoice.transfer.amountInclVat,
        startDate: userDateMap.get(invoice.to.id),
        endDate: invoice.date,
        reference: invoice.reference,
      });
      // Update the start date
      userDateMap.set(invoice.to.id, invoice.date);
    }

    let creditInvoiceIds = creditInvoices.map((c) => c.id);
    if (creditInvoiceIds.length > 0) {
      await queryRunner.query(`
UPDATE sub_transaction_row
SET invoiceId = NULL
WHERE invoiceId IN (${creditInvoiceIds.join(',')})`);
    }

    const entries = creditInvoices.map((i) => i.invoiceEntries).flat();
    await queryRunner.manager.getRepository(InvoiceEntry).remove(entries);

    const statuses = creditInvoices.map((i) => i.invoiceStatus).flat();
    await queryRunner.manager.getRepository(InvoiceStatus).remove(statuses);

    const pdfs = creditInvoices.map((i) => i.pdf).filter((p) => !!p);
    await queryRunner.manager.getRepository(InvoicePdf).remove(pdfs);

    await queryRunner.manager.getRepository(Invoice).remove(creditInvoices);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const sellerPayouts = await queryRunner.manager.getRepository(SellerPayout).find({
      relations: { requestedBy: true, transfer: true },
    });

    const invoiceRepo = queryRunner.manager.getRepository(Invoice);
    await Promise.all(sellerPayouts.map(async (p) => {
      await invoiceRepo.save({
        to: p.requestedBy,
        transfer: p.transfer,
        reference: p.reference,
        date: p.endDate,
      });
    }));
    await queryRunner.manager.getRepository(SellerPayout).remove(sellerPayouts);

    await queryRunner.dropTable(this.SELLER_PAYOUT_TABLE);
  }
}
