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
 * BAC GEWIS letterhead and payment details.
 *
 * Single source of truth for the BAC-as-sender data that appears on the
 * Invoice PDF (and any future PDF that needs to render BAC's letterhead).
 * Edit here when GEWIS moves office, changes IBAN, etc.
 */
export const BAC = {
  name: 'BAr Commissie GEWIS',
  postbus: 'Postbus 513, 5600MB Eindhoven',
  /** Visiting address, split to mirror a "Bill to" recipient block. */
  street: 'De Groene Loper 5',
  postalCity: '5612AZ Eindhoven',
  country: 'The Netherlands',
  phone: '+31 40 247 2815',
  email: 'bacpm@gewis.nl',
  iban: 'NL69 ABNA 062 05 77 770',
  vat: 'NL810074230B02',
  kvk: '40237787',
  /** Days a recipient has to pay an invoice. Used to derive the due date. */
  paymentTermDays: 30,
} as const;

export type BacLetterhead = typeof BAC;
