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
 *
 *  @license
 */

/**
 * This is the module page of the invoice-request-spec.
 *
 * @module internal/spec/invoice-request-spec
 */

import { FindOptionsRelations, In } from 'typeorm';
import {
  BaseInvoice, CreateInvoiceParams, CreateInvoiceRequest, UpdateInvoiceParams,
} from '../invoice-request';
import {
  Specification,
  toFail,
  toPass,
  validateSpecification,
  ValidationError,
} from '../../../helpers/specification-validation';
import Transaction from '../../../entity/transactions/transaction';
import stringSpec from './string-spec';
import { userMustExist } from './general-validators';
import {
  INVALID_INVOICE_ID,
  INVALID_TRANSACTION_IDS,
  INVALID_TRANSACTION_OWNER,
  INVOICE_IS_DELETED, INVOICE_IS_PAID, NO_TRANSACTION_IDS,
  SAME_INVOICE_STATE, SUBTRANSACTION_ALREADY_INVOICED,
} from './validation-errors';
import { InvoiceState } from '../../../entity/invoices/invoice-status';
import Invoice from '../../../entity/invoices/invoice';

/**
 * Checks whether all the transactions exists and are credited to the debtor or sold in case of credit Invoice.
 */
async function validTransactionIds<T extends BaseInvoice>(p: T) {
  if (p.transactionIDs.length === 0) return toFail(NO_TRANSACTION_IDS());

  const relations: FindOptionsRelations<Transaction> = {
    from: true,
    subTransactions: {
      subTransactionRows: {
        invoice: true,
      },
      to: true,
    },
  };
  const transactions = await Transaction.find({ where: { id: In(p.transactionIDs) },
    relations });
  let notOwnedByUser = [];
  notOwnedByUser.push(...transactions.filter((t) => t.from.id !== p.forId));
  if (notOwnedByUser.length !== 0) return toFail(INVALID_TRANSACTION_OWNER());
  if (transactions.length !== p.transactionIDs.length) return toFail(INVALID_TRANSACTION_IDS());

  const alreadyInvoiced: number[] = [];
  transactions.forEach((t) => {
    t.subTransactions.forEach((tSub) => {
      tSub.subTransactionRows.forEach((tSubRow) => {
        if (tSubRow.invoice !== null) alreadyInvoiced.push(tSubRow.id);
      });
    });
  });
  if (alreadyInvoiced.length !== 0) return toFail(SUBTRANSACTION_ALREADY_INVOICED(alreadyInvoiced));
  return toPass(p);
}

/**
 * Validates that Invoice exists and is not of state DELETED.
 * @param p
 */
async function existsAndNotPaidOrDeleted<T extends UpdateInvoiceParams>(p: T) {
  const base: Invoice = await Invoice.findOne({ where: { id: p.invoiceId }, relations: ['invoiceStatus'] });

  if (!base) return toFail(INVALID_INVOICE_ID());
  const current = base.invoiceStatus.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[base.invoiceStatus.length - 1].state;
  if (current === InvoiceState.DELETED) {
    return toFail(INVOICE_IS_DELETED());
  }
  if (current === InvoiceState.PAID) {
    return toFail(INVOICE_IS_PAID());
  }

  return toPass(p);
}

/**
 * Validates that the state of the update request is different than the current state.
 * @param p
 */
async function differentState<T extends UpdateInvoiceParams>(p: T) {
  if (!p.state) return toPass(p);

  const base: Invoice = await Invoice.findOne({ where: { id: p.invoiceId }, relations: ['invoiceStatus'] });
  if (base.invoiceStatus[base.invoiceStatus.length - 1].state === p.state) {
    return toFail(SAME_INVOICE_STATE());
  }

  return toPass(p);
}

/**
 * Specification for an InvoiceRequest
 */
function baseInvoiceRequestSpec<T extends BaseInvoice>(): Specification<T, ValidationError> {
  return [
    [[userMustExist], 'forId', new ValidationError('forId:')],
    validTransactionIds,
  ];
}

/**
 * Specification for an UpdateInvoiceParams
 */
const updateInvoiceRequestSpec: Specification<UpdateInvoiceParams, ValidationError> = [
  [stringSpec(), 'description', new ValidationError('description:')],
  differentState,
  existsAndNotPaidOrDeleted,
];

/**
 * Specification for an CreateInvoiceParams
 */
const createInvoiceRequestSpec: () => Specification<CreateInvoiceParams, ValidationError> = () => [
  ...baseInvoiceRequestSpec<CreateInvoiceParams>(),
  [[userMustExist], 'byId', new ValidationError('byId:')],
  [stringSpec(), 'street', new ValidationError('street:')],
  [stringSpec(), 'postalCode', new ValidationError('postalCode:')],
  [stringSpec(), 'city', new ValidationError('city:')],
  [stringSpec(), 'country', new ValidationError('country:')],
  [stringSpec(), 'reference', new ValidationError('reference:')],
  [stringSpec(), 'description', new ValidationError('description:')],
];

export default async function verifyCreateInvoiceRequest(
  createInvoiceRequest: CreateInvoiceRequest,
) {
  return Promise.resolve(await validateSpecification(
    createInvoiceRequest, createInvoiceRequestSpec(),
  ));
}

export async function verifyUpdateInvoiceRequest(
  updateInvoiceRequest: UpdateInvoiceParams,
) {
  return Promise.resolve(await validateSpecification(
    updateInvoiceRequest, updateInvoiceRequestSpec,
  ));
}
