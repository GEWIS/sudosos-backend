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

import { In, MigrationInterface, Not, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';
import Invoice from '../entity/invoices/invoice';
import Transfer from '../entity/transactions/transfer';
import InvoiceStatus from '../entity/invoices/invoice-status';
import assert from 'assert';
import BalanceService from '../service/balance-service';
import User, { UserType } from '../entity/user/user';
import fs from 'fs';

export class InvoiceAsTopups1724506999318 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the latestStatusId column
    const invoiceTable = await queryRunner.getTable('invoice');
    const invoiceForeignKey = invoiceTable.foreignKeys.find(fk => fk.columnNames.indexOf('latestStatusId') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice', invoiceForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'latestStatusId');

    // Add the creditTransferId column
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'creditTransferId',
      type: 'integer',
      isNullable: true,
    }));
    await queryRunner.createForeignKey('invoice', new TableForeignKey({
      columnNames: ['creditTransferId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'transfer',
      onDelete: 'RESTRICT',
    }));

    await new BalanceService().clearBalanceCache();
    const ids = (await queryRunner.manager.find(User, { where: { type: Not(In([2, 7])) } })).map((u) => u.id);
    const balanceBefore = await new BalanceService().getBalances({ ids, allowDeleted: true }, { take: ids.length });
    console.error(balanceBefore._pagination.count, ids.length);
    assert(balanceBefore._pagination.count === ids.length);

    const organs = await queryRunner.manager.find(User, { where: { type: UserType.ORGAN } });
    let organBalances = await new BalanceService().getBalances({ ids: organs.map((o) => o.id), allowDeleted: true }, { take: organs.length });
    fs.writeFileSync('./organBalances-before.json', JSON.stringify(organBalances, null, 2));


    // Query to get all normal invoices that are deleted.
    const subQuery = queryRunner.manager.createQueryBuilder(Invoice, 'invoice')
      .innerJoin(InvoiceStatus, 'i', 'i.invoiceId = invoice.id')
      .innerJoin(Transfer, 't2', 't2.id = invoice.transferId')
      .where('i.state = 4')
      .andWhere('t2.toId IS NOT NULL');
    let result = await subQuery.getMany();


    // Set the creditTransferId of the invoice to the transfer that was made for deleting the invoice
    for (const invoice of result) {
      console.warn('Fixing payment of user from deletion of invoice', invoice.id);
      const query = queryRunner.manager.createQueryBuilder(Transfer, 'transfer')
        .where(`transfer.description LIKE 'Deletion of Invoice #${invoice.id}'`)
        .andWhere('transfer.toId IS NULL');
      const transfer = await query.getOneOrFail();
      assert(transfer.fromId === invoice.toId, 'Transfer to invoice does not match invoice');
      invoice.creditTransferId = transfer.id;
      await queryRunner.manager.save(invoice);
    }

    // For all the deleted normal invoices, remove the sellers payment
    for (const invoice of result) {
      console.warn('Fixing payment of seller from deletion of invoice', invoice.id);
      const query = queryRunner.manager.createQueryBuilder(Transfer, 'transfer')
        .where(`transfer.description LIKE 'Deletion of Invoice #${invoice.id}'`)
        .andWhere('transfer.toId IS NOT NULL');
      const transfer = await query.getOne();
      if (transfer) {
        await queryRunner.manager.remove(transfer);
      } else {
        console.warn('No payment of seller from deletion of invoice', invoice.id);
      }
    }

    // Query to get all normal invoices that are NOT deleted.
    const subQuery2 = queryRunner.manager.createQueryBuilder(Invoice, 'invoice')
      .innerJoin(InvoiceStatus, 'i', 'i.invoiceId = invoice.id')
      .innerJoin(Transfer, 't2', 't2.id = invoice.transferId')
      .where('i.state != 4')
      .andWhere('t2.toId IS NOT NULL');
    result = await subQuery2.getMany();

    // Remove the unpayment of the seller from the normal non-deleted invoices
    for (const invoice of result) {
      console.warn('Fixing unpayment of seller from creation of invoice', invoice.id);
      const query = queryRunner.manager.createQueryBuilder(Transfer, 'transfer')
        .where(`transfer.description LIKE 'Payment of Invoice #${invoice.id}'`)
        .andWhere('transfer.toId IS NULL');
      const transfers = await query.getMany();
      for (const transfer of transfers) {
        console.warn('Removing unpayment of seller from creation of invoice', invoice.id, transfer.id);
        await queryRunner.manager.remove(transfer);
      }
    }
    const postBalanceService = new BalanceService(queryRunner.manager);
    await postBalanceService.clearBalanceCache();
    const balancesAfter = await postBalanceService.getBalances({ ids, allowDeleted: true }, { take: ids.length });
    assert(balancesAfter._pagination.count === ids.length);

    organBalances = await postBalanceService.getBalances({ ids: organs.map((o) => o.id), allowDeleted: true }, { take: organs.length });
    fs.writeFileSync('./organBalances-after.json', JSON.stringify(organBalances, null, 2));


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
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'latestStatusId',
      type: 'integer',
      isNullable: true,
    }));
    await queryRunner.createForeignKey('invoice', new TableForeignKey({
      columnNames: ['latestStatusId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'invoice_status',
      onDelete: 'SET NULL',
    }));

    const invoiceTable = await queryRunner.getTable('invoice');
    const invoiceForeignKey = invoiceTable.foreignKeys.find(fk => fk.columnNames.indexOf('creditTransferId') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice', invoiceForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'creditTransferId');
  }
}
