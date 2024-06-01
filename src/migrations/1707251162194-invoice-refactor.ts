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

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class InvoiceRefactor1707251162194 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'invoice_pdf',
      columns: [
        {
          name: 'createdAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          onUpdate: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'version',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
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
        {
          name: 'hash',
          type: 'varchar(255)',
          isNullable: false,
        },
        {
          name: 'createdById',
          type: 'integer',
          isNullable: false,
        },
      ],
    }), true);



    await queryRunner.addColumns('invoice', [
      new TableColumn({
        name: 'reference',
        type: 'varchar(255)',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'street',
        type: 'varchar(255)',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar(255)',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'city',
        type: 'varchar(255)',
        isNullable: true, // Temporarily nullable
      }),
      new TableColumn({
        name: 'country',
        type: 'varchar(255)',
        isNullable: true, // Temporarily nullable
      }),
    ]);

    await queryRunner.addColumns('invoice_user', [
      new TableColumn({
        name: 'street',
        type: 'varchar(255)',
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar(255)',
      }),
      new TableColumn({
        name: 'city',
        type: 'varchar(255)',
      }),
      new TableColumn({
        name: 'country',
        type: 'varchar(255)',
      }),
    ]);


    await queryRunner.query('UPDATE invoice SET reference = \'UNSET_MIGRATED_ENTRY\', street = \'UNSET_MIGRATED_ENTRY\', postalCode = \'UNSET_MIGRATED_ENTRY\', city = \'UNSET_MIGRATED_ENTRY\', country = \'UNSET_MIGRATED_ENTRY\'');

    await queryRunner.changeColumn('invoice', 'reference', new TableColumn({
      name: 'reference',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'street', new TableColumn({
      name: 'street',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'postalCode', new TableColumn({
      name: 'postalCode',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'city', new TableColumn({
      name: 'city',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.changeColumn('invoice', 'country', new TableColumn({
      name: 'country',
      type: 'varchar(255)',
      isNullable: false,
    }));

    await queryRunner.createForeignKey('invoice_pdf', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));

    // Proceed to add columns to the Invoice table
    await queryRunner.addColumn('invoice', new TableColumn({
      name: 'pdfId',
      type: 'integer',
      isNullable: true,
      isUnique: true,
    }));

    await queryRunner.createForeignKey('invoice', new TableForeignKey({
      columnNames: ['pdfId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'invoice_pdf',
      onDelete: 'RESTRICT',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

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

    await queryRunner.dropColumn('invoice_user', 'street');
    await queryRunner.dropColumn('invoice_user', 'postalCode');
    await queryRunner.dropColumn('invoice_user', 'city');
    await queryRunner.dropColumn('invoice_user', 'country');

    const pdfTable = await queryRunner.getTable('invoice_pdf');
    const pdfForeignKey = pdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdById') !== -1);
    if (pdfForeignKey) {
      await queryRunner.dropForeignKey('invoice_pdf', pdfForeignKey);
    }
    await queryRunner.dropTable('invoice_pdf');
  }
}
