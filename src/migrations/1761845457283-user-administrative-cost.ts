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

import { MigrationInterface, TableColumn, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class UserAdministrativeCost1761845457283 implements MigrationInterface {
  private INACTIVE_ADMINISTRATIVE_COST_TABLE = 'inactive_administrative_cost';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: this.INACTIVE_ADMINISTRATIVE_COST_TABLE,
      columns: [{
        name: 'createdAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        isNullable: false,
      }, {
        name: 'updatedAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        onUpdate: 'current_timestamp',
        isNullable: false,
      }, {
        name: 'id',
        type: 'integer',
        isPrimary: true,
        isGenerated: true,
        generationStrategy: 'increment',
      }, {
        name: 'fromId',
        type: 'integer',
        isNullable: false,
      }, {
        name: 'amount',
        type: 'integer',
        isNullable: false,
      }, {
        name: 'transferId',
        type: 'int',
        isNullable: false,
      }, {
        name: 'creditTransferId',
        type: 'int',
        isNullable: true,
      },
      {
        name: 'version',
        type: 'integer',
        isNullable: false,
        default: 1,
      },
      ],
    }),
    true,
    );
    
    await queryRunner.addColumn('user', new TableColumn({
      name: 'inactiveNotificationSend',
      type: 'boolean',
      default: 0,
      isNullable: false,
      isUnique: false,
    }));

    // Add foreign keys
    await queryRunner.createForeignKey(
      this.INACTIVE_ADMINISTRATIVE_COST_TABLE,
      new TableForeignKey({
        columnNames: ['fromId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_InactiveAdministrativeCost_from',
      }),
    );

    await queryRunner.createForeignKey(
      this.INACTIVE_ADMINISTRATIVE_COST_TABLE,
      new TableForeignKey({
        columnNames: ['transferId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'transfer',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_InactiveAdministrativeCost_transfer',
      }),
    );

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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('user', 'inactiveNotificationSend');
    await queryRunner.dropForeignKey('transfer', 'FK_transfer_inactiveAdministrativeCostId');
    await queryRunner.dropColumn('transfer', 'inactiveAdministrativeCostId');

    // Drop the foreign keys in reverse order
    await queryRunner.dropForeignKey('InactiveAdministrativeCost', 'FK_InactiveAdministrativeCost_creditTransfer');
    await queryRunner.dropForeignKey('InactiveAdministrativeCost', 'FK_InactiveAdministrativeCost_transfer');
    await queryRunner.dropForeignKey('InactiveAdministrativeCost', 'FK_InactiveAdministrativeCost_from');

    // Drop the InactiveAdministrativeCost table
    await queryRunner.dropTable('InactiveAdministrativeCost');
  }

}
