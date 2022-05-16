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
import { FindManyOptions } from 'typeorm';
import dinero from 'dinero.js';
import InvoiceStatus, { InvoiceState } from '../entity/invoices/invoice-status';
import {
  BaseInvoiceResponse,
  InvoiceEntryResponse,
  InvoiceResponse,
  InvoiceStatusResponse,
  PaginatedInvoiceResponse,
} from '../controller/response/invoice-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import Invoice from '../entity/invoices/invoice';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import { CreateInvoiceParams, UpdateInvoiceParams } from '../controller/request/invoice-request';
import Transaction from '../entity/transactions/transaction';
import TransferService from './transfer-service';
import TransferRequest from '../controller/request/transfer-request';
import TransactionService, { TransactionFilterParameters } from './transaction-service';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import { TransferResponse } from '../controller/response/transfer-response';
import { BaseTransactionResponse } from '../controller/response/transaction-response';
import { RequestWithToken } from '../middleware/token-middleware';
import {
  asBoolean, asDate, asInvoiceState, asNumber,
} from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import InvoiceEntryRequest from '../controller/request/invoice-entry-request';
import User from '../entity/user/user';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';

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
  currentState?: InvoiceState
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
    currentState: asInvoiceState(req.query.currentState),
    returnInvoiceEntries: asBoolean(req.query.returnInvoiceEntries),
    fromDate: asDate(req.query.fromDate),
    tillDate: asDate(req.query.tillDate),
  };
}

export default class InvoiceService {
  /**
   * Parses an InvoiceEntry Object to a InvoiceEntryResponse
   * @param invoiceEntries - The invoiceEntries to parse
   */
  private static asInvoiceEntryResponse(invoiceEntries: InvoiceEntry): InvoiceEntryResponse {
    return {
      description: invoiceEntries.description,
      amount: invoiceEntries.amount,
      priceInclVat: invoiceEntries.priceInclVat.toObject(),
      vatPercentage: invoiceEntries.vatPercentage,
    } as InvoiceEntryResponse;
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

  /**
   * Parses an Invoice Object to a BaseInvoiceResponse
   * @param invoice - The Invoice to parse
   */
  private static asBaseInvoiceResponse(invoice: Invoice): BaseInvoiceResponse {
    return {
      id: invoice.id,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      to: parseUserToBaseResponse(invoice.to, false),
      addressee: invoice.addressee,
      transfer: TransferService.asTransferResponse(invoice.transfer),
      description: invoice.description,
      currentState: InvoiceService.asInvoiceStatusResponse(
        invoice.invoiceStatus[invoice.invoiceStatus.length - 1],
      ),
    } as BaseInvoiceResponse;
  }

  /**
   * Parses an Invoice Object to a InvoiceResponse
   * @param invoice - The Invoice to parse
   */
  private static asInvoiceResponse(invoice: Invoice)
    : InvoiceResponse {
    return {
      ...this.asBaseInvoiceResponse(invoice),
      invoiceEntries: invoice.invoiceEntries
        ? invoice.invoiceEntries.map(this.asInvoiceEntryResponse) : [],
    } as InvoiceResponse;
  }

  /**
   * Creates a Transfer for an Invoice from TransactionResponses
   * @param toId - The user which receives the Invoice/Transfer
   * @param transactions - The array of transactions which to create the Transfer for
   */
  public static async createTransferFromTransactions(toId: number,
    transactions: BaseTransactionResponse[]): Promise<TransferResponse> {
    const dineroObjectRequest: DineroObjectRequest = {
      amount: 0,
      currency: dinero.defaultCurrency,
      precision: dinero.defaultPrecision,
    };

    if (transactions.length !== 0) {
      transactions.forEach((t) => { dineroObjectRequest.amount += t.value.amount; });
    }

    const transferRequest: TransferRequest = {
      amount: dineroObjectRequest,
      description: 'Invoice Transfer',
      fromId: 0,
      toId,
    };

    return TransferService.postTransfer(transferRequest);
  }

  /**
   * Creates InvoiceEntries from an array of Transactions
   * @param invoice - The invoice of which the entries are.
   * @param baseTransactions - Array of transactions to parse.
   */
  public static async createInvoiceEntriesTransactions(invoice: Invoice,
    baseTransactions: BaseTransactionResponse[]) {
    // Extract Transactions from IDs.
    const ids = baseTransactions.map((t) => t.id);
    const transactions = await Transaction.findByIds(ids, {
      relations: [
        'subTransactions',
        'subTransactions.subTransactionRows',
        'subTransactions.subTransactionRows.product',
        'subTransactions.subTransactionRows.product.product',
        'subTransactions.subTransactionRows.product.vat',
      ],
    });

    // Collect invoices entries and promises.
    const invoiceEntries: InvoiceEntry[] = [];
    const promises: Promise<any>[] = [];

    // Cumulative entries.
    const entryMap = new Map<string, InvoiceEntry>();

    // Loop through transactions
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          // Use a string of revision + id as key
          const key = JSON.stringify({
            revision: tSubRow.product.revision,
            id: tSubRow.product.product.id,
          });
          // Increase amount
          if (entryMap.has(key)) {
            entryMap.get(key).amount += tSubRow.amount;
          } else {
            // Or create new entry
            const entry = Object.assign(new InvoiceEntry(), {
              invoice,
              description: tSubRow.product.name,
              amount: tSubRow.amount,
              priceInclVat: tSubRow.product.priceInclVat,
              vatPercentage: tSubRow.product.vat.percentage,
            });
            entryMap.set(key, entry);

            // collect promises.
            promises.push(InvoiceEntry.save(entry).then((i) => invoiceEntries.push(i)));
          }
        });
      });
    });

    // Await and return
    await Promise.all(promises);
    return invoiceEntries;
  }

  /**
   * Adds custom entries to the invoice.
   * @param invoice - The Invoice to append to
   * @param customEntries - THe custom entries to append
   */
  private static async AddCustomEntries(invoice: Invoice,
    customEntries: InvoiceEntryRequest[]): Promise<void> {
    const promises: Promise<InvoiceEntry>[] = [];
    customEntries.forEach((request) => {
      const { description, amount, vatPercentage } = request;
      const entry = Object.assign(new InvoiceEntry(), {
        invoice,
        description,
        amount,
        priceInclVat: DineroTransformer.Instance.from(request.priceInclVat.amount),
        vatPercentage,
      });
      promises.push(entry.save());
    });
    await Promise.all(promises);
  }

  static isState(invoice: Invoice, state: InvoiceState): boolean {
    return (invoice.invoiceStatus[invoice.invoiceStatus.length - 1]
      .state === state);
  }

  public static async deleteInvoice(invoiceId: number, byId: number)
    : Promise<BaseInvoiceResponse | undefined> {
    // Find base invoice.
    const invoice = await Invoice.findOne(invoiceId, { relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from'] });
    if (!invoice) return undefined;

    // Extract amount from transfer
    const amount: DineroObjectRequest = {
      amount: invoice.transfer.amount.getAmount(),
      currency: invoice.transfer.amount.getCurrency(),
      precision: invoice.transfer.amount.getPrecision(),
    };

    // We create an undo transfer that sends the money back to the void.
    const undoTransfer: TransferRequest = {
      amount,
      description: `Deletion of Invoice #${invoice.id}`,
      fromId: invoice.to.id,
      toId: 0,
    };

    await TransferService.postTransfer(undoTransfer);

    // Create a new InvoiceStatus
    const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
      invoice,
      changedBy: byId,
      state: InvoiceState.DELETED,
    });

    // Unreference invoices.
    const { records } = await TransactionService.getTransactions({ invoiceId: invoice.id });
    const tIds: number[] = records.map((t) => t.id);
    const promises: Promise<any>[] = [];
    const transactions = await Transaction.findByIds(tIds, { relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          const row = tSubRow;
          if (row.invoice.id === invoice.id) {
            row.invoice = null;
          }
          promises.push(row.save());
        });
      });
    });
    await Promise.all(promises);

    // Add it to the invoice and save it.
    await invoice.save().then(async () => {
      invoice.invoiceStatus.push(invoiceStatus);
      await invoiceStatus.save();
    });

    return ((await this.getInvoices({ invoiceId: invoice.id }))).records[0];
  }

  /**
   * Updates the Invoice
   *
   * It is not possible to change the amount or details of the transfer itself.
   *
   * @param update
   */
  public static async updateInvoice(update: UpdateInvoiceParams) {
    const base: Invoice = await Invoice.findOne(update.invoiceId, { relations: ['invoiceStatus'] });

    // Return undefined if base does not exist.
    if (!base || this.isState(base, InvoiceState.DELETED)) {
      return undefined;
    }

    if (update.state) {
      // Deleting is a special case of an update.
      if (update.state === InvoiceState.DELETED) return this.deleteInvoice(base.id, update.byId);

      const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
        invoice: base,
        changedBy: update.byId,
        state: update.state,
      });

      // Add it to the invoice and save it.
      await base.save().then(async () => {
        base.invoiceStatus.push(invoiceStatus);
        await invoiceStatus.save();
      });
    }

    base.description = update.description;
    base.addressee = update.addressee;

    await base.save();
    // Return the newly updated Invoice.
    return (await this.getInvoices(
      { invoiceId: base.id, returnInvoiceEntries: false },
    )).records[0];
  }

  /**
   * Set a reference to an Invoice for all subTransactionRows of the transactions.
   * @param transactions
   * @param invoice
   */
  static async setTransactionInvoice(invoice: Invoice,
    baseTransactions: BaseTransactionResponse[]) {
    // Extract Transactions from IDs.
    const ids = baseTransactions.map((t) => t.id);
    const transactions = await Transaction.findByIds(ids, { relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
    const promises: Promise<any>[] = [];

    // Loop through transactions
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          const row = tSubRow;
          row.invoice = invoice;
          promises.push(SubTransactionRow.save(row));
        });
      });
    });

    await Promise.all(promises);
  }

  /**
   * Returns the latest invoice sent to a User that is not deleted.
   * @param toId
   */
  static async getLatestValidInvoice(toId: number): Promise<BaseInvoiceResponse> {
    const invoices = (await this.getInvoices({ toId })).records;
    // Filter the deleted invoices
    const validInvoices = invoices.filter(
      (invoice) => invoice.currentState.state !== InvoiceState[InvoiceState.DELETED],
    );
    return validInvoices[validInvoices.length - 1];
  }

  /**
   * Creates an Invoice from an CreateInvoiceRequest
   * @param invoiceRequest - The Invoice request to create
   */
  public static async createInvoice(invoiceRequest: CreateInvoiceParams)
    : Promise<InvoiceResponse> {
    const { toId, byId } = invoiceRequest;
    let params: TransactionFilterParameters;

    // If transactions are specified.
    if (invoiceRequest.transactionIDs) {
      params = { transactionId: invoiceRequest.transactionIDs };
    } else if (invoiceRequest.fromDate) {
      params = { fromDate: asDate(invoiceRequest.fromDate) };
    } else {
      // By default we create an Invoice from all transactions since last invoice.
      const latestInvoice = await this.getLatestValidInvoice(toId);
      let date;
      // If no invoice exists we use the time when the account was created.
      if (!latestInvoice) {
        const user = await User.findOne(toId);
        date = user.createdAt;
      } else {
        date = latestInvoice.createdAt;
      }
      params = { fromDate: new Date(date) };
    }

    const transactions = (await TransactionService.getTransactions(params)).records;
    const transfer = await this.createTransferFromTransactions(toId, transactions);

    // Create a new Invoice
    const newInvoice: Invoice = Object.assign(new Invoice(), {
      to: toId,
      transfer: transfer.id,
      addressee: invoiceRequest.addressee,
      invoiceStatus: [],
      invoiceEntries: [],
      description: invoiceRequest.description,
    });

    // Create a new InvoiceStatus
    const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
      invoice: newInvoice,
      changedBy: byId,
      state: InvoiceState.CREATED,
    });

    // First save the Invoice, then the status.
    await Invoice.save(newInvoice).then(async () => {
      newInvoice.invoiceStatus.push(invoiceStatus);
      await InvoiceStatus.save(invoiceStatus);
      await this.setTransactionInvoice(newInvoice, transactions);
      await this.createInvoiceEntriesTransactions(newInvoice, transactions);
      if (invoiceRequest.customEntries) {
        await this.AddCustomEntries(newInvoice, invoiceRequest.customEntries);
      }
    });

    // Return the newly created Invoice.
    return (await this.getInvoices(
      { invoiceId: newInvoice.id, returnInvoiceEntries: true },
    )).records[0] as InvoiceResponse;
  }

  /**
   * Function that returns all the invoices based on the given params.
   * Returns either BaseInvoiceResponse, that is without InvoiceEntries, or InvoiceResponse
   * based on if returnInvoiceEntries is set to true.
   * @param params - The filter params to apply
   * @param pagination - The pagination params to apply
   */
  public static async getInvoices(params: InvoiceFilterParameters = {},
    pagination: PaginationParameters = {})
    : Promise<PaginatedInvoiceResponse> {
    const { take, skip } = pagination;

    const filterMapping: FilterMapping = {
      currentState: 'currentState',
      toId: 'to',
      invoiceId: 'id',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from'],
      order: { createdAt: 'ASC' },
      skip,
    };

    let records: (BaseInvoiceResponse | InvoiceResponse)[];
    // Case distinction on if we want to return entries or not.
    if (!params.returnInvoiceEntries) {
      const invoices = await Invoice.find({ ...options, take });
      records = invoices.map(this.asBaseInvoiceResponse);
    } else {
      options.relations.push('invoiceEntries');
      const invoices = await Invoice.find({ ...options, take });
      records = invoices.map(this.asInvoiceResponse.bind(this));
    }

    const count = await Invoice.count(options);
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }
}
