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
import Invoice from '../entity/invoices/invoice';
import { SimpleFileResponse } from '../controller/response/simple-file-response';
import { parseFileToResponse } from '../helpers/revision-to-response';
import {
  Address,
  Client,
  Company,
  Dates,
  FileResponse,
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
import { hashJSON } from '../helpers/hash';

export interface PdfGenerator {
  client: Client,
  fileService: FileService
}

// Used for grouping in the PDF.
// These are 'hardcoded' since if these would change the template also would have to change.
const PDF_VAT_ZERO = 0;
const PDF_VAT_LOW = 9;
const PDF_VAT_HIGH = 21;

const UNUSED_PARAM = '';

export default class InvoicePdfService {

  /**
   * Checks if the invoice pdf parameter signature has changed.
   * @param invoice
   * @returns true - If the signature did not change, false if otherwise.
   */
  static validatePdfHash(invoice: Invoice): boolean {
    if (!invoice.pdf) return false;
    const hash = hashJSON(this.getInvoiceParameters(invoice));
    return hash === invoice.pdf.hash;
  }

  /**
   *
   * @param invoiceId
   * @param pdfGenerator
   * @param force
   */
  public static async getOrCreatePDF(invoiceId: number, pdfGenerator: PdfGenerator, force = false): Promise<SimpleFileResponse> {
    const invoice = await Invoice.findOne({ where: { id: invoiceId }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
    if (!invoice) return undefined;


    if (invoice.pdf && !force) {
      // check if invoice is current.
      if (this.validatePdfHash(invoice)) return parseFileToResponse(invoice.pdf);
    }

    const pdf = await this.createInvoicePDF(invoiceId, pdfGenerator);
    return parseFileToResponse(pdf);
  }

  static entriesToProductsPricing(invoice: Invoice): { products: Product[], pricing: TotalPricing } {
    let exclVat: number = 0, lowVat: number = 0, highVat: number = 0;
    const products = invoice.invoiceEntries.map((entry: InvoiceEntry) => {
      // SudoSOS rounds per product.
      const price = entry.priceInclVat.getAmount() * entry.amount;
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
    return {
      products,
      pricing: new TotalPricing({
        exclVat,
        lowVat,
        highVat,
        inclVat: invoice.transfer.amount.getAmount(),
      }),
    };
  }

  static getInvoiceParameters(invoice: Invoice): InvoiceParameters {
    const { products, pricing } = this.entriesToProductsPricing(invoice);

    return new InvoiceParameters({
      reference: new InvoiceReferences({
        ourReference: invoice.reference,
        yourReference: String(invoice.id),
        costCenter: true,
      }),
      products:products,
      pricing: pricing,
      subject: invoice.description,
      sender: new Identity({ firstName: UNUSED_PARAM, fullName: UNUSED_PARAM, lastName: UNUSED_PARAM, lastNamePreposition: UNUSED_PARAM }),
      recipient: new Identity({ firstName: UNUSED_PARAM, lastName: UNUSED_PARAM, lastNamePreposition: UNUSED_PARAM, fullName: UNUSED_PARAM }),
      dates: new Dates({
        date: invoice.createdAt,
      }),
      company: new Company({
        name: `${invoice.to.firstName} ${invoice.to.lastName}`,
      }),
      address: new Address({
        street: invoice.street,
        postalCode: invoice.postalCode,
        city: invoice.city,
        country: invoice.country,
      }),
    });
  }

  // todo fix
  static getPdfParams(invoice: Invoice): InvoiceRouteParams {
    const params = this.getInvoiceParameters(invoice);
    console.error(params);
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

  public static async createInvoicePDF(invoiceId: number, pdfGenerator: PdfGenerator): Promise<InvoicePdf> {
    const invoice = await Invoice.findOne({ where: { id: invoiceId }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
    if (!invoice) return undefined;

    const params = this.getPdfParams(invoice);
    return pdfGenerator.client.generateInvoice(InvoiceType.Invoice, params).then(async (res: FileResponse) => {
      const blob = res.data;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return pdfGenerator.fileService.uploadInvoicePdf(invoice, buffer, invoice.to, hashJSON(this.getInvoiceParameters(invoice)));
    }).catch((res: any) => {
      throw new Error(`Invoice generation failed: ${res}`);
    });
  }
}
