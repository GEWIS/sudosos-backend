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
import dinero from 'dinero.js';
import TransferRequest from '../../src/controller/request/transfer-request';
import TransferService from '../../src/service/transfer-service';

export default async function generateBalance(amount: number, toId: number) {
  const transferRequest: TransferRequest = {
    amount: {
      amount,
      precision: dinero.defaultPrecision,
      currency: dinero.defaultCurrency,
    },
    description: 'Magic',
    fromId: 0,
    toId,
  };
  await TransferService.postTransfer(transferRequest);
}
