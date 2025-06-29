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

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class WriteOffPdf1751233624778 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create write_off_pdf table
    await queryRunner.createTable(new Table({
      name: 'write_off_pdf',
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
        {
          name: 'createdById',
          type: 'integer',
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
      ],
    }), true);

    await queryRunner.createForeignKey('write_off_pdf', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));

    // 2. Add pdfId to write_off table
    await queryRunner.addColumn('write_off', new TableColumn({
      name: 'pdfId',
      type: 'integer',
      isNullable: true,
    }));

    await queryRunner.createForeignKey('write_off', new TableForeignKey({
      columnNames: ['pdfId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'write_off_pdf',
      onDelete: 'RESTRICT',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK from write_off -> write_off_pdf
    const writeOffTable = await queryRunner.getTable('write_off');
    const pdfForeignKey = writeOffTable.foreignKeys.find(fk => fk.columnNames.indexOf('pdfId') !== -1);
    await queryRunner.dropForeignKey('write_off', pdfForeignKey);

    await queryRunner.dropColumn('write_off', 'pdfId');

    // Remove FK from write_off_pdf -> user
    const writeOffPdfTable = await queryRunner.getTable('write_off_pdf');
    const createdByForeignKey = writeOffPdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdById') !== -1);
    await queryRunner.dropForeignKey('write_off_pdf', createdByForeignKey);

    await queryRunner.dropTable('write_off_pdf');
  }
}
