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
import Base = Mocha.reporters.Base;

export interface InvoiceParameters {
  /**
   * Filter based on to user.
   */
  toId?: number;
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
  private static asInvoiceEntryResponse(invoiceEntries: InvoiceEntry): InvoiceEntryResponse {
    return {
      description: invoiceEntries.description,
      amount: invoiceEntries.amount,
      price: invoiceEntries.price.toObject(),
    };
  }

  private static asInvoiceStatusResponse(invoiceStatus: InvoiceStatus): InvoiceStatusResponse {
    return {
      dateChanged: invoiceStatus.dateChanged.toISOString(),
      state: invoiceStatus.state,
      changedBy: parseUserToBaseResponse(invoiceStatus.changedBy, false),
    };
  }

  private static asBaseInvoiceResponse(invoice: Invoice): BaseInvoiceResponse {
    return {
      to: parseUserToBaseResponse(invoice.to, false),
      addressee: invoice.addressee,
      description: invoice.description,
      currentState: InvoiceService.asInvoiceStatusResponse(invoice.invoiceStatus[0]),
    } as BaseInvoiceResponse;
  }

  private static asInvoiceResponse(invoice: Invoice)
    : InvoiceResponse {
    return {
      ...this.asBaseInvoiceResponse(invoice),
      invoiceEntries: invoice.invoiceEntries.map(this.asInvoiceEntryResponse),
    } as InvoiceResponse;
  }

  public static async getInvoices(params: InvoiceParameters = {})
    : Promise<BaseInvoiceResponse[] | InvoiceResponse[]> {
    const filterMapping: FilterMapping = {
      currentState: 'currentState',
      toId: 'toId',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['to', 'invoiceStatus'],
    };

    if (!params.returnInvoiceEntries) {
      const invoices = await Invoice.find(options);
      return invoices.map(this.asBaseInvoiceResponse);
    }

    options.relations.push('invoiceEntries');
    const invoices = await Invoice.find(options);
    return invoices.map(this.asInvoiceResponse);
  }
}
