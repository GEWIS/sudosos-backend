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

export class TransfersVat1721916495084 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('transfer', 'amount', 'amountInclVat');
    await queryRunner.addColumn('transfer', new TableColumn({
      name: 'vatId',
      type: 'integer',
      isNullable: true,
    }));
    await queryRunner.createForeignKey('transfer', new TableForeignKey({
      columnNames: ['vatId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'vat_group',
      onDelete: 'SET NULL',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const transferTable = await queryRunner.getTable('transfer');
    const transferForeignKey = transferTable.foreignKeys.find(fk => fk.columnNames.indexOf('vatId') !== -1);
    if (transferForeignKey) {
      await queryRunner.dropForeignKey('transfer', transferForeignKey);
    }
    await queryRunner.dropColumn('transfer', 'vatId');
    await queryRunner.renameColumn('transfer', 'amountInclVat', 'amount');
  }
}
