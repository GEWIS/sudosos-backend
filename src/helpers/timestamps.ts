/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */

/**
 * Change the timezone of the given date to UTC
 * @param date
 */
export function dateToUTC(date: Date): Date {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());

  return new Date(utc);
}

/**
 * Pad a string of the given integer
 * @param i
 * @param pad
 */
function ts(i: number, pad = 2): string {
  return i.toString().padStart(pad, '0');
}

/**
 * Print the date to a string in MySQL format (YYYY-MM-DD mm:hh:ss), but convert it to UTC
 * @param date
 */
export function toUTCMySQLString(date: Date): string {
  return date.toJSON().slice(0, 19)
    .replace('T', ' ') + '.' + ts(date.getMilliseconds(), 3);
}

/**
 * Print the date to a string in MySQL format (YYYY-MM-DD mm:hh:ss), but keep it in
 * the local timezone
 * @param date
 */
export function toLocalMySQLString(date: Date): string {
  return `${date.getFullYear()}-${ts(date.getMonth() + 1)}-${ts(date.getDate())} ${ts(date.getHours())}:${ts(date.getMinutes())}:${ts(date.getSeconds())}.${ts(date.getMilliseconds(), 3)}`;
}

/**
 * Print the date to a string in MySQL format (YYYY-MM-DD mm:hh:ss)
 * @param date
 */
export function toMySQLString(date: Date): string {
  return process.env.TYPEORM_CONNECTION === 'sqlite' ? toUTCMySQLString(date) : toLocalMySQLString(date);
}
