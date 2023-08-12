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
 * @typedef HandoutFinesRequest
 * @property {Array<integer>} userIds.required - Users to fine. If a user is not eligible for a fine, a fine of 0,00 will be handed out.
 * @property {string} referenceDate - Reference date to calculate the balance for (and "now", but that is always done)
 */
export interface HandoutFinesRequest {
  userIds: number[];
  referenceDate?: string;
}
