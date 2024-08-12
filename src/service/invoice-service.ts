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

import { EntityManager, FindManyOptions, FindOptionsRelationByString, FindOptionsWhere, In } from 'typeorm';
import dinero from 'dinero.js';
import InvoiceStatus, { InvoiceState } from '../entity/invoices/invoice-status';
import {
  BaseInvoiceResponse,
  InvoiceEntryResponse,
  InvoiceResponse,
  InvoiceStatusResponse,
} from '../controller/response/invoice-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import Invoice from '../entity/invoices/invoice';
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
import { asBoolean, asDate, asInvoiceState, asNumber } from '../helpers/validators';
import { PaginationParameters } from '../helpers/pagination';
import InvoiceEntryRequest from '../controller/request/invoice-entry-request';
import User, { UserType } from '../entity/user/user';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import { collectByToId, collectProductsByRevision, reduceMapToInvoiceEntries } from '../helpers/transaction-mapper';
import SubTransaction from '../entity/transactions/sub-transaction';
import InvoiceUser, { InvoiceUserDefaults } from '../entity/user/invoice-user';
import { AppDataSource } from '../database/database';
import { NotImplementedError } from '../helpers/errors';

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

export default class InvoiceService {

  private manager: EntityManager;

  constructor(manager?: EntityManager) {
    this.manager = manager ? manager : AppDataSource.manager;
  }

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
      date: invoice.date.toISOString(),
      to: parseUserToBaseResponse(invoice.to, false),
      addressee: invoice.addressee,
      reference: invoice.reference,
      attention: invoice.attention,
      transfer: invoice.transfer ? TransferService.asTransferResponse(invoice.transfer) : undefined,
      description: invoice.description,
      pdf: invoice.pdf ? invoice.pdf.downloadName : undefined,
      currentState: InvoiceService.asInvoiceStatusResponse(invoice.latestStatus),
      city: invoice.city,
      country: invoice.country,
      postalCode: invoice.postalCode,
      street: invoice.street,
    };
  }

  /**
   * Parses an Invoice Object to a InvoiceResponse
   * @param invoice - The Invoice to parse
   */
  public static asInvoiceResponse(invoice: Invoice)
    : InvoiceResponse {
    return {
      ...this.asBaseInvoiceResponse(invoice),
      invoiceEntries: invoice.invoiceEntries
        ? invoice.invoiceEntries.map(this.asInvoiceEntryResponse) : [],
    } as InvoiceResponse;
  }

  public static toResponse(invoices: Invoice | Invoice[], entries: boolean): BaseInvoiceResponse | InvoiceResponse | BaseInvoiceResponse[] | InvoiceResponse[] {
    if (Array.isArray(invoices)) {
      if (entries) {
        return invoices.map(invoice => this.asInvoiceResponse(invoice));
      } else {
        return invoices.map(invoice => this.asBaseInvoiceResponse(invoice));
      }
    } else {
      if (entries) {
        return this.asInvoiceResponse(invoices);
      } else {
        return this.asBaseInvoiceResponse(invoices);
      }
    }
  }

  /**
   * Creates a Transfer for an Invoice from TransactionResponses
   * @param forId - The user which receives the Invoice/Transfer
   * @param transactions - The array of transactions which to create the Transfer for
   * @param isCreditInvoice - If the invoice is a credit Invoice
   */
  public async createTransferFromTransactions(forId: number,
    transactions: BaseTransactionResponse[], isCreditInvoice: boolean): Promise<TransferResponse> {
    const dineroObjectRequest: DineroObjectRequest = {
      amount: 0,
      currency: dinero.defaultCurrency,
      precision: dinero.defaultPrecision,
    };

    if (transactions.length !== 0) {
      transactions.forEach((t) => { dineroObjectRequest.amount += t.value.amount; });
    }

    // Credit Invoices
    let fromId = 0;
    let toId = forId;
    if (isCreditInvoice) {
      toId = 0;
      fromId = forId;
    }

    const transferRequest: TransferRequest = {
      amount: dineroObjectRequest,
      description: 'Invoice Transfer',
      fromId,
      toId,
    };

    return (new TransferService(this.manager)).postTransfer(transferRequest);
  }

  /**
   * Creates InvoiceEntries from an array of Transactions
   * @param invoice - The invoice of which the entries are.
   * @param subTransactions - Array of sub transactions to parse.
   */
  public async createInvoiceEntriesTransactions(invoice: Invoice,
    subTransactions: SubTransaction[]): Promise<InvoiceEntry[]> {
    const subTransactionRows = subTransactions.reduce<SubTransactionRow[]>((acc, cur) => acc.concat(cur.subTransactionRows), []);

    // Cumulative entries.
    const entryMap = new Map<string, SubTransactionRow[]>();

    subTransactionRows.forEach((tSubRow) => collectProductsByRevision(entryMap, tSubRow));

    const invoiceEntries: InvoiceEntry[] = await reduceMapToInvoiceEntries(entryMap, invoice, this.manager);
    return invoiceEntries;
  }

  /**
   * Adds custom entries to the invoice.
   * @param invoice - The Invoice to append to
   * @param customEntries - THe custom entries to append
   */
  private async AddCustomEntries(invoice: Invoice,
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
      promises.push(this.manager.save(entry));
    });
    await Promise.all(promises);
  }

  static isState(invoice: Invoice, state: InvoiceState): boolean {
    return invoice.latestStatus.state === state;
  }

  private static isCreditInvoice(invoice: Invoice): boolean {
    return invoice.transfer.fromId === invoice.toId;
  }

  /**
   * Deletes the given invoice and makes an undo transfer
   * @param invoiceId
   * @param byId
   */
  public async deleteInvoice(invoiceId: number, byId: number)
    : Promise<Invoice | undefined> {
    // Find base invoice.
    const invoice = await this.manager.findOne(Invoice, { where: { id: invoiceId }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from'] });
    if (!invoice) return undefined;
    await this.createTransfersInvoiceSellers(invoice, true);

    const transferService = new TransferService(this.manager);
    const transactionService = new TransactionService(this.manager);

    // Extract amount from transfer
    const amount: DineroObjectRequest = {
      amount: invoice.transfer.amountInclVat.getAmount(),
      currency: invoice.transfer.amountInclVat.getCurrency(),
      precision: invoice.transfer.amountInclVat.getPrecision(),
    };

    // Credit invoices get their money back from the `createTransfersInvoiceSellers` function.
    if (!InvoiceService.isCreditInvoice(invoice)) {
      // We create an undo transfer that sends the money back to the void.
      const undoTransfer: TransferRequest = {
        amount,
        description: `Deletion of Invoice #${invoice.id}`,
        fromId: invoice.to.id,
        toId: 0,
      };

      await transferService.postTransfer(undoTransfer);
    }


    // Create a new InvoiceStatus
    const invoiceStatus: InvoiceStatus = Object.assign(new InvoiceStatus(), {
      invoice,
      changedBy: byId,
      state: InvoiceState.DELETED,
    });

    // Unreference invoices.
    const { records } = await transactionService
      .getTransactions({ invoiceId: invoice.id });
    const tIds: number[] = records.map((t) => t.id);
    const promises: Promise<any>[] = [];
    const transactions = await this.manager.find(Transaction,
      { where: { id: In(tIds) }, relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          const row = tSubRow;
          if (row.invoice.id === invoice.id) {
            row.invoice = null;
          }
          promises.push(this.manager.save(SubTransactionRow, row));
        });
      });
    });
    await Promise.all(promises);

    // Add it to the invoice and save it.
    await this.manager.save(Invoice, invoice).then(async () => {
      invoice.invoiceStatus.push(invoiceStatus);
      await this.manager.save(InvoiceStatus, invoiceStatus);
    });

    const options = InvoiceService.getOptions({ invoiceId: invoice.id, returnInvoiceEntries: true });
    return this.manager.findOne(Invoice, options);
  }

  /**
   * When an Invoice is created we subtract the relevant balance from the sellers
   * @param invoice
   * @param deletion - If the Invoice is being deleted we add the money to the account
   */
  public async createTransfersInvoiceSellers(invoice: Invoice, deletion = false): Promise<undefined> {
    if (!invoice) return undefined;

    const toIdMap = new Map<number, SubTransaction[]>();
    const transactionService = new TransactionService(this.manager);

    const baseTransactions = (await transactionService.getTransactions({ invoiceId: invoice.id },
      {})).records;
    const transactions = await transactionService.getTransactionsFromBaseTransactions(baseTransactions, false);

    // Collect SubTransactions per Seller
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        collectByToId(toIdMap, tSub);
      });
    });

    const transferRequests: TransferRequest[] = [];

    // For every seller involved in the Invoice
    toIdMap.forEach((value, key) => {
      const fromId = key;
      let totalInclVat = 0;

      // Collect value of transfer
      value.forEach((tSub) => {
        tSub.subTransactionRows.forEach((tSubRow) => {
          totalInclVat += tSubRow.amount * tSubRow.product.priceInclVat.getAmount();
        });
      });

      const description = (deletion ? 'Deletion' : 'Payment') + ` of Invoice #${invoice.id}`;

      // Create transfer
      const transferRequest: TransferRequest = {
        amount: {
          amount: totalInclVat,
          precision: dinero.defaultPrecision,
          currency: dinero.defaultCurrency,
        },
        description,
        // Swapping the to and from based on if it is a deletion.
        fromId: deletion ? 0 : fromId,
        toId: deletion ? fromId : 0,
      };

      transferRequests.push(transferRequest);
    });

    await Promise.all(transferRequests.map((t) => (new TransferService(this.manager)).postTransfer(t)));
  }

  /**
   * Updates the Invoice
   *
   * It is not possible to change the amount or details of the transfer itself.
   *
   * @param update
   */
  public async updateInvoice(update: UpdateInvoiceParams) {
    const { byId, invoiceId, state, ...props } = update;
    const base: Invoice = await this.manager.findOne(Invoice, { where: { id:invoiceId }, relations: ['invoiceStatus', 'latestStatus'] });

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
      await base.save().then(async () => {
        base.invoiceStatus.push(invoiceStatus);
        await this.manager.save(InvoiceStatus, invoiceStatus);
      });
    }

    await this.manager.update(Invoice, { id: base.id }, { ...props, date: props.date ? new Date(props.date) : undefined });
    // Return the newly updated Invoice.

    const options = InvoiceService.getOptions({ invoiceId: base.id, returnInvoiceEntries: true });
    return this.manager.findOne(Invoice, options);
  }

  async getSubTransactionsInvoice(invoice: Invoice, transactions: BaseTransactionResponse[], isCreditInvoice: boolean) {
    const ids = transactions.map((t) => t.id);

    let where: FindOptionsWhere<SubTransaction> = {
      transaction: { id: In(ids) },
    };
    // If we have a credit invoice we filter out all unrelated subTransactions.
    if (isCreditInvoice) where.to = { id: invoice.toId };
    return  this.manager.find(SubTransaction, { where, relations: ['transaction', 'to', 'subTransactionRows',
      'subTransactionRows.invoice', 'subTransactionRows.product', 'subTransactionRows.product.product', 'subTransactionRows.product.vat'] });
  }

  /**
   * Set a reference to an Invoice for all given sub Transactions.
   * @param invoice
   * @param subTransactions
   * @param manager - The EntityManager context to use.
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
   * Returns the latest invoice sent to a User that is not deleted.
   * @param toId
   */
  async getLatestValidInvoice(toId: number): Promise<Invoice> {
    const invoices = (await this.getInvoices({ toId }));
    // Filter the deleted invoices
    const validInvoices = invoices.filter(
      (invoice) =>  !InvoiceService.isState(invoice, InvoiceState.DELETED),
    );
    return validInvoices[validInvoices.length - 1];
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
   * Checks if all transaction are for the same seller
   * @param ids
   */
  public static async checkSingleSellerTransactions(ids: number[]) {
    const transactions = await Transaction.find({ where: { id: In(ids) }, relations: ['subTransactions', 'subTransactions.to'] });
    // Get all sellers from sub transactions
    const sellers = new Set<number>();
    transactions.forEach((t) => {
      t.subTransactions.forEach((tSub) => {
        sellers.add(tSub.to.id);
      });
    });

    if (sellers.size > 1) {
      throw new NotImplementedError('Transactions are not for the same seller');
    }
  }

  /**
   * Creates an Invoice from an CreateInvoiceRequest
   * @param manager - The EntityManager context to use.
   * @param invoiceRequest - The Invoice request to create
   */
  public async createInvoice(invoiceRequest: CreateInvoiceParams)
    : Promise<Invoice> {
    const { forId, byId, isCreditInvoice } = invoiceRequest;
    let params: TransactionFilterParameters;

    const user = await this.manager.findOne(User, { where: { id: forId } });
    // If transactions are specified.
    if (invoiceRequest.transactionIDs) {
      params = { transactionId: invoiceRequest.transactionIDs };
    } else if (invoiceRequest.fromDate) {
      params = { fromDate: asDate(invoiceRequest.fromDate) };
    } else {
      // By default we create an Invoice from all transactions since last invoice.
      const latestInvoice = await this.getLatestValidInvoice(forId);
      let date;
      // If no invoice exists we use the time when the account was created.
      if (latestInvoice) {
        date = latestInvoice.createdAt;
      } else {
        date = user.createdAt;
      }
      params = { fromDate: new Date(date) };
      if (params.fromDate) params.fromDate.setMilliseconds(params.fromDate.getMilliseconds() + 1);
    }

    if (isCreditInvoice) {
      params.toId = user.id;
    } else {
      params.fromId = user.id;
    }

    const transactions = (await (new TransactionService(this.manager)).getTransactions(params, {})).records;
    if (!isCreditInvoice) await InvoiceService.checkSingleSellerTransactions(transactions.map((t) => t.id));
    const transfer = await this.createTransferFromTransactions(forId, transactions, isCreditInvoice);

    // Create a new Invoice
    const newInvoice: Invoice = Object.assign(new Invoice(), {
      toId: forId,
      transfer: transfer.id,
      addressee: invoiceRequest.addressee,
      attention: invoiceRequest.attention,
      invoiceStatus: [],
      invoiceEntries: [],
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

      const subTransactions = await this.getSubTransactionsInvoice(newInvoice, transactions, isCreditInvoice);
      await this.setSubTransactionInvoice(newInvoice, subTransactions);

      await this.createInvoiceEntriesTransactions(newInvoice, subTransactions);
      if (invoiceRequest.customEntries) {
        await this.AddCustomEntries(newInvoice, invoiceRequest.customEntries);
      }

      if (!isCreditInvoice) {
        await this.createTransfersInvoiceSellers(newInvoice);
      }
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

    let records: (BaseInvoiceResponse | InvoiceResponse)[];

    // Case distinction on if we want to return entries or not.
    if (!params.returnInvoiceEntries) {
      records = invoices.map(InvoiceService.asBaseInvoiceResponse);
    } else {
      records = invoices.map(InvoiceService.asInvoiceResponse.bind(this));
    }

    const count = await this.manager.count(Invoice, options);
    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  public static getOptions(params: InvoiceFilterParameters): FindManyOptions<Invoice> {
    const filterMapping: FilterMapping = {
      currentState: 'currentState',
      toId: 'toId',
      invoiceId: 'id',
      latestState: 'latestStatus.state',
    };

    const relations: FindOptionsRelationByString = ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'latestStatus'];
    const options: FindManyOptions<Invoice> = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      order: { createdAt: 'DESC' },
    };

    if (params.returnInvoiceEntries) relations.push('invoiceEntries');
    return { ...options, relations };
  }

}
