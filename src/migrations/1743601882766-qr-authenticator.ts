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

export class QrAuthenticator1743601882766 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create qr_authenticator table
    await queryRunner.createTable(new Table({
      name: 'qr_authenticator',
      columns: [
        {
          name: 'sessionId',
          type: 'varchar(36)',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'userId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'cancelled',
          type: 'boolean',
          isNullable: false,
          default: false,
        },
        {
          name: 'expiresAt',
          type: 'datetime',
          isNullable: false,
        },
        {
          name: 'confirmedAt',
          type: 'datetime',
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

    // Create foreign key to user table
    await queryRunner.createForeignKey('qr_authenticator', new TableForeignKey({
      columnNames: ['userId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    // Create indexes for performance
    await queryRunner.createIndex('qr_authenticator', new TableIndex({
      name: 'IDX_qr_authenticator_createdAt',
      columnNames: ['createdAt'],
    }));

    await queryRunner.createIndex('qr_authenticator', new TableIndex({
      name: 'IDX_qr_authenticator_expiresAt',
      columnNames: ['expiresAt'],
    }));

    await queryRunner.createIndex('qr_authenticator', new TableIndex({
      name: 'IDX_qr_authenticator_cancelled',
      columnNames: ['cancelled'],
    }));

    await queryRunner.createIndex('qr_authenticator', new TableIndex({
      name: 'IDX_qr_authenticator_userId',
      columnNames: ['userId'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('qr_authenticator', 'IDX_qr_authenticator_userId');
    await queryRunner.dropIndex('qr_authenticator', 'IDX_qr_authenticator_cancelled');
    await queryRunner.dropIndex('qr_authenticator', 'IDX_qr_authenticator_expiresAt');
    await queryRunner.dropIndex('qr_authenticator', 'IDX_qr_authenticator_createdAt');

    // Drop foreign key
    const qrAuthenticatorTable = await queryRunner.getTable('qr_authenticator');
    const userForeignKey = qrAuthenticatorTable.foreignKeys.find(fk => fk.columnNames.indexOf('userId') !== -1);
    await queryRunner.dropForeignKey('qr_authenticator', userForeignKey);

    // Drop table
    await queryRunner.dropTable('qr_authenticator');
  }

}
