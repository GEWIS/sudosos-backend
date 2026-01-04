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
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class UserNotificationPreference1764615514906 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notification_log',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'version',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'handler',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'varchar',
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
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'notification_log',
      new TableForeignKey({
        name: 'FK_notification_log_userId',
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_notification_preference',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'version',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'channel',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'enabled',
            type: 'boolean',
            isNullable: false,
            default: false,
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
        ],
      }),
    );
    
    await queryRunner.createIndex(
      'user_notification_preference',
      new TableIndex({
        name: 'UQ_user_channel_type',
        columnNames: ['userId', 'channel', 'type'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'user_notification_preference',
      new TableForeignKey({
        name: 'FK_user_notification_preference_userId',
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- user_notification_preference reversals ---

    await queryRunner.dropForeignKey(
      'user_notification_preference',
      'FK_user_notification_preference_userId',
    );

    await queryRunner.dropIndex(
      'user_notification_preference',
      'UQ_user_channel_type',
    );

    await queryRunner.dropTable('user_notification_preference');


    // --- notification_log reversals ---

    await queryRunner.dropForeignKey(
      'notification_log',
      'FK_notification_log_userId',
    );

    await queryRunner.dropTable('notification_log');
  }


}
