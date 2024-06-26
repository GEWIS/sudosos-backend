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
 */

import { Column, Entity } from 'typeorm';
import BaseFile from './base-file';

/**
 * @typedef {BaseFile} InvoicePdf
 */
@Entity()
export default class InvoicePdf extends BaseFile {
  @Column()
  // Stores the PdfInvoiceParams that were used to generate this pdf as an hash. This is used to pretend regeneration if the invoice has not change.
  // The service still allows the user to force regenerate the pdf.
  public hash: string;
}
