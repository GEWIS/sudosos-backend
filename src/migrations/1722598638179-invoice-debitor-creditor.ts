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
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class InvoiceDebitorCreditor1722598638179 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sub_transaction_row');

    await queryRunner.addColumns(table, [new TableColumn({
      name: 'debitInvoiceId',
      type: 'integer',
      isNullable: true,
    }), new TableColumn({
      name: 'creditInvoiceId',
      type: 'integer',
      isNullable: true,
    })]);
    await queryRunner.createForeignKeys(table, [
      new TableForeignKey({
        columnNames: ['debitInvoiceId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'invoice',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['creditInvoiceId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'invoice',
        onDelete: 'RESTRICT',
      }),
    ]);

    await queryRunner.query(`
UPDATE sub_transaction_row
SET debitInvoiceID = invoiceId
WHERE EXISTS (
  SELECT *
  FROM sub_transaction_row
  INNER JOIN invoice ON invoice.id = sub_transaction_row.invoiceId
  INNER JOIN transfer ON transfer.id = invoice.transferId
  WHERE transfer.toId IS NULL
)`);
    //     await queryRunner.query(`
    // UPDATE sub_transaction_row
    // INNER JOIN invoice ON invoice.id = sub_transaction_row.invoiceId
    // INNER JOIN transfer ON transfer.id = invoice.transferId
    // SET creditInvoiceId = invoiceId
    // WHERE transfer.toId IS NOT NULL`);
    await queryRunner.query(`
UPDATE sub_transaction_row
SET creditInvoiceId = invoiceId
WHERE EXISTS (
  SELECT *
  FROM sub_transaction_row
  INNER JOIN invoice ON invoice.id = sub_transaction_row.invoiceId
  INNER JOIN transfer ON transfer.id = invoice.transferId
  WHERE transfer.toId IS NOT NULL
)`);

    const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.includes('invoiceId'));
    await queryRunner.dropForeignKey(table, foreignKey);

    await queryRunner.dropColumn(table, 'invoiceId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sub_transaction_row');
    await queryRunner.addColumn(table, new TableColumn({
      name: 'invoiceId',
      type: 'integer',
      isNullable: true,
    }));
    await queryRunner.createForeignKey(table,
      new TableForeignKey({
        columnNames: ['invoiceId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'invoice',
        onDelete: 'RESTRICT',
      }));

    await queryRunner.query(`
UPDATE sub_transaction_row
SET invoiceId = debitInvoiceId
WHERE debitInvoiceId IS NOT NULL`);
    await queryRunner.query(`
UPDATE sub_transaction_row
SET invoiceId = creditInvoiceId
WHERE creditInvoiceId IS NOT NULL`);

    const foreignKeys = table.foreignKeys.filter((fk) => fk.columnNames.includes('debitInvoiceId') || fk.columnNames.includes('creditInvoiceId'));
    await queryRunner.dropForeignKeys(table, foreignKeys);

    await queryRunner.dropColumns(table, ['debitInvoiceId', 'creditInvoiceId']);
  }
}
