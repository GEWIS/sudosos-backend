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
import WriteOff from '../entity/transactions/write-off';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import TransferService from './transfer-service';
import { WriteOffResponse } from '../controller/response/write-off-response';

export default class WriteOffService {
  public asWriteOffResponse(writeOff: WriteOff): WriteOffResponse {
    return {
      amount: writeOff.amount.toObject(),
      id: writeOff.id,
      createdAt: writeOff.createdAt.toISOString(),
      updatedAt: writeOff.updatedAt.toISOString(),
      to: parseUserToBaseResponse(writeOff.to, false),
      transfer: writeOff.transfer ? TransferService.asTransferResponse(writeOff.transfer) : undefined,
      // pdf: writeOff.pdf ? writeOff.pdf.downloadName : undefined,
    };
  }
}
