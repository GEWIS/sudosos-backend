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
  Product,
  ProductPricing,
  TotalPricing,
  VAT,
} from 'pdf-generator-client';
import InvoicePdf from '../../entity/file/invoice-pdf';
import InvoiceEntry from '../../entity/invoices/invoice-entry';
import { emptyIdentity, PDF_VAT_HIGH, PDF_VAT_LOW, PDF_VAT_ZERO, UNUSED_PARAM } from '../../helpers/pdf';
import { PdfService } from './pdf-service';


export default class InvoicePdfService extends PdfService<InvoicePdf, Invoice, InvoiceRouteParams> {
  routeConstructor = InvoiceRouteParams;

  pdfConstructor = InvoicePdf;

  generator(routeParams: InvoiceRouteParams): Promise<FileResponse> {
    return this.client.generateInvoice(InvoiceType.Invoice, routeParams);
  }

  entriesToProductsPricing(invoice: Invoice): { products: Product[], pricing: TotalPricing } {
    let exclVat: number = 0, lowVat: number = 0, highVat: number = 0, inclVat = 0;
    let products = invoice.invoiceEntries.map((entry: InvoiceEntry) => {
      // SudoSOS rounds per product.
      const price = entry.priceInclVat.getAmount() * entry.amount;
      inclVat += price;
      const baseExclVat = Math.round(entry.priceInclVat.getAmount()  / (1 + (entry.vatPercentage / 100))) * entry.amount;

      exclVat += baseExclVat;

      switch (entry.vatPercentage) {
        case PDF_VAT_LOW:
          lowVat += (price - baseExclVat);
          break;
        case PDF_VAT_HIGH:
          highVat += (price - baseExclVat);
          break;
        case PDF_VAT_ZERO:
          break;
        default:
          throw new Error(`Unsupported vat percentage ${entry.vatPercentage} during pdf generation.`);
      }

      return new Product({
        name: entry.description,
        summary: UNUSED_PARAM,
        pricing: new ProductPricing({
          basePrice: entry.priceInclVat.getAmount(),
          vatAmount: entry.vatPercentage,
          // is actually unused
          vatCategory: VAT.ZERO,
          quantity: entry.amount,
        }),
      });
    });

    // Sort products by VAT amount from high to low
    // Design decision: we need some form of sorting since this is not guaranteed by the query. If we do not sort
    // We would get different hashes just because the order changed.
    products = products.sort((a, b) => b.pricing.vatAmount - a.pricing.vatAmount);

    return {
      products,
      pricing: new TotalPricing({
        exclVat,
        lowVat,
        highVat,
        inclVat,
      }),
    };
  }

  async getParameters(entity: Invoice): Promise<InvoiceParameters> {
    const { products, pricing } = this.entriesToProductsPricing(entity);
    products.sort((a, b) => a.name.localeCompare(b.name));

    return new InvoiceParameters({
      reference: new InvoiceReferences({
        ourReference: entity.reference,
        yourReference: String(entity.id),
        costCenter: true,
      }),
      products:products,
      pricing: pricing,
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
