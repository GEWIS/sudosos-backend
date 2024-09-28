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
 * This is the page of invoice-service.
 *
 * @module invoicing
 */

import {
  FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  Raw,
} from 'typeorm';
import InvoiceStatus, { InvoiceState } from '../entity/invoices/invoice-status';
import {
  BaseInvoiceResponse,
  InvoiceEntryResponse,
  InvoiceResponse,
  InvoiceStatusResponse,
} from '../controller/response/invoice-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import Invoice from '../entity/invoices/invoice';
import {
  CreateInvoiceParams, InvoiceTransactionsRequest,
  UpdateInvoiceParams,
} from '../controller/request/invoice-request';
import Transaction from '../entity/transactions/transaction';
import TransferService from './transfer-service';
import TransferRequest from '../controller/request/transfer-request';
import TransactionService from './transaction-service';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import { TransferResponse } from '../controller/response/transfer-response';
import { TransactionResponse } from '../controller/response/transaction-response';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asDate, asInvoiceState, asNumber } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import User, { UserType } from '../entity/user/user';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import SubTransaction from '../entity/transactions/sub-transaction';
import InvoiceUser, { InvoiceUserDefaults } from '../entity/user/invoice-user';
import Transfer from '../entity/transactions/transfer';
import WithManager from '../database/with-manager';
import DineroTransformer from '../entity/transformer/dinero-transformer';

export interface InvoiceFilterParameters {
  /**
   * Filter based on to user.
   */
  toId?: number;
  /**
   * Filter based on InvoiceId
   */
  invoiceId?: number;
  /**
   * Filter based on the current invoice state
   */
  latestState?: InvoiceState
  /**
   * Boolean if the invoice entries should be added to the response.
   */
  returnInvoiceEntries?: boolean
  /**
   * Filter based on from date,
   */
  fromDate?: Date,
  /**
   * Filter based on till date,
   */
  tillDate?: Date
}


export function parseInvoiceFilterParameters(req: RequestWithToken): InvoiceFilterParameters {
  return {
    toId: asNumber(req.query.toId),
    invoiceId: asNumber(req.query.invoiceId),
    latestState: asInvoiceState(req.query.currentState),
    returnInvoiceEntries: asBoolean(req.query.returnInvoiceEntries),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };
}


export default class InvoiceService extends WithManager {
  /**
   * Parses an subTransactionRow Object to a InvoiceEntryResponse
   * @param row
   */
  private static subTransactionRowsAsInvoiceEntryResponse(row: SubTransactionRow): InvoiceEntryResponse {
    return {
      description: row.product.name,
      amount: row.amount,
      priceInclVat: row.product.priceInclVat.toObject(),
      vatPercentage: row.product.vat.percentage,
      custom: false,
    };
  }

  /**
   * Parses an invoiceStatus Object to a InvoiceStatusResponse
   * @param invoiceStatus - The invoiceStatus to parse
   */
  private static asInvoiceStatusResponse(invoiceStatus: InvoiceStatus): InvoiceStatusResponse {
    return {
      state: InvoiceState[invoiceStatus.state],
      changedBy: parseUserToBaseResponse(invoiceStatus.changedBy, false),
    } as InvoiceStatusResponse;
  }

  static getLatestInvoiceStatus(invoiceStatus: InvoiceStatus[]): InvoiceStatus {
    const sorted = invoiceStatus.sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return b.id - a.id;
    });
    return sorted[0];
  }

  /**
   * Parses an Invoice Object to a BaseInvoiceResponse
   * @param invoice - The Invoice to parse
   */
  public static asBaseInvoiceResponse(invoice: Invoice): BaseInvoiceResponse {
    return {
      id: invoice.id,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      date: invoice.date.toISOString(),
      to: parseUserToBaseResponse(invoice.to, false),
      addressee: invoice.addressee,
      reference: invoice.reference,
      attention: invoice.attention,
      transfer: invoice.transfer ? TransferService.asTransferResponse(invoice.transfer) : undefined,
      description: invoice.description,
      pdf: invoice.pdf ? invoice.pdf.downloadName : undefined,
      currentState: InvoiceService.asInvoiceStatusResponse(InvoiceService.getLatestInvoiceStatus(invoice.invoiceStatus)),
      city: invoice.city,
      country: invoice.country,
      postalCode: invoice.postalCode,
      street: invoice.street,
      totalInclVat: invoice.transfer.amountInclVat.toObject(),
    };
  }

  /**
   * Parses an Invoice Object to a InvoiceResponse
   * @param invoice - The Invoice to parse
   */
  public static asInvoiceResponse(invoice: Invoice)
    : InvoiceResponse {
    const invoiceEntries = InvoiceService.isState(invoice, InvoiceState.DELETED)
      ? invoice.subTransactionRowsDeletedInvoice.map(InvoiceService.subTransactionRowsAsInvoiceEntryResponse)
      : invoice.subTransactionRows.map(InvoiceService.subTransactionRowsAsInvoiceEntryResponse);

    return {
      ...InvoiceService.asBaseInvoiceResponse(invoice),
      invoiceEntries,
    } as InvoiceResponse;
  }

  public static toArrayResponse(invoices: Invoice[]): InvoiceResponse[] {
    return invoices.map(invoice => InvoiceService.asInvoiceResponse(invoice));
  }

  public static toArrayWithoutEntriesResponse(invoices: Invoice[]): BaseInvoiceResponse[] {
    return invoices.map(invoice => InvoiceService.asBaseInvoiceResponse(invoice));
  }


  /**
   * Creates a Transfer for an Invoice from TransactionResponses
   * @param forId - The user which receives the Invoice/Transfer
   * @param transactions - The array of transactions which to create the Transfer for
   * @param amount - The amount to transfer
   */
  public async createTransfer(forId: number,
    transactions: Transaction[], amount: DineroObjectRequest): Promise<TransferResponse> {
    const transactionId = transactions.length > 0 ? transactions.map((t) => t.id) : null;
    const baseTransactions = (await new TransactionService(this.manager).getTransactions({ transactionId })).records;

    baseTransactions.forEach((t) => {
      if (t.from.id !== forId) throw new Error(`Transaction from ${t.from.id} not from user ${forId}`);
    });

    const transferRequest: TransferRequest = {
      amount,
      description: 'Invoice Transfer',
      fromId: 0,
      toId: forId,
    };

    return new TransferService(this.manager).postTransfer(transferRequest);
  }

  static isState(invoice: Invoice, state: InvoiceState): boolean {
    // Sort to make sure we have the latest status.
    // Sort createdAt ascending, take the last element. We do this in case timestamps are equal.
    return invoice.invoiceStatus.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[invoice.invoiceStatus.length - 1].state === state;
  }

  /**
   * Deletes the given invoice and makes an undo transfer
   * @param invoiceId
   * @param byId
   */
  public async deleteInvoice(invoiceId: number, byId: number)
    : Promise<Invoice | undefined> {
    // Find base invoice.
    const invoice = await this.manager.findOne(Invoice, { ...InvoiceService.getOptions({ invoiceId, returnInvoiceEntries: true }) });
    if (!invoice) return undefined;

    // Extract amount from transfer
    const amount: DineroObjectRequest = invoice.transfer.amountInclVat.toObject();

    // We create an undo transfer that sends the money back to the void.
    const undoTransfer: TransferRequest = {
      amount,
      description: 'Deletion of Invoice',
      fromId: invoice.to.id,
      toId: 0,
    };

    await new TransferService(this.manager).postTransfer(undoTransfer).then(async (response) => {
      const transfer = await this.manager.findOne(Transfer, { where: { id: response.id } });
      if (!transfer) throw new Error('Transfer not found during deletion of invoice, aborting');
      invoice.creditTransfer = transfer;
    });

    // Create a new InvoiceStatus
    const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
      invoice,
      changedBy: byId,
      state: InvoiceState.DELETED,
    });

    invoice.subTransactionRowsDeletedInvoice = invoice.subTransactionRows;
    // Save inbetween to make sure the stRows are saved before deletion.
    await this.manager.save(Invoice, invoice);
    await this.removeSubTransactionInvoice(invoice);

    // Add it to the invoice and save it.
    await this.manager.save(Invoice, invoice).then(async () => {
      invoice.invoiceStatus.push(invoiceStatus);
      await this.manager.save(InvoiceStatus, invoiceStatus);
    });

    const options = InvoiceService.getOptions({ invoiceId: invoice.id, returnInvoiceEntries: true });
    return this.manager.findOne(Invoice, options);
  }

  /**
   * Updates the Invoice
   *
   * It is not possible to change the amount or details of the transfer itself.
   *
   * @param update
   */
  public async updateInvoice(update: UpdateInvoiceParams) {
    const { byId, invoiceId, state, amount,  ...props } = update;
    const base: Invoice = await this.manager.findOne(Invoice, InvoiceService.getOptions({ invoiceId }));

    // Return undefined if base does not exist.
    if (!base || InvoiceService.isState(base, InvoiceState.DELETED) || InvoiceService.isState(base, InvoiceState.PAID)) {
      return undefined;
    }

    if (state) {
      // Deleting is a special case of an update.
      if (state === InvoiceState.DELETED) return this.deleteInvoice(base.id, byId);

      const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
        invoice: base,
        changedBy: byId,
        state,
      });

      // Add it to the invoice and save it.
      await this.manager.save(Invoice, base);
      base.invoiceStatus.push(invoiceStatus);
      await this.manager.save(InvoiceStatus, invoiceStatus);
    }

    if (amount) await this.manager.update(Transfer, { id: base.transfer.id }, { amountInclVat: DineroTransformer.Instance.from(amount.amount) });
    await this.manager.update(Invoice, { id: base.id }, { ...props, date: props.date ? new Date(props.date) : undefined });
    // Return the newly updated Invoice.

    const options = InvoiceService.getOptions({ invoiceId: base.id, returnInvoiceEntries: true });
    return this.manager.findOne(Invoice, options);
  }

  /**
   * Removes the invoice reference from all sub transaction rows
   * @param invoice
   */
  async removeSubTransactionInvoice(invoice: Invoice) {
    invoice.subTransactionRows = [];
    const subTransactionRows = await this.manager.find(SubTransactionRow, { where: { invoice: { id: invoice.id } } });
    const promises: Promise<any>[] = [this.manager.save(Invoice, invoice)];
    subTransactionRows.forEach((tSubRow) => {
      const row = tSubRow;
      row.invoice = null;
      promises.push(this.manager.save(SubTransactionRow, row));
    });
    return Promise.all(promises);
  }

  /**
   * Set a reference to an Invoice for all given sub Transactions.
   * @param invoice
   * @param subTransactions
   */
  async setSubTransactionInvoice(invoice: Invoice,
    subTransactions: SubTransaction[]) {
    const promises: Promise<any>[] = [];

    subTransactions.forEach((tSub) => {
      tSub.subTransactionRows.forEach((tSubRow) => {
        const row = tSubRow;
        row.invoice = invoice;
        promises.push(this.manager.save(SubTransactionRow, row));
      });
    });

    await Promise.all(promises);
  }

  /**
   * Returns the default Invoice Params for an invoice user.
   * @param userId
   */
  public async getDefaultInvoiceParams(userId: number): Promise<InvoiceUserDefaults> {
    const user = await this.manager.findOne(User, { where: { id: userId } });

    // Only load defaults for invoice users.
    if (!user || user.type !== UserType.INVOICE) return undefined;

    const invoiceUser = await this.manager.findOne(InvoiceUser, { where: { userId }, relations: ['user'] });
    if (!invoiceUser) return undefined;

    const addressee = `${user.firstName} ${user.lastName}`;

    const { city, country, postalCode, street } = invoiceUser;
    return {
      city,
      country,
      postalCode,
      street,
      addressee,
    };
  }

  /**
   * Checks if any of the transactions are already invoiced
   * @param transactions - The transactions to check
   */
  public async checkIfInvoiced(transactions: Transaction[]) {
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          if (tSubRow.invoice) throw new Error('Transaction already invoiced');
        });
      });
    });
  }

  /**
   * Gets transactions for an invoice
   * returns false if the transactions contain invoiced transactions
   * @param params
   */
  public async getTransactionsForInvoice(params: InvoiceTransactionsRequest): Promise<TransactionResponse[] | false> {
    const { forId, fromDate, tillDate } = params;
    const transactionService = new TransactionService(this.manager);

    const tIds = (await transactionService.getTransactions({ fromId: forId, fromDate, tillDate }, {}))
      .records.map((t) => t.id);


    // TODO: Remove after TransactionService migration to `getOptions`
    const relations: FindOptionsRelations<Transaction> = {
      subTransactions: {
        subTransactionRows: {
          invoice: true,
          product: {
            vat: true,
          },
        },
        container: true,
      },
      pointOfSale: true,
    };

    const transactions = await this.manager.find(Transaction, { where: { id: In(tIds) },
      relations });
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          if (tSubRow.invoice) return false;
        });
      });
    });

    const response: Promise<TransactionResponse>[] = [];
    transactions.forEach((t) => response.push(transactionService.asTransactionResponse(t)));

    return Promise.all(response);
  }

  /**
   * Creates an Invoice from an CreateInvoiceRequest
   * @param invoiceRequest - The Invoice request to create
   */
  public async createInvoice(invoiceRequest: CreateInvoiceParams)
    : Promise<Invoice> {
    const { forId, byId, transactionIDs } = invoiceRequest;

    const relations: FindOptionsRelations<Transaction> = {
      subTransactions: {
        subTransactionRows: {
          invoice: true,
          product: {
            vat: true,
          },
        },
        container: true,
      },
      pointOfSale: true,
    };

    const transactions = await this.manager.find(Transaction, { where: { id: In(transactionIDs) }, relations });
    if (transactions.length !== transactionIDs.length) throw new Error('Transaction not found');

    await this.checkIfInvoiced(transactions);

    const transfer = await this.createTransfer(forId, transactions, invoiceRequest.amount);

    // Create a new Invoice
    const newInvoice: Invoice = Object.assign(new Invoice(), {
      toId: forId,
      transfer: transfer.id,
      addressee: invoiceRequest.addressee,
      attention: invoiceRequest.attention,
      invoiceStatus: [],
      description: invoiceRequest.description,
      street: invoiceRequest.street,
      postalCode:invoiceRequest.postalCode,
      city: invoiceRequest.city,
      country: invoiceRequest.country,
      reference: invoiceRequest.reference,
      date: invoiceRequest.date,
    });

    // Create a new InvoiceStatus
    const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
      invoice: newInvoice,
      changedBy: byId,
      state: InvoiceState.CREATED,
    });

    // First save the Invoice, then the status.
    await this.manager.save(Invoice, newInvoice).then(async () => {
      newInvoice.invoiceStatus.push(invoiceStatus);
      await this.manager.save(InvoiceStatus, invoiceStatus);

      const subTransactions = transactions.flatMap((t) => t.subTransactions);
      await this.setSubTransactionInvoice(newInvoice, subTransactions);
    });

    const options = InvoiceService.getOptions({ invoiceId: newInvoice.id, returnInvoiceEntries: true });
    return this.manager.findOne(Invoice, options);
  }

  /**
   * Returns database entities based on the given filter params.
   * @param params - The filter params to apply
   */
  public async getInvoices(params: InvoiceFilterParameters = {})
    : Promise<Invoice[]> {
    const options = { ...InvoiceService.getOptions(params) };
    return this.manager.find(Invoice, { ...options });
  }

  /**
   * Function that returns all the invoices based on the given params.
   * Returns either BaseInvoiceResponse, that is without InvoiceEntries, or InvoiceResponse
   * based on if returnInvoiceEntries is set to true.
   * @param params - The filter params to apply
   * @param pagination - The pagination params to apply
   */
  public async getPaginatedInvoices(params: InvoiceFilterParameters = {},
    pagination: PaginationParameters = {}) {
    const { take, skip } = pagination;
    const options = { ...InvoiceService.getOptions(params), skip, take };

    const invoices = await this.manager.find(Invoice, { ...options, take });

    const records = params.returnInvoiceEntries
      ? InvoiceService.toArrayResponse(invoices)
      : InvoiceService.toArrayWithoutEntriesResponse(invoices);

    const count = await this.manager.count(Invoice, options);
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static stateSubQuery(): string {
    return InvoiceStatus.getRepository()
      .createQueryBuilder('invoiceStatus')
      .select('MAX(createdAt) as createdAt')
      .where('invoiceStatus.invoiceId = `Invoice`.`id`')
      .getSql();
  }

  public static getOptions(params: InvoiceFilterParameters): FindManyOptions<Invoice> {
    const filterMapping: FilterMapping = {
      currentState: 'currentState',
      toId: 'toId',
      invoiceId: 'id',
    };

    let stateFilter: FindOptionsWhere<Invoice> = { };
    if (params.latestState) {
      stateFilter.invoiceStatus = {
        // Get the latest status
        createdAt: Raw((raw) => `${raw} = (${this.stateSubQuery()})`),
        state: Raw((raw) => `${raw} = '${params.latestState}'`),
      };
    }

    const relations: FindOptionsRelations<Invoice> = {
      to: true,
      invoiceStatus: true,
      transfer: { to: true, from: true },
      pdf: true,
    };

    if (params.returnInvoiceEntries) {
      relations.subTransactionRows = {
        product: {
          vat: true,
        },
      };
      relations.subTransactionRowsDeletedInvoice = {
        product: {
          vat: true,
        },
      };
    }

    const options: FindManyOptions<Invoice> = {
      where: {
        ...QueryFilter.createFilterWhereClause(filterMapping, params),
        ...stateFilter,
      },
      order: { createdAt: 'DESC' },
    };

    return { ...options, relations };
  }

}
