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

/**
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class RemoveCreditTransferFromInactiveAdministrativeCost1769005123365 implements MigrationInterface {
  private INACTIVE_ADMINISTRATIVE_COST_TABLE = 'inactive_administrative_cost';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key first
    await queryRunner.dropForeignKey(
      this.INACTIVE_ADMINISTRATIVE_COST_TABLE,
      'FK_InactiveAdministrativeCost_creditTransfer',
    );

    // Drop the creditTransferId column
    await queryRunner.dropColumn(this.INACTIVE_ADMINISTRATIVE_COST_TABLE, 'creditTransferId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add the creditTransferId column back
    await queryRunner.query(`
      ALTER TABLE \`${this.INACTIVE_ADMINISTRATIVE_COST_TABLE}\`
      ADD COLUMN \`creditTransferId\` int NULL
    `);

    // Recreate the foreign key
    await queryRunner.createForeignKey(
      this.INACTIVE_ADMINISTRATIVE_COST_TABLE,
      new TableForeignKey({
        columnNames: ['creditTransferId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'transfer',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_InactiveAdministrativeCost_creditTransfer',
      }),
    );
  }
}
