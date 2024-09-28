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
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class InvoiceRework1622118077157 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'attention',
      type: 'varchar(255)',
      default: '\'\'',
      isNullable: false,
    }));
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'date',
      type: 'datetime(6)',
      default: 'current_timestamp',
      isNullable: false,
    }));
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

    // Set the latestStatus manually to the latest invoice status.
    await queryRunner.query('UPDATE invoice SET latestStatusId = (SELECT id FROM invoice_status WHERE invoice_status.invoiceId = invoice.id ORDER BY createdAt DESC LIMIT 1)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const invoiceTable = await queryRunner.getTable('invoice');
    const invoiceForeignKey = invoiceTable.foreignKeys.find(fk => fk.columnNames.indexOf('latestStatusId') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice', invoiceForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'latestStatusId');
    await queryRunner.dropColumn('invoice', 'attention');
    await queryRunner.dropColumn('invoice', 'date');
  }

}
