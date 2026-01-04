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
 * This is the page of write-off-pdf-service.
 *
 * @module internal/write-off-pdf-service
 */

import { WriteOff as PdfWriteOff, WriteOffParameters, WriteOffRouteParams, FileResponse } from 'pdf-generator-client';
import WriteOff from '../../entity/transactions/write-off';
import { PdfService } from './pdf-service';
import WriteOffPdf from '../../entity/file/write-off-pdf';

export default class WriteOffPdfService extends PdfService<WriteOffPdf, WriteOff, WriteOffRouteParams> {

  pdfConstructor = WriteOffPdf;

  routeConstructor = WriteOffRouteParams;

  generator(routeParams: WriteOffRouteParams): Promise<FileResponse> {
    return this.client.generateWriteOff(routeParams);
  }

  async getParameters(entity: WriteOff): Promise<WriteOffParameters> {
    return new WriteOffParameters({
      writeOff: new PdfWriteOff({
        name: entity.to.firstName + ' ' + entity.to.lastName,
        amount: entity.amount.getAmount(),
        reference: `SDS-WR-${String(entity.id).padStart(4, '0')}`,
        date: entity.createdAt,
        debtorNumber: String(entity.to.id),
      }),
    });
  }
}
