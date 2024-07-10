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

export class PayoutRequestPdf1720610649657 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create PayoutRequestPdf table
    await queryRunner.createTable(new Table({
      name: 'payout_request_pdf',
      columns: [
        {
          name: 'id',
          type: 'int',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
        },
        {
          name: 'hash',
          type: 'varchar',
        },
        {
          name: 'downloadName',
          type: 'varchar',
        },
        {
          name: 'location',
          type: 'varchar',
        },
        {
          name: 'createdById',
          type: 'int',
        },
        {
          name: 'createdAt',
          type: 'timestamp',
          default: 'CURRENT_TIMESTAMP',
        },
        {
          name: 'updatedAt',
          type: 'timestamp',
          default: 'CURRENT_TIMESTAMP',
          onUpdate: 'CURRENT_TIMESTAMP',
        },
        {
          name: 'version',
          type: 'int',
          default: 1,
        },
      ],
    }), true);

    await queryRunner.createForeignKey('payout_request_pdf', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));

    await queryRunner.addColumn('payout_request', new TableColumn({
      name: 'pdfId',
      type: 'int',
      isNullable: true,
    }));

    await queryRunner.createForeignKey('payout_request', new TableForeignKey({
      columnNames: ['pdfId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'payout_request_pdf',
      onDelete: 'RESTRICT',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const payoutRequestTable = await queryRunner.getTable('payout_request');
    const pdfForeignKey = payoutRequestTable.foreignKeys.find(fk => fk.columnNames.indexOf('pdfId') !== -1);
    await queryRunner.dropForeignKey('payout_request', pdfForeignKey);

    await queryRunner.dropColumn('payout_request', 'pdfId');

    const payoutRequestPdfTable = await queryRunner.getTable('payout_request_pdf');
    const createdByForeignKey = payoutRequestPdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdById') !== -1);
    await queryRunner.dropForeignKey('payout_request_pdf', createdByForeignKey);

    await queryRunner.dropTable('payout_request_pdf');
  }

}
