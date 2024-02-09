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
      name: 'invoice_pdf',
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
          name: 'createdBy',
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
      name: 'postalCode',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'city', new TableColumn({
      name: 'city',
      type: 'varchar',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'country', new TableColumn({
      name: 'country',
      type: 'varchar',
      isNullable: false,
    }));

    // Add foreign key for createdBy in invoice_pdf
    await queryRunner.createForeignKey('invoice_pdf', new TableForeignKey({
      columnNames: ['createdBy'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));

    // Proceed to add columns to the Invoice table
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'pdf',
      type: 'int',
      isNullable: true,
    }));

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the foreign key and column for pdfId (as before)
    const invoiceTable = await queryRunner.getTable('invoice');
    const invoiceForeignKey = invoiceTable.foreignKeys.find(fk => fk.columnNames.indexOf('pdf') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice', invoiceForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'pdf');

    await queryRunner.dropColumn('invoice', 'reference');
    await queryRunner.dropColumn('invoice', 'street');
    await queryRunner.dropColumn('invoice', 'postalCode');
    await queryRunner.dropColumn('invoice', 'city');
    await queryRunner.dropColumn('invoice', 'country');

    const pdfTable = await queryRunner.getTable('invoice_pdf');
    const pdfForeignKey = pdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdBy') !== -1);
    if (pdfForeignKey) {
      await queryRunner.dropForeignKey('invoice_pdf', pdfForeignKey);
    }
    await queryRunner.dropColumn('invoice', 'pdf');
    await queryRunner.dropTable('invoice_pdf');
  }
}
