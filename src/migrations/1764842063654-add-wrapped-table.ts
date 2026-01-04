/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class AddWrappedTable1764842063654 implements MigrationInterface {
  private WRAPPED_TABLE = 'wrapped';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: this.WRAPPED_TABLE,
        columns: [
          {
            name: 'userId',
            type: 'int',
            isPrimary: true,
          },
          {
            name: 'transactionCount',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'transactionPercentile',
            type: 'float',
            isNullable: false,
            default: '0',
          },
          {
            name: 'transactionMaxDate',
            type: 'datetime',
            isNullable: true,
            default: null,
          },
          {
            name: 'transactionMaxAmount',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'transactionHeatmap',
            type: 'text',
            isNullable: false,
            default: "'[]'",
          },
          {
            name: 'spentPercentile',
            type: 'float',
            isNullable: false,
            default: '0',
          },
          {
            name: 'syncedFrom',
            type: 'datetime',
            isNullable: true,
            default: null,
          },
          {
            name: 'syncedTo',
            type: 'datetime',
            isNullable: true,
            default: null,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      this.WRAPPED_TABLE,
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.WRAPPED_TABLE);
    if (table) {
      const fk = table.foreignKeys.find(f => f.columnNames.length === 1 && f.columnNames[0] === 'userId');
      if (fk) await queryRunner.dropForeignKey(this.WRAPPED_TABLE, fk);
    }
    await queryRunner.dropTable(this.WRAPPED_TABLE, true);
  }
}
