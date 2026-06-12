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

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class TermsOfServiceVersioning1781691836923 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'terms_of_service_acceptance',
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
            name: 'versionNumber',
            type: 'varchar',
            length: '16',
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

    await queryRunner.createIndex(
      'terms_of_service_acceptance',
      new TableIndex({
        name: 'UQ_terms_of_service_acceptance_userId_versionNumber',
        columnNames: ['userId', 'versionNumber'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'terms_of_service_acceptance',
      new TableForeignKey({
        name: 'FK_terms_of_service_acceptance_userId',
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
    );

    await queryRunner.addColumn('user', new TableColumn({
      name: 'tosRequired',
      type: 'boolean',
      isNullable: false,
      default: true,
    }));

    // Backfill
    await queryRunner.query(`
      UPDATE \`user\`
      SET \`tosRequired\` = CASE WHEN \`acceptedToS\` = 'NOT_REQUIRED' THEN 0 ELSE 1 END
    `);

    await queryRunner.query(`
      INSERT INTO \`terms_of_service_acceptance\` (\`version\`, \`userId\`, \`versionNumber\`)
      SELECT 1, \`id\`, '1.0' FROM \`user\` WHERE \`acceptedToS\` = 'ACCEPTED'
    `);

    await queryRunner.dropColumn('user', 'acceptedToS');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('user', new TableColumn({
      name: 'acceptedToS',
      type: 'varchar',
      length: '255',
      isNullable: false,
      default: "'NOT_ACCEPTED'",
    }));

    await queryRunner.query(`
      UPDATE \`user\`
      SET \`acceptedToS\` = CASE
        WHEN \`tosRequired\` = 0 THEN 'NOT_REQUIRED'
        WHEN EXISTS (
          SELECT 1 FROM \`terms_of_service_acceptance\` \`tosa\`
          WHERE \`tosa\`.\`userId\` = \`user\`.\`id\`
        ) THEN 'ACCEPTED'
        ELSE 'NOT_ACCEPTED'
      END
    `);

    await queryRunner.dropColumn('user', 'tosRequired');

    await queryRunner.dropForeignKey(
      'terms_of_service_acceptance',
      'FK_terms_of_service_acceptance_userId',
    );

    await queryRunner.dropIndex(
      'terms_of_service_acceptance',
      'UQ_terms_of_service_acceptance_userId_versionNumber',
    );

    await queryRunner.dropTable('terms_of_service_acceptance');
  }

}
