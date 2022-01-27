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
import InvoiceStatus, { InvoiceState } from '../entity/invoices/invoice-status';
import {
  BaseInvoiceResponse,
  InvoiceEntryResponse,
  InvoiceResponse,
  InvoiceStatusResponse,
} from '../controller/response/invoice-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import Invoice from '../entity/invoices/invoice';
import { parseUserToBaseResponse } from '../helpers/entity-to-response';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import CreateInvoiceRequest from '../controller/request/create-invoice-request';
import User from '../entity/user/user';
import Transaction from '../entity/transactions/transaction';
import TransferService from './transfer-service';
import TransferRequest from '../controller/request/transfer-request';
import TransactionService from './transaction-service';
import { DineroObjectRequest } from '../controller/request/dinero-request';
import { TransferResponse } from '../controller/response/transfer-response';
import { BaseTransactionResponse } from '../controller/response/transaction-response';

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
      price: invoiceEntries.price.toObject(),
    } as InvoiceEntryResponse;
  }

  /**
   * Parses an invoiceStatus Object to a InvoiceStatusResponse
   * @param invoiceStatus - The invoiceStatus to parse
   */
  private static asInvoiceStatusResponse(invoiceStatus: InvoiceStatus): InvoiceStatusResponse {
    return {
      dateChanged: invoiceStatus.dateChanged.toISOString(),
      state: invoiceStatus.state,
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
      currentState: InvoiceService.asInvoiceStatusResponse(invoice.invoiceStatus[0]),
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
      invoiceEntries: invoice.invoiceEntries.map(this.asInvoiceEntryResponse),
    } as InvoiceResponse;
  }

  /**
   * Creates a Transfer for an Invoice from TransactionResponses
   * @param toId - The user which receives the Invoice/Transfer
   * @param transactions - The array of transactions which to create the Transfer for
   */
  public static async createTransferFromTransactions(toId: number,
    transactions: BaseTransactionResponse[]): Promise<TransferResponse> {
    const dineroObjectRequest: DineroObjectRequest = { ...transactions[0].value, amount: 0 };
    transactions.forEach((t) => { dineroObjectRequest.amount += t.value.amount; });

    const transferRequest: TransferRequest = {
      amount: dineroObjectRequest,
      description: 'Invoice Transfer',
      fromId: 0,
      toId,
    };

    return TransferService.postTransfer(transferRequest);
  }

  // static async getLatestInvoice(toId: number): Promise<Invoice> {
  //
  // }
  //
  // static async createTransferFromHistory(toId: number): Promise<TransferResponse> {
  //   await Invoice.find();
  // }

  /**
   * Creates an Invoice from an CreateInvoiceRequest
   * @param byId - User who created the Invoice
   * @param toId - User who receives the Invoice
   * @param invoiceRequest - The Invoice request to create
   */
  public static async createInvoice(byId:number, toId: number, invoiceRequest: CreateInvoiceRequest)
    : Promise<BaseInvoiceResponse> {
    let transfer: TransferResponse;

    // If transactions are specified.
    if (invoiceRequest.transactionIDs) {
      const transactions = await TransactionService.getTransactionsFromIds(
        invoiceRequest.transactionIDs,
      );
      transfer = await this.createTransferFromTransactions(toId, transactions);
    }

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
      dateChanged: new Date(),
    });

    // First save the Invoice, then the status.
    await Invoice.save(newInvoice).then(async () => {
      newInvoice.invoiceStatus.push(invoiceStatus);
      await InvoiceStatus.save(invoiceStatus);
    });

    // Return the newly created Invoice.
    return (await this.getInvoices(
      { invoiceId: newInvoice.id },
    ))[0];
  }

  /**
   * Function that returns all the invoices based on the given params.
   * Returns either BaseInvoiceResponse, that is without InvoiceEntries, or InvoiceResponse
   * based on if returnInvoiceEntries is set to true.
   * @param params
   */
  public static async getInvoices(params: InvoiceFilterParameters = {})
    : Promise<BaseInvoiceResponse[] | InvoiceResponse[]> {
    const filterMapping: FilterMapping = {
      currentState: 'currentState',
      toId: 'toId',
      invoiceId: 'id',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from'],
    };

    // Case distinction on if we want to return entries or not.
    if (!params.returnInvoiceEntries) {
      const invoices = await Invoice.find(options);
      return invoices.map(this.asBaseInvoiceResponse);
    }

    options.relations.push('invoiceEntries');
    const invoices = await Invoice.find(options);
    return invoices.map(this.asInvoiceResponse.bind(this));
  }

  /**
   * Checks if the CreateInvoiceRequest is valid.
   * @param invoice - The CreateInvoiceRequest to check
   */
  public static async verifyInvoiceRequest(invoice: CreateInvoiceRequest): Promise<boolean> {
    // Check if the To user exists.
    const toUser: User = await User.findOne({ id: invoice.toId });
    if (toUser === undefined) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(invoice, 'transactionIDs')) {
      const transactions = await Transaction.findByIds(invoice.transactionIDs, { relations: ['from'] });
      const notOwnedByUser = transactions.filter((t) => t.from.id !== invoice.toId);
      if (notOwnedByUser.length !== 0) return false;
      if (transactions.length !== invoice.transactionIDs.length) return false;
    }

    return true;
  }
}
