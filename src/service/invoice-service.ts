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
import TransferService from "./transfer-service";
import TransferRequest from "../controller/request/transfer-request";
import BalanceService from "./balance-service";
import TransactionService from "./transaction-service";

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
   * Parses a InvoiceEntry Object to a InvoiceEntryResponse
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
   * Parses a invoiceStatus Object to a InvoiceStatusResponse
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
   * Parses a Invoice Object to a BaseInvoiceResponse
   * @param invoice - The Invoice to parse
   */
  private static asBaseInvoiceResponse(invoice: Invoice): BaseInvoiceResponse {
    return {
      id: invoice.id,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      to: parseUserToBaseResponse(invoice.to, false),
      addressee: invoice.addressee,
      description: invoice.description,
      currentState: InvoiceService.asInvoiceStatusResponse(invoice.invoiceStatus[0]),
    } as BaseInvoiceResponse;
  }

  /**
   * Parses a Invoice Object to a InvoiceResponse
   * @param invoice - The Invoice to parse
   */
  private static asInvoiceResponse(invoice: Invoice)
    : InvoiceResponse {
    return {
      ...this.asBaseInvoiceResponse(invoice),
      invoiceEntries: invoice.invoiceEntries.map(this.asInvoiceEntryResponse),
    } as InvoiceResponse;
  }

  // public static async createInvoice(toId: number, invoice: CreateInvoiceRequest): Promise<InvoiceResponse> {
  // }

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
      relations: ['to', 'invoiceStatus'],
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
