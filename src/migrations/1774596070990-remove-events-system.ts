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

import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveEventsSystem1774596070990 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `event_shifts_event_shift`');
    await queryRunner.query('DROP TABLE IF EXISTS `event_shift_answer`');
    await queryRunner.query('DROP TABLE IF EXISTS `event`');
    await queryRunner.query('DROP TABLE IF EXISTS `event_shift`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`event_shift\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`version\` int NOT NULL,
        \`deletedAt\` datetime(6) NULL,
        \`name\` varchar(255) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`event\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`version\` int NOT NULL,
        \`deletedAt\` datetime(6) NULL,
        \`name\` varchar(255) NOT NULL,
        \`startDate\` datetime NOT NULL,
        \`endDate\` datetime NOT NULL,
        \`type\` varchar(255) NOT NULL,
        \`createdById\` int NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_event_createdBy\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\` (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`event_shift_answer\` (
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`version\` int NOT NULL,
        \`availability\` varchar(255) NULL,
        \`selected\` tinyint NOT NULL DEFAULT 0,
        \`eventId\` int NOT NULL,
        \`shiftId\` int NOT NULL,
        \`userId\` int NOT NULL,
        PRIMARY KEY (\`eventId\`, \`shiftId\`, \`userId\`),
        CONSTRAINT \`FK_event_shift_answer_event\` FOREIGN KEY (\`eventId\`) REFERENCES \`event\` (\`id\`),
        CONSTRAINT \`FK_event_shift_answer_shift\` FOREIGN KEY (\`shiftId\`) REFERENCES \`event_shift\` (\`id\`),
        CONSTRAINT \`FK_event_shift_answer_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`event_shifts_event_shift\` (
        \`eventId\` int NOT NULL,
        \`eventShiftId\` int NOT NULL,
        PRIMARY KEY (\`eventId\`, \`eventShiftId\`),
        CONSTRAINT \`FK_event_shifts_event\` FOREIGN KEY (\`eventId\`) REFERENCES \`event\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`FK_event_shifts_event_shift\` FOREIGN KEY (\`eventShiftId\`) REFERENCES \`event_shift\` (\`id\`)
      ) ENGINE=InnoDB
    `);
  }
}
