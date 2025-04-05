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

/**
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner } from 'typeorm';
import path from 'path';
import fs from 'fs';

export class InitialSQLMigration1743601882766 implements MigrationInterface {

  private static readonly hash = 'dbe826d61406e8d4ce533a7eab636cead8375a0dbded402dcff396d37fdb5cc9';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      const sqlFilePath = path.join(__dirname, 'initial-migration.sql');
      const sql = fs.readFileSync(sqlFilePath, 'utf8');
      const queries = sql.split(';').filter(query => query.trim() !== '');

      for (const query of queries) {
        await queryRunner.query(query);
      }
    } catch (error) {
      console.error('Error executing SQL file:', error);
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_: QueryRunner): Promise<void> {
    // no-op
  }
}
