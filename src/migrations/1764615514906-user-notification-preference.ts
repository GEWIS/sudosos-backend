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
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique } from 'typeorm';

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
          }, {
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
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'notification_log',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
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
          }, {
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
          },
        ],
      }),
    );
    
    await queryRunner.createUniqueConstraint(
      'user_notification_preference',
      new TableUnique({
        name: 'UQ_user_channel_type',
        columnNames: ['userId', 'channel', 'type'],
      }),
    );

    await queryRunner.createForeignKey(
      'user_notification_preference',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
    );

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const notificationLogTable = await queryRunner.getTable('notification_log');

    const notificationLogFk = notificationLogTable!.foreignKeys.find(fk =>
      fk.columnNames.includes('userId'),
    );

    if (notificationLogFk) {
      await queryRunner.dropForeignKey('notification_log', notificationLogFk);
    }

    await queryRunner.dropTable('notification_log');

    const preferenceTable = await queryRunner.getTable(
      'user_notification_preference',
    );

    const uniqueConstraint = preferenceTable!.uniques.find(
      u => u.name === 'UQ_user_channel_type',
    );

    if (uniqueConstraint) {
      await queryRunner.dropUniqueConstraint(
        'user_notification_preference',
        uniqueConstraint,
      );
    }

    const preferenceFk = preferenceTable!.foreignKeys.find(fk =>
      fk.columnNames.includes('userId'),
    );

    if (preferenceFk) {
      await queryRunner.dropForeignKey(
        'user_notification_preference',
        preferenceFk,
      );
    }

    await queryRunner.dropTable('user_notification_preference');
  }

}
