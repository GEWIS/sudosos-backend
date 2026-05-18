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
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class TaskQueue1778769232000 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'task',
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
            name: 'type',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: '\'pending\'',
          },
          {
            name: 'attempts',
            type: 'int',
            isNullable: false,
            default: 0,
          },
          {
            name: 'maxAttempts',
            type: 'int',
            isNullable: false,
            default: 3,
          },
          {
            name: 'availableAt',
            type: 'datetime(6)',
            isNullable: true,
          },
          {
            name: 'startedAt',
            type: 'datetime(6)',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'datetime(6)',
            isNullable: true,
          },
          {
            name: 'lastError',
            type: 'text',
            isNullable: true,
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
      'task',
      new TableIndex({
        name: 'IDX_task_status_availableAt',
        columnNames: ['status', 'availableAt'],
      }),
    );

    await queryRunner.createIndex(
      'task',
      new TableIndex({
        name: 'IDX_task_type',
        columnNames: ['type'],
      }),
    );

    await queryRunner.createIndex(
      'task',
      new TableIndex({
        name: 'IDX_task_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('task', 'IDX_task_createdAt');
    await queryRunner.dropIndex('task', 'IDX_task_type');
    await queryRunner.dropIndex('task', 'IDX_task_status_availableAt');
    await queryRunner.dropTable('task');
  }
}
