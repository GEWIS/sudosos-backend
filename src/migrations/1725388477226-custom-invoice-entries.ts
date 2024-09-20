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
 * @hidden
 */

import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CustomInvoiceEntries1725388477226 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    const invoiceEntryTable = await queryRunner.getTable('invoice_entry');
    const invoiceForeignKey = invoiceEntryTable.foreignKeys.find(fk => fk.columnNames.indexOf('invoiceId') !== -1);
    if (invoiceForeignKey) {
      await queryRunner.dropForeignKey('invoice_entry', invoiceForeignKey);
    }
    await queryRunner.dropTable('invoice_entry');

    await queryRunner.createTable(new Table({
      name: 'inv_sub_tra_row_del_inv_sub_tra_row',
      columns: [
        {
          name: 'invoiceId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'subTransactionRowId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
      ],
    }));

    await queryRunner.createForeignKeys('inv_sub_tra_row_del_inv_sub_tra_row', [
      new TableForeignKey({
        columnNames: ['invoiceId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'invoice',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['subTransactionRowId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sub_transaction_row',
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('inv_sub_tra_row_del_inv_sub_tra_row');
    await queryRunner.createTable(new Table({
      name: 'invoice_entry',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isGenerated: true,
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'invoiceId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'description',
          type: 'varchar',
          isNullable: false,
          length: '255',
        },
        {
          name: 'amount',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'priceInclVat',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'vatPercentage',
          type: 'double',
          isNullable: false,
        },
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
      ] }));

    await queryRunner.createForeignKey('invoice_entry', new TableForeignKey({
      columnNames: ['invoiceId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'invoice',
      onDelete: 'CASCADE',
    }));
  }

}
