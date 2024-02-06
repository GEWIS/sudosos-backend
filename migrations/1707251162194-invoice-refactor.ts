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
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class InvoiceRefactor1707251162194 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'invoicePdf',
      columns: [
        {
          name: 'id',
          type: 'int',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
        },
        {
          name: 'downloadName',
          type: 'varchar',
          isNullable: false,
        },
        {
          name: 'location',
          type: 'varchar',
          isNullable: false,
        },
        {
          name: 'createdById',
          type: 'int',
          isNullable: false,
        },
        {
          name: 'hash',
          type: 'varchar',
          isNullable: false,
        },
      ],
    }), true);

    // Add foreign key for createdBy in InvoicePdf
    await queryRunner.createForeignKey('invoicePdf', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user', // Assuming 'user' is the table name for User entity
      onDelete: 'CASCADE',
    }));

    // Proceed to add columns to the Invoice table
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'pdfId',
      type: 'int',
      isNullable: true,
    }));


    // Add new columns with temporary nullable setting
    await queryRunner.addColumns('invoice', [
      new TableColumn({
        name: 'reference',
        type: 'varchar',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'street',
        type: 'varchar',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'city',
        type: 'varchar',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'country',
        type: 'varchar',
        isNullable: true, // Temporarily nullable
      }),
    ]);

    // Set default values for existing rows
    await queryRunner.query('UPDATE invoice SET reference = \'UNSET_MIGRATED_ENTRY\', street = \'UNSET_MIGRATED_ENTRY\', postalCode = \'UNSET_MIGRATED_ENTRY\', city = \'UNSET_MIGRATED_ENTRY\', country = \'UNSET_MIGRATED_ENTRY\'');

    // Alter columns to non-nullable
    await queryRunner.changeColumn('invoice', 'reference', new TableColumn({
      name: 'reference',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'street', new TableColumn({
      name: 'street',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'postalCode', new TableColumn({
      name: 'street',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'city', new TableColumn({
      name: 'street',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'country', new TableColumn({
      name: 'street',
      type: 'varchar',
      isNullable: false,
    }));


    // Add foreign key constraint for pdfId to invoicePdf (as before)
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'pdfId',
      type: 'int',
      isNullable: true,
    }));
    await queryRunner.createForeignKey('invoice', new TableForeignKey({
      columnNames: ['pdfId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'invoicePdf',
      onDelete: 'RESTRICT',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the foreign key and column for pdfId (as before)
    const invoiceTable = await queryRunner.getTable('invoice');
    const invoiceForeignKey = invoiceTable.foreignKeys.find(fk => fk.columnNames.indexOf('pdfId') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice', invoiceForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'pdfId');

    await queryRunner.dropColumn('invoice', 'reference');
    await queryRunner.dropColumn('invoice', 'street');
    await queryRunner.dropColumn('invoice', 'postalCode');
    await queryRunner.dropColumn('invoice', 'city');
    await queryRunner.dropColumn('invoice', 'country');

    const pdfTable = await queryRunner.getTable('invoicePdf');
    const pdfForeignKey = pdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdById') !== -1);
    if (pdfForeignKey) {
      await queryRunner.dropForeignKey('invoicePdf', pdfForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'pdfId');
    await queryRunner.dropTable('invoicePdf');
  }
}
