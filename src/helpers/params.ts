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
 * Converts SQL with :named parameters and a params object
 * to SQL with positional (?) placeholders and a matching array.
 * Handles each parameter only in the order it appears in the SQL.
 */
export function convertToPositional(sql: string, params: Record<string, any>): { sql: string; values: any[] } {
  const paramNames: string[] = [];
  // Collect names as they appear in SQL (including repeats)
  const newSql = sql.replace(/:(\w+)/g, (_match, name) => {
    paramNames.push(name);
    return '?';
  });
    // Build array by order of appearance
  const values = paramNames.map(name => {
    if (!(name in params)) {
      throw new Error(`Missing param: ${name}`);
    }
    return params[name];
  });
  return { sql: newSql, values };
}