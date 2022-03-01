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
import {
  BaseInvoice, BaseUpdateInvoice, CreateInvoiceParams, CreateInvoiceRequest, UpdateInvoiceParams,
} from '../invoice-request';
import {
  createArrayRule,
  Specification, toFail, toPass, validateSpecification, ValidationError,
} from '../../../helpers/specification-validation';
import Transaction from '../../../entity/transactions/transaction';
import InvoiceEntryRequest from '../invoice-entry-request';
import { validOrUndefinedDate } from './duration-spec';
import stringSpec from './string-spec';
import { positiveNumber, userMustExist } from './general-validators';
import {
  INVALID_INVOICE_ID,
  INVALID_TRANSACTION_IDS,
  INVALID_TRANSACTION_OWNER,
  INVOICE_IS_DELETED,
} from './validation-errors';
import { InvoiceState } from '../../../entity/invoices/invoice-status';
import Invoice from '../../../entity/invoices/invoice';

/**
 * Checks whether all the transactions exists and are credited to the debtor.
 */
async function validTransactionIds<T extends BaseInvoice>(p: T) {
  if (!p.transactionIDs) return toPass(p);

  const transactions = await Transaction.findByIds(p.transactionIDs, { relations: ['from'] });
  const notOwnedByUser = transactions.filter((t) => t.from.id !== p.toId);
  if (notOwnedByUser.length !== 0) return toFail(INVALID_TRANSACTION_OWNER());
  if (transactions.length !== p.transactionIDs.length) return toFail(INVALID_TRANSACTION_IDS());

  return toPass(p);
}

async function existsAndNotDeleted<T extends BaseUpdateInvoice>(p: T) {
  const base: Invoice = await Invoice.findOne(p.invoiceId, { relations: ['invoiceStatus'] });

  if (!base) return toFail(INVALID_INVOICE_ID());
  if (base.invoiceStatus[base.invoiceStatus.length - 1]
    .state === InvoiceState.DELETED) {
    return toFail(INVOICE_IS_DELETED());
  }

  return toPass(p);
}

const invoiceEntryRequestSpec: Specification<InvoiceEntryRequest, ValidationError> = [
  [[positiveNumber], 'amount', new ValidationError('amount:')],
  [stringSpec(), 'description', new ValidationError('description:')],
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

const updateInvoiceRequestSpec: Specification<UpdateInvoiceParams, ValidationError> = [
  [stringSpec(), 'description', new ValidationError('description:')],
  [stringSpec(), 'addressee', new ValidationError('addressee:')],
  existsAndNotDeleted,
];

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

export async function verifyUpdateInvoiceRequest(
  updateInvoiceRequest: UpdateInvoiceParams,
) {
  return Promise.resolve(await validateSpecification(
    updateInvoiceRequest, updateInvoiceRequestSpec,
  ));
}
