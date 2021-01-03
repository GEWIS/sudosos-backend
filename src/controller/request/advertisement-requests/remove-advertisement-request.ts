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

// -- moet aanpassen naar een get all request (wss met alleen User) --
/**
 * @typedef RemoveAdvertisementRequest
 * @property {string} name - Name/label of the advertisement
 * @property {string} picture - Location of the image
 * @property {integer} duration - How long the advertisement should be shown (in seconds)
 * @property {boolean} active - Whether the advertisement is active. Overrides start and end date
 * @property {Date} startDate - The starting date from which the adverisement should be shown
 * @property {Date} endDate - The end date from which the advertisement should no longer be shown
 */
export default interface CreateTransactionRequest {
  name: string,
  picture: string,
  duration: number,
  active: boolean,
  startDate: Date,
  endDate: Date,
}
