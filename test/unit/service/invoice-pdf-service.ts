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

import InvoicePdfService from '../../../src/service/pdf/invoice-pdf-service';
import { Client } from 'pdf-generator-client';
import sinon, { SinonStub } from 'sinon';
import Invoice from '../../../src/entity/invoices/invoice';
import chai, { expect } from 'chai';
import InvoicePdf from '../../../src/entity/file/invoice-pdf';
import { Connection, IsNull } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import FileService from '../../../src/service/file-service';
import InvoiceEntry from '../../../src/entity/invoices/invoice-entry';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import Transfer from '../../../src/entity/transactions/transfer';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { INVOICE_PDF_LOCATION } from '../../../src/files/storage';
import { InvoiceSeeder, TransactionSeeder, UserSeeder } from '../../seed';

chai.use(deepEqualInAnyOrder);

describe('InvoicePdfService', async (): Promise<void> => {
  let ctx: {
    connection: Connection;
    app: Application;
    specification: SwaggerSpecification;
    users: User[];
    invoices: Invoice[];
    pdfParams: any;
    fileService: FileService,
    client: Client,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seedUsers();
    const { transactions } = await new TransactionSeeder().seedTransactions(users);
    const { invoices } = await new InvoiceSeeder().seedInvoices(users, transactions);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

    const pdfParams = {
      hash: 'default hash',
      downloadName: 'test name',
      location: 'location',
      createdBy: users[0],
    };

    const fileService: FileService = new FileService('./data/simple', 'disk');

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      invoices,
      pdfParams,
      fileService,
      client:  new Client('url', { fetch }),
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  let generateInvoiceStub: SinonStub;
  let uploadInvoiceStub: SinonStub;
  let createFileStub: SinonStub;

  let pdfService = new InvoicePdfService(INVOICE_PDF_LOCATION);

  beforeEach(function () {
    generateInvoiceStub = sinon.stub(pdfService.client, 'generateInvoice');
    uploadInvoiceStub = sinon.stub(pdfService.fileService, 'uploadPdf');
    createFileStub = sinon.stub(pdfService.fileService, 'createFile');
  });

  afterEach(function () {
    // Restore the original function after each test
    generateInvoiceStub.restore();
    uploadInvoiceStub.restore();
    createFileStub.restore();
  });

  describe('Invoice: validatePdfHash', () => {
    it('should return true if the PDF hash matches the expected hash', async () => {
      const invoice = ctx.invoices[0];
      const pdf = new InvoicePdf();
      pdf.hash = await invoice.getPdfParamHash();
      invoice.pdf = pdf;

      const result = await invoice.validatePdfHash();

      expect(result).to.be.true;
    });
    it('should return false if the PDF hash does not match the expected hash', async () => {
      const invoice = ctx.invoices[0];
      const pdf = new InvoicePdf();
      pdf.hash = 'false';
      invoice.pdf = pdf;

      const result = await invoice.validatePdfHash();

      expect(result).to.be.false;
    });
    it('should return false if the invoice has no associated PDF', async () => {
      const invoice = ctx.invoices[0];
      const result = await invoice.validatePdfHash();

      expect(result).to.be.false;
    });
  });

  describe('Invoice: getOrCreatePDF', () => {
    it('should return an existing PDF if the hash matches and force is false', async () => {
      const invoice = ctx.invoices[0];

      const pdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = await invoice.getPdfParamHash();
      await InvoicePdf.save(pdf);

      invoice.pdf = pdf;
      await Invoice.save(invoice);

      const file = await invoice.getOrCreatePdf();
      expect(file.downloadName).to.eq(pdf.downloadName);
    });
    it('should regenerate and return a new PDF if the hash does not match', async () => {
      const invoice = ctx.invoices[0];

      const pdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
      });
      await InvoicePdf.save(pdf);

      invoice.pdf = pdf;
      await Invoice.save(invoice);

      generateInvoiceStub.resolves({
        data: new Blob(),
        status: 200,
      });
      uploadInvoiceStub.resolves({});
      invoice.pdfService = pdfService;

      await invoice.getOrCreatePdf();
      expect(uploadInvoiceStub).to.have.been.calledOnce;
    });
    it('should always regenerate and return a new PDF if force is true, even if the hash matches', async () => {
      const invoice = ctx.invoices[0];

      const pdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = await invoice.getPdfParamHash();
      await InvoicePdf.save(pdf);

      invoice.pdf = pdf;
      await Invoice.save(invoice);

      // Hash is valid
      expect(await invoice.validatePdfHash()).to.be.true;

      generateInvoiceStub.resolves({
        data: new Blob(),
        status: 200,
      });
      uploadInvoiceStub.resolves({});

      await invoice.getOrCreatePdf(true);

      // Upload was still called.
      expect(uploadInvoiceStub).to.have.been.calledOnce;
    });
  });

  describe('entriesToProductsPricing', () => {
    it('should correctly convert invoice entries to products and total pricing', async () => {
      const invoice: Invoice = new Invoice();
      const total = 500 + 3 * 1090 + 5 * 1210;
      const lowVat = 270;
      const highVat = 1050;
      invoice.transfer = { amountInclVat: DineroTransformer.Instance.from(total) } as Transfer;

      invoice.invoiceEntries = [{
        description: 'Product no VAT',
        amount: 1,
        priceInclVat: DineroTransformer.Instance.from(500),
        vatPercentage: 0,
      } as InvoiceEntry,
      {
        description: 'Product low VAT',
        amount: 3,
        priceInclVat: DineroTransformer.Instance.from(1090),
        vatPercentage: 9,
      } as InvoiceEntry,
      {
        description: 'Product high VAT',
        amount: 5,
        priceInclVat: DineroTransformer.Instance.from(1210),
        vatPercentage: 21,
      } as InvoiceEntry,
      ];

      const result = invoice.pdfService.entriesToProductsPricing(invoice);
      expect(result.pricing.inclVat).to.eq(total);
      expect(result.pricing.lowVat).to.eq(lowVat);
      expect(result.pricing.highVat).to.eq(highVat);
      expect(result.pricing.exclVat).to.eq(total - lowVat - highVat);

      const results = [{
        name: 'Product high VAT',
        details: undefined,
        summary: '',
        specification: undefined,
        pricing: {
          basePrice: 1210,
          discount: undefined,
          vatAmount: 21,
          vatCategory: 'ZERO',
          quantity: 5,
        },
      } as any,
      {
        name: 'Product low VAT',
        details: undefined,
        summary: '',
        specification: undefined,
        pricing: {
          basePrice: 1090,
          discount: undefined,
          vatAmount: 9,
          vatCategory: 'ZERO',
          quantity: 3,
        },
      } as any,
      {
        name: 'Product no VAT',
        details: undefined,
        summary: '',
        specification: undefined,
        pricing: {
          basePrice: 500,
          discount: undefined,
          vatAmount: 0,
          vatCategory: 'ZERO',
          quantity: 1,
        },
      } as any];
      expect(result.products).to.deep.equalInAnyOrder(results);
    });
    it('should throw an error for unsupported VAT percentages', async () => {
      const invoice: Invoice = new Invoice();
      invoice.invoiceEntries = [{
        description: 'Product unsupported VAT',
        amount: 1,
        priceInclVat: DineroTransformer.Instance.from(500),
        vatPercentage: 5,
      } as InvoiceEntry];

      expect(() => invoice.pdfService.entriesToProductsPricing(invoice)).to.Throw('Unsupported vat percentage 5 during pdf generation.');
    });
  });

  describe('getInvoiceParameters', () => {
    it('should return all required parameters for generating an invoice PDF', async () => {
      const invoice = ctx.invoices[0];
      const params = await invoice.pdfService.getParameters(invoice);

      expect(params.reference.ourReference).to.eq(invoice.reference);
      expect(params.reference.yourReference).to.eq(String(invoice.id));
      expect(params.reference.costCenter).to.eq(true);

      expect(params.subject).to.eq(invoice.description);
      expect(params.dates.date).to.eq(invoice.date);
      expect(params.company.name).to.eq(invoice.addressee);

      expect(params.address.street).to.eq(invoice.street);
      expect(params.address.postalCode).to.eq(invoice.postalCode);
      expect(params.address.city).to.eq(invoice.city);
      expect(params.address.country).to.eq(invoice.country);
    });
  });

  describe('createInvoicePDF', () => {
    it('should generate and upload a new PDF for the given invoice ID', async () => {
      generateInvoiceStub.resolves({
        data: new Blob(),
        status: 200,
      });

      const invoice = await Invoice.findOne({ where: { pdf: IsNull() }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
      uploadInvoiceStub.restore();
      createFileStub.resolves({
        downloadName: 'test',
        location: 'test',
        createdBy: invoice.to.id,
        id: 41,
      });
      invoice.pdfService = pdfService;
      const invoicePdf = await invoice.createPdf();

      expect(invoicePdf).to.not.be.undefined;
      expect(invoicePdf.hash).to.eq(await invoice.getPdfParamHash());
    });
    it('should throw an error if PDF generation fails', async () => {
      generateInvoiceStub.rejects(new Error('Failed to generate PDF'));

      const invoice = await Invoice.findOne({ where: { id: 1 }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
      invoice.pdfService = pdfService;
      await expect(invoice.createPdf()).to.be.rejectedWith();
    });
  });
});
