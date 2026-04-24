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

import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class PaymentRequest1777010230727 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'payment_request',
      columns: [
        {
          name: 'id',
          type: 'varchar',
          length: '36',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'forId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'createdById',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'amount',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'expiresAt',
          type: 'datetime',
          isNullable: false,
        },
        {
          name: 'cancelledAt',
          type: 'datetime',
          isNullable: true,
        },
        {
          name: 'cancelledById',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'paidAt',
          type: 'datetime',
          isNullable: true,
        },
        {
          name: 'fulfilledById',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'description',
          type: 'varchar',
          length: '255',
          isNullable: true,
        },
        {
          name: 'createdAt',
          type: 'datetime',
          default: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'updatedAt',
          type: 'datetime',
          default: 'current_timestamp',
          onUpdate: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'version',
          type: 'integer',
          isNullable: false,
          default: 1,
        },
      ],
    }), true);

    // Foreign keys
    await queryRunner.createForeignKey('payment_request', new TableForeignKey({
      columnNames: ['forId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('payment_request', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('payment_request', new TableForeignKey({
      columnNames: ['cancelledById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('payment_request', new TableForeignKey({
      columnNames: ['fulfilledById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
    }));

    // Indexes
    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_createdAt',
      columnNames: ['createdAt'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_forId',
      columnNames: ['forId'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_createdById',
      columnNames: ['createdById'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_cancelledById',
      columnNames: ['cancelledById'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_fulfilledById',
      columnNames: ['fulfilledById'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_expiresAt',
      columnNames: ['expiresAt'],
    }));

    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_paidAt',
      columnNames: ['paidAt'],
    }));

    // Composite index for the most common query: "open requests for user X"
    await queryRunner.createIndex('payment_request', new TableIndex({
      name: 'IDX_payment_request_forId_paidAt',
      columnNames: ['forId', 'paidAt'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_forId_paidAt');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_paidAt');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_expiresAt');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_fulfilledById');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_cancelledById');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_createdById');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_forId');
    await queryRunner.dropIndex('payment_request', 'IDX_payment_request_createdAt');

    // Drop foreign keys
    const table = await queryRunner.getTable('payment_request');
    if (table) {
      const fulfilledByFk = table.foreignKeys.find(f => f.columnNames.indexOf('fulfilledById') !== -1);
      if (fulfilledByFk) await queryRunner.dropForeignKey('payment_request', fulfilledByFk);
      const cancelledByFk = table.foreignKeys.find(f => f.columnNames.indexOf('cancelledById') !== -1);
      if (cancelledByFk) await queryRunner.dropForeignKey('payment_request', cancelledByFk);
      const createdByFk = table.foreignKeys.find(f => f.columnNames.indexOf('createdById') !== -1);
      if (createdByFk) await queryRunner.dropForeignKey('payment_request', createdByFk);
      const forFk = table.foreignKeys.find(f => f.columnNames.indexOf('forId') !== -1);
      if (forFk) await queryRunner.dropForeignKey('payment_request', forFk);
    }

    await queryRunner.dropTable('payment_request');
  }

}
