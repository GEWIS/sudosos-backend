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
import { BaseInvoice, CreateInvoiceParams, CreateInvoiceRequest } from '../create-invoice-request';
import {
  createArrayRule,
  Specification, toFail, toPass, validateSpecification, ValidationError,
} from '../../../helpers/specification-validation';
import { userMustExist } from './point-of-sale-request-spec';
import Transaction from '../../../entity/transactions/transaction';
import InvoiceEntryRequest from '../invoice-entry-request';
import { validOrUndefinedDate } from './duration-spec';
import stringSpec from './string-spec';

/**
 * Checks whether all the transactions exists and are credited to the debtor.
 */
async function validTransactionIds<T extends BaseInvoice>(p: T) {
  if (!p.transactionIDs) return toPass(p);

  const transactions = await Transaction.findByIds(p.transactionIDs, { relations: ['from'] });
  const notOwnedByUser = transactions.filter((t) => t.from.id !== p.toId);
  if (notOwnedByUser.length !== 0) return toFail(new ValidationError('Not all transactions are owned by the debtor.'));
  if (transactions.length !== p.transactionIDs.length) return toFail(new ValidationError('Not all transaction IDs are valid.'));

  return toPass(p);
}

const positiveNumber = async (p: number) => {
  if (p <= 0) return toFail(new ValidationError('Number must be positive'));
  return toPass(p);
};

const invoiceEntryRequestSpec: Specification<InvoiceEntryRequest, ValidationError> = [
  [stringSpec(), 'description', new ValidationError('description:')],
  [[positiveNumber], 'amount', new ValidationError('amount:')],
];

function baseInvoiceRequestSpec<T extends BaseInvoice>(): Specification<T, ValidationError> {
  return [
    validTransactionIds,
    [[userMustExist], 'toId', new ValidationError('toId:')],
    [[validOrUndefinedDate], 'fromDate', new ValidationError('fromDate:')],
    [stringSpec(), 'description', new ValidationError('description:')],
    [stringSpec(), 'addressee', new ValidationError('addressee:')],
    [[createArrayRule(invoiceEntryRequestSpec)], 'customEntries', new ValidationError('Custom entries:')],
  ];
}

const createInvoiceRequestSpec: Specification<CreateInvoiceParams, ValidationError> = [
  ...baseInvoiceRequestSpec<CreateInvoiceParams>(),
  [[userMustExist], 'byId', new ValidationError('byId:')],
];

export default async function verifyCreateInvoiceRequest(
  createInvoiceRequest: CreateInvoiceRequest,
) {
  return Promise.resolve(await validateSpecification(
    createInvoiceRequest, createInvoiceRequestSpec,
  ));
}
