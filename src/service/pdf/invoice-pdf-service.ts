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

import Invoice from '../../entity/invoices/invoice';
import {
  Address,
  Company,
  Dates, FileResponse,
  Identity,
  InvoiceParameters,
  InvoiceReferences,
  InvoiceRouteParams,
  InvoiceType,
  TotalPricing,
} from 'pdf-generator-client';
import InvoicePdf from '../../entity/file/invoice-pdf';
import {
  emptyIdentity,
  PDF_VAT_HIGH,
  PDF_VAT_LOW,
  PDF_VAT_ZERO,
  subTransactionRowToProduct,
  UNUSED_PARAM,
} from '../../helpers/pdf';
import { PdfService } from './pdf-service';
import SubTransactionRow from '../../entity/transactions/sub-transaction-row';


export default class InvoicePdfService extends PdfService<InvoicePdf, Invoice, InvoiceRouteParams> {
  routeConstructor = InvoiceRouteParams;

  pdfConstructor = InvoicePdf;

  generator(routeParams: InvoiceRouteParams): Promise<FileResponse> {
    return this.client.generateInvoice(InvoiceType.Invoice, routeParams);
  }

  invoiceToPricing(invoice: Invoice): TotalPricing {
    let exclVat: number = 0, lowVat: number = 0, highVat: number = 0, inclVat = 0;
    invoice.subTransactionRows.map((str: SubTransactionRow) => {
      exclVat += str.product.priceInclVat.getAmount() * str.amount;
      const baseExclVat = Math.round(str.product.priceInclVat.getAmount()  / (1 + (str.product.vat.percentage / 100))) * str.amount;
      switch (str.product.vat.percentage) {
        case PDF_VAT_LOW:
          lowVat += str.product.priceInclVat.getAmount() - baseExclVat;
          break;
        case PDF_VAT_HIGH:
          highVat += str.product.priceInclVat.getAmount() - baseExclVat;
          break;
        case PDF_VAT_ZERO:
          break;
        default:
          throw new Error(`Unsupported vat percentage ${str.product.vat.percentage} during pdf generation.`);
      }
      inclVat += str.product.priceInclVat.getAmount() * str.amount;
    });
    return new TotalPricing({
      exclVat,
      lowVat,
      highVat,
      inclVat,
    });
  }

  async getParameters(entity: Invoice): Promise<InvoiceParameters> {
    const products = entity.subTransactionRows.map((str: SubTransactionRow) => subTransactionRowToProduct(str));
    products.sort((a, b) => a.name.localeCompare(b.name));

    const pricing = this.invoiceToPricing(entity);

    return new InvoiceParameters({
      reference: new InvoiceReferences({
        ourReference: entity.reference,
        yourReference: String(entity.id),
        costCenter: true,
      }),
      products,
      pricing,
      subject: entity.description,
      sender: emptyIdentity(),
      // Partly unused, but still required.
      recipient: new Identity({ firstName: UNUSED_PARAM, lastName: UNUSED_PARAM, lastNamePreposition: UNUSED_PARAM, fullName: entity.attention }),
      description: entity.description,
      dates: new Dates({
        date: entity.date,
      }),
      company: new Company({
        name: entity.addressee,
        id: String(entity.toId),
      }),
      address: new Address({
        street: entity.street,
        postalCode: entity.postalCode,
        city: entity.city,
        country: entity.country,
      }),
    });
  }
}
