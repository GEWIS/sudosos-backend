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
 * Database-level test helpers.
 *
 * Lives in `test/helpers/` rather than `test/setup.ts` so it can be imported
 * by non-Vitest callers (e.g. `cli/dev-seed.ts`) without triggering Vitest's
 * setup-time side effects (env mutations, env Proxy, hook registration).
 */

import { DataSource } from 'typeorm';
import { PERSISTENT_TEST_DATABASES } from '../../src/helpers/database';

// We should only ever truncate in test.
// For non-persistent databases (sqlite) we can just drop them.
function shouldTruncate(): boolean {
  if (process.env.NODE_ENV !== 'test') return false;
  return PERSISTENT_TEST_DATABASES.has(process.env.TYPEORM_CONNECTION);
}

export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  if (!shouldTruncate()) return;

  console.log('Starting truncation of all tables...');
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();

  try {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0;'); // Disable FK checks to avoid issues

    // Retrieve all table names except for system tables (if any)
    const tables = await queryRunner.query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\';');

    for (const table of tables) {
      const tableName = table[Object.keys(table)[0]]; // Gets table name dynamically
      console.log(`Truncating table: ${tableName}`);
      await queryRunner.query(`TRUNCATE TABLE \`${tableName}\`;`);
    }

    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1;'); // Re-enable FK checks
    console.log('All tables truncated successfully.');
  } catch (err) {
    console.error('Failed to truncate tables:', err);
    throw err;
  } finally {
    await queryRunner.release();
  }
}
