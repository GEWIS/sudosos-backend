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

import { In, IsNull, MigrationInterface, Not, QueryRunner, Table, TableForeignKey } from 'typeorm';
import Invoice from '../entity/invoices/invoice';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import InvoiceStatus, { InvoiceState } from '../entity/invoices/invoice-status';
import InvoicePdf from '../entity/file/invoice-pdf';
import FileService from '../service/file-service';
import Transfer from '../entity/transactions/transfer';
import assert from 'assert';
import BalanceService from '../service/balance-service';
import { SalesReportService } from '../service/report-service';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import User, { UserType } from '../entity/user/user';
import fs from 'fs';

export class SellerPayouts1724855153990 implements MigrationInterface {
  private SELLER_PAYOUT_TABLE = 'seller_payout';

  private SELLER_PAYOUT_PDF_TABLE = 'seller_payout_pdf';

  async deleteCreditInvoice(queryRunner: QueryRunner, invoice: Invoice) {
    // Find deletion transaction if it exists
    const deletionTransfer = await queryRunner.manager.getRepository(Transfer).findOne({ where: { toId: invoice.to.id, description: `Deletion of Invoice #${invoice.id}` } });
    if (!deletionTransfer) {
      // Edge case if invoice was zero, it won't have a deletion transfer
      console.warn('Deletion transfer not found for credit invoice', invoice.id);
      assert(invoice.transfer.amountInclVat.getAmount() === 0, 'Credit invoice with zero amount should have a deletion transfer');
    } else {
      await queryRunner.manager.getRepository(Transfer).delete({ id: deletionTransfer.id });
    }
    await queryRunner.manager.getRepository(InvoiceStatus).delete({ invoice: { id: invoice.id } });
    await queryRunner.manager.query(`DELETE from invoice_entry WHERE invoiceId = ${invoice.id}`);
    await queryRunner.manager.getRepository(Invoice).delete({ id: invoice.id });
    if (invoice.pdf) {
      // We don't really care if the file is not found, just try to delete it.
      await new FileService().deleteEntityFile(invoice.pdf).catch((e) => console.error(e));
      await queryRunner.manager.delete(InvoicePdf, invoice.pdf.id);
    }
    await queryRunner.manager.getRepository(Transfer).delete({ id: invoice.transfer.id });
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep track of all the balances before the migration
    await new BalanceService().clearBalanceCache();
    const ids = (await queryRunner.manager.find(User, { where: { type: Not(In([2, 7])) } })).map((u) => u.id);
    const balanceBefore = await new BalanceService().getBalances({ ids, allowDeleted: true }, { take: ids.length });
    console.error(balanceBefore._pagination.count, ids.length);
    assert(balanceBefore._pagination.count === ids.length);

    const organs = await queryRunner.manager.find(User, { where: { type: UserType.ORGAN } });
    let organBalances = await new BalanceService().getBalances({ ids: organs.map((o) => o.id), allowDeleted: true }, { take: organs.length });
    fs.writeFileSync('./organBalances-before-payouts.json', JSON.stringify(organBalances, null, 2));


    await queryRunner.createTable(new Table({ name: this.SELLER_PAYOUT_PDF_TABLE,
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
        },
        {
          name: 'hash',
          type: 'varchar(255)',
          isNullable: false,
        },
        {
          name: 'downloadName',
          type: 'varchar(255)',
          isNullable: false,
        },
        {
          name: 'location',
          type: 'varchar(255)',
          isNullable: false,
        },
      ],
    }), true);

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
      }, {
        name: 'reference',
        type: 'varchar(255)',
        isNullable: false,
      }, {
        name: 'pdfId',
        type: 'integer',
        isNullable: true,
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
      new TableForeignKey({
        columnNames: ['pdfId'],
        referencedColumnNames: ['id'],
        referencedTableName: this.SELLER_PAYOUT_PDF_TABLE,
        onDelete: 'RESTRICT',
      }),
    ]);

    const creditInvoices = await queryRunner.manager.getRepository(Invoice).find({
      where: { transfer: { fromId: Not(IsNull()) } },
      relations: { invoiceStatus: true, pdf: true, transfer: true, to: true, subTransactionRows: true },
      order: { date: 'ASC' },
    });

    const notDeleted = creditInvoices.filter((i) => i.invoiceStatus.find((s) => s.state === InvoiceState.DELETED) === undefined);
    const deleted = creditInvoices.filter((i) => i.invoiceStatus.find((s) => s.state === InvoiceState.DELETED) !== undefined);
    const notDeletedAndZero = notDeleted.filter((i) => i.transfer.amountInclVat.isZero());
    const notDeletedAndNotZero = notDeleted.filter((i) => !i.transfer.amountInclVat.isZero());

    console.error(creditInvoices.length);
    console.error(notDeleted.length);
    console.error(deleted.length);
    console.error(notDeletedAndZero.length);
    console.error(notDeletedAndNotZero.length);
    assert(deleted.length + notDeletedAndZero.length + notDeletedAndNotZero.length === creditInvoices.length);

    // Delete credit invoices that have been deleted
    console.warn('Deleting credit invoices that have been deleted');
    for (const invoice of deleted) {
      await this.deleteCreditInvoice(queryRunner, invoice);
    }

    // Delete credit invoices that have not been deleted and have a zero amount
    console.warn('Deleting credit invoices that not have been deleted and have a zero amount');
    for (const invoice of notDeletedAndZero) {
      if (invoice.transfer.amountInclVat.isZero()) {
        await this.deleteCreditInvoice(queryRunner, invoice);
      }
    }

    const salesReportService = new SalesReportService(queryRunner.manager);
    const repo = queryRunner.manager.getRepository(SellerPayout);

    // Migrate credit invoices that not have been deleted and have a non-zero amount to seller payouts
    console.warn('Migrating credit invoices that not have been deleted and have a non-zero amount to seller payouts');
    for (const invoice of notDeletedAndNotZero) {
      console.warn(`Migrating credit invoice ${invoice.id}`);

      // Get min and max createdAt of the SubTransactionsRows
      const minCreatedAt: { minCreatedAt: string } = await queryRunner.manager.createQueryBuilder(SubTransactionRow, 'subTransactionRow')
        .where('subTransactionRow.invoiceId = :invoiceId', { invoiceId: invoice.id })
        .andWhere('subTransactionRow.invoiceId IS NOT NULL')
        .select('MIN(subTransactionRow.createdAt)', 'minCreatedAt')
        .getRawOne();
      const maxCreatedAt: { maxCreatedAt: string } = await queryRunner.manager.createQueryBuilder(SubTransactionRow, 'subTransactionRow')
        .where('subTransactionRow.invoiceId = :invoiceId', { invoiceId: invoice.id })
        .andWhere('subTransactionRow.invoiceId IS NOT NULL')
        .select('MAX(subTransactionRow.createdAt)', 'maxCreatedAt')
        .getRawOne();

      const minCreatedAtDate = new Date(minCreatedAt.minCreatedAt);
      minCreatedAtDate.setMilliseconds(0);
      const maxCreatedAtDate = new Date(maxCreatedAt.maxCreatedAt);
      const tillDate = new Date(maxCreatedAt.maxCreatedAt);
      tillDate.setSeconds(tillDate.getSeconds() + 1);
      console.warn(`Migrating credit invoice ${invoice.id} from ${minCreatedAtDate.toISOString()} to ${maxCreatedAtDate.toISOString()}`);
      const report = await salesReportService.getReport({
        forId: invoice.to.id,
        fromDate: minCreatedAtDate,
        tillDate,
      });
      console.error('report value of invoice', invoice.id, report.totalInclVat.toObject(), invoice.transfer.amountInclVat.getAmount(), maxCreatedAtDate, tillDate);
      assert(invoice.transfer.amountInclVat.equalsTo(report.totalInclVat), 'Migration of invoice would not match total');

      const maxDate = new Date(maxCreatedAt.maxCreatedAt);
      maxDate.setSeconds(maxDate.getSeconds() + 1);


      await repo.save({
        transfer: invoice.transfer,
        requestedBy: invoice.to,
        amount: report.totalInclVat,
        startDate: minCreatedAt.minCreatedAt,
        // End date is exclusive.
        endDate: maxDate,
        reference: invoice.description,
      });

      // Unreference credit invoice from sub transaction rows
      await queryRunner.query(`
UPDATE sub_transaction_row
SET invoiceId = NULL
WHERE invoiceId = ${invoice.id}`);

      // Invoice entries have been removed from the entity.
      // await queryRunner.manager.getRepository(InvoiceEntry).remove(invoice.invoiceEntries);
      await queryRunner.query(`
DELETE from invoice_entry
WHERE invoiceId = ${invoice.id}`);

      await queryRunner.manager.getRepository(InvoiceStatus).remove(invoice.invoiceStatus);
      await queryRunner.manager.getRepository(Invoice).remove(invoice);
      if (invoice.pdf) {
        // Again, we don't really care if the file is not found, just try to delete it.
        await new FileService().deleteEntityFile(invoice.pdf).catch((e) => console.error(e));
        await queryRunner.manager.getRepository(InvoicePdf).remove(invoice.pdf);
      }
    }

    // Verify balances after migration
    const postBalanceService = new BalanceService(queryRunner.manager);
    await postBalanceService.clearBalanceCache();
    const balancesAfter = await postBalanceService.getBalances({ ids, allowDeleted: true }, { take: ids.length });
    assert(balancesAfter._pagination.count === ids.length);

    organBalances = await postBalanceService.getBalances({ ids: organs.map((o) => o.id), allowDeleted: true }, { take: organs.length });
    fs.writeFileSync('./organBalances-after-payouts.json', JSON.stringify(organBalances, null, 2));


    for (const id of ids) {
      const before = balanceBefore.records.find((b) => b.id === id);
      const after = balancesAfter.records.find((b) => b.id === id);
      assert(before);
      assert(after);
      if (before.amount.amount !== after.amount.amount) {
        console.error('Balances are not equal');
        console.error(before);
        console.error(after);
      }
      assert(before.amount.amount === after.amount.amount);
    }
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
