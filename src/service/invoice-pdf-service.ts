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

import Invoice from '../entity/invoices/invoice';
import {
  Address,
  Client,
  Company,
  Dates,
  FileSettings,
  Identity,
  IInvoiceRouteParams,
  InvoiceParameters,
  InvoiceReferences,
  InvoiceRouteParams,
  InvoiceType,
  Language,
  Product,
  ProductPricing,
  ReturnFileType,
  TotalPricing,
  VAT,
} from 'pdf-generator-client';
import InvoicePdf from '../entity/file/invoice-pdf';
import FileService from './file-service';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import { INVOICE_PDF_LOCATION } from '../files/storage';
import { PdfGenerator } from '../entity/file/pdf-file';
import { PDF_GEN_URL, PDF_VAT_HIGH, PDF_VAT_LOW, PDF_VAT_ZERO, UNUSED_PARAM } from '../helpers/pdf';

export default class InvoicePdfService {

  static pdfGenerator: PdfGenerator = {
    client: new Client(PDF_GEN_URL, { fetch }),
    fileService: new FileService(INVOICE_PDF_LOCATION),
  };

  /**
   * Converts invoice entries into products and calculates total pricing information for a PDF invoice.
   * This includes categorizing VAT rates and calculating total amounts excluding and including VAT.
   *
   * @param {Invoice} invoice - The invoice whose entries are to be converted.
   * @returns {{products: Product[], pricing: TotalPricing}} An object containing an array of products derived from invoice entries and total pricing information, including VAT calculations.
   */
  static entriesToProductsPricing(invoice: Invoice): { products: Product[], pricing: TotalPricing } {
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

  /**
   * Constructs and returns the parameters required for generating an invoice PDF.
   * This includes invoice references, products, pricing, subject, sender, recipient, dates, company, and address information.
   *
   * @param {Invoice} invoice - The invoice for which to generate the parameters.
   * @returns {InvoiceParameters} An instance of `InvoiceParameters` containing all necessary information for PDF generation.
   */
  static getParameters(invoice: Invoice): InvoiceParameters {
    const { products, pricing } = this.entriesToProductsPricing(invoice);
    products.sort((a, b) => a.name.localeCompare(b.name));

    return new InvoiceParameters({
      reference: new InvoiceReferences({
        ourReference: invoice.reference,
        yourReference: String(invoice.id),
        costCenter: true,
      }),
      products:products,
      pricing: pricing,
      subject: invoice.description,
      // Are unused but still required.
      sender: new Identity({ firstName: UNUSED_PARAM, fullName: UNUSED_PARAM, lastName: UNUSED_PARAM, lastNamePreposition: UNUSED_PARAM }),
      recipient: new Identity({ firstName: UNUSED_PARAM, lastName: UNUSED_PARAM, lastNamePreposition: UNUSED_PARAM, fullName: UNUSED_PARAM }),

      dates: new Dates({
        date: invoice.createdAt,
      }),
      company: new Company({
        name: invoice.addressee,
        id: String(invoice.toId),
      }),
      address: new Address({
        street: invoice.street,
        postalCode: invoice.postalCode,
        city: invoice.city,
        country: invoice.country,
      }),
    });
  }

  /**
   * Prepares and returns the parameters required by the PDF generator client to create an invoice PDF.
   * This includes setting up file settings and consolidating invoice parameters.
   *
   * @param {Invoice} invoice - The invoice for which to generate PDF parameters.
   * @returns {InvoiceRouteParams} An instance of `InvoiceRouteParams` containing the consolidated parameters and settings for PDF generation.
   */
  static getPdfParams(invoice: Invoice): InvoiceRouteParams {
    const params = this.getParameters(invoice);

    const settings: FileSettings = new FileSettings({
      createdAt: new Date(),
      fileType: ReturnFileType.PDF,
      language: Language.ENGLISH,
      name: '',
      stationery: 'BAC',
    });

    const data: IInvoiceRouteParams = {
      params,
      settings,
    };

    return new InvoiceRouteParams(data);
  }

  /**
   * Generates a PDF for an invoice and uploads it to the file service. If the invoice PDF generation or upload fails, it throws an error with the failure reason.
   *
   * @param {number} invoiceId - The ID of the invoice to generate and upload the PDF for.
   * @returns {Promise<InvoicePdf>} A promise that resolves to the `InvoicePdf` entity representing the generated and uploaded PDF.
   */
  public static async createPdf(invoiceId: number): Promise<InvoicePdf> {
    const invoice = await Invoice.findOne({ where: { id: invoiceId }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
    if (!invoice) return undefined;

    const params = this.getPdfParams(invoice);
    try {
      const res = await this.pdfGenerator.client.generateInvoice(InvoiceType.Invoice, params);
      const blob = res.data;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return await this.pdfGenerator.fileService.uploadPdf(invoice, InvoicePdf, buffer, invoice.to);
    } catch (res: any) {
      throw new Error(`Invoice generation failed: ${res.message}`);
    }
  }
}
