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

import { expect } from 'chai';
import { AppDataSource } from '../../src/database/database';
import InvoiceService from '../../src/service/invoice-service';
import BalanceService from '../../src/service/balance-service';
import { CreateInvoiceParams } from '../../src/controller/request/invoice-request';
import { createTransactions } from './transaction-factory';

export async function createInvoiceWithTransfers(
  debtorId: number,
  creditorId: number,
  transactionCount: number,
) {
  const { transactions, total } = await createTransactions(debtorId, creditorId, transactionCount);

  const createInvoiceRequest: CreateInvoiceParams = {
    city: 'city',
    country: 'country',
    postalCode: 'postalCode',
    street: 'street',
    reference: 'BAC-41',
    byId: creditorId,
    addressee: 'Addressee',
    description: 'Description',
    forId: debtorId,
    date: new Date(),
    transactionIDs: transactions.map((t) => t.tId),
    amount: {
      amount: total,
      currency: 'EUR',
      precision: 2,
    },
  };

  const creditorBalance = await new BalanceService().getBalance(creditorId);

  const invoice = await AppDataSource.manager.transaction(async (manager) => {
    return new InvoiceService(manager).createInvoice(createInvoiceRequest);
  });
  expect((await new BalanceService().getBalance(debtorId)).amount.amount).is.equal(0);
  expect((await new BalanceService().getBalance(creditorId)).amount.amount)
    .is.equal(creditorBalance.amount.amount);
  return invoice;
}
