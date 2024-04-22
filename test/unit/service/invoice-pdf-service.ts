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
import InvoicePdfService from '../../../src/service/invoice-pdf-service';
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
import {
  seedContainers,
  seedInvoices,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import { hashJSON } from '../../../src/helpers/hash';
import FileService from '../../../src/service/file-service';
import InvoiceEntry from '../../../src/entity/invoices/invoice-entry';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import Transfer from '../../../src/entity/transactions/transfer';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { truncateAllTables } from '../../setup';

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

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(
      users,
      categories,
      vatGroups,
    );
    const { containerRevisions } = await seedContainers(
      users,
      productRevisions,
    );
    const { pointOfSaleRevisions } = await seedPointsOfSale(
      users,
      containerRevisions,
    );
    const { transactions } = await seedTransactions(
      users,
      pointOfSaleRevisions,
    );
    const { invoices } = await seedInvoices(users, transactions);

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
    await Database.finish(ctx.connection);
  });

  let generateInvoiceStub: SinonStub;
  let uploadInvoiceStub: SinonStub;
  let createFileStub: SinonStub;

  beforeEach(function () {
    generateInvoiceStub = sinon.stub(InvoicePdfService.pdfGenerator.client, 'generateInvoice');
    uploadInvoiceStub = sinon.stub(InvoicePdfService.pdfGenerator.fileService, 'uploadInvoicePdf');
    createFileStub = sinon.stub(InvoicePdfService.pdfGenerator.fileService, 'createFile');
  });

  afterEach(function () {
    // Restore the original function after each test
    generateInvoiceStub.restore();
    uploadInvoiceStub.restore();
    createFileStub.restore();
  });

  describe('validatePdfHash', () => {
    it('should return true if the PDF hash matches the expected hash', async () => {
      const invoice = ctx.invoices[0];
      const pdf = new InvoicePdf();
      pdf.hash = hashJSON(InvoicePdfService.getInvoiceParameters(invoice));
      invoice.pdf = pdf;

      const result = InvoicePdfService.validatePdfHash(invoice);

      expect(result).to.be.true;
    });
    it('should return false if the PDF hash does not match the expected hash', async () => {
      const invoice = ctx.invoices[0];
      const pdf = new InvoicePdf();
      pdf.hash = 'false';
      invoice.pdf = pdf;

      const result = InvoicePdfService.validatePdfHash(invoice);

      expect(result).to.be.false;
    });
    it('should return false if the invoice has no associated PDF', async () => {
      const invoice = ctx.invoices[0];
      const result = InvoicePdfService.validatePdfHash(invoice);

      expect(result).to.be.false;
    });
  });

  describe('getOrCreatePDF', () => {
    it('should return an existing PDF if the hash matches and force is false', async () => {
      const invoice = ctx.invoices[0];

      const pdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = hashJSON(InvoicePdfService.getInvoiceParameters(invoice));
      await InvoicePdf.save(pdf);

      invoice.pdf = pdf;
      await Invoice.save(invoice);

      const file = await InvoicePdfService.getOrCreatePDF(invoice.id);
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

      await InvoicePdfService.getOrCreatePDF(invoice.id);
      expect(uploadInvoiceStub).to.have.been.calledOnce;
    });
    it('should always regenerate and return a new PDF if force is true, even if the hash matches', async () => {
      const invoice = ctx.invoices[0];

      const pdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = hashJSON(InvoicePdfService.getInvoiceParameters(invoice));
      await InvoicePdf.save(pdf);

      invoice.pdf = pdf;
      await Invoice.save(invoice);

      // Hash is valid
      expect(InvoicePdfService.validatePdfHash(invoice)).to.be.true;

      generateInvoiceStub.resolves({
        data: new Blob(),
        status: 200,
      });
      uploadInvoiceStub.resolves({});

      await InvoicePdfService.getOrCreatePDF(invoice.id, true);

      // Upload was still called.
      expect(uploadInvoiceStub).to.have.been.calledOnce;
    });
    it('should return undefined if the invoice does not exist', async () => {
      const file = await InvoicePdfService.getOrCreatePDF(-1);
      expect(file).to.be.undefined;
    });
  });

  describe('entriesToProductsPricing', () => {
    it('should correctly convert invoice entries to products and total pricing', async () => {
      const invoice: Invoice = {} as Invoice;
      const total = 500 + 3 * 1090 + 5 * 1210;
      const lowVat = 270;
      const highVat = 1050;
      invoice.transfer = { amount: DineroTransformer.Instance.from(total) } as Transfer;

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

      const result = InvoicePdfService.entriesToProductsPricing(invoice);
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
      const invoice: Invoice = {} as Invoice;
      invoice.invoiceEntries = [{
        description: 'Product unsupported VAT',
        amount: 1,
        priceInclVat: DineroTransformer.Instance.from(500),
        vatPercentage: 5,
      } as InvoiceEntry];

      expect(() => InvoicePdfService.entriesToProductsPricing(invoice)).to.Throw('Unsupported vat percentage 5 during pdf generation.');
    });
  });

  describe('getInvoiceParameters', () => {
    it('should return all required parameters for generating an invoice PDF', async () => {
      const invoice = ctx.invoices[0];
      const params = InvoicePdfService.getInvoiceParameters(invoice);

      expect(params.reference.ourReference).to.eq(invoice.reference);
      expect(params.reference.yourReference).to.eq(String(invoice.id));
      expect(params.reference.costCenter).to.eq(true);

      expect(params.subject).to.eq(invoice.description);
      expect(params.dates.date).to.eq(invoice.createdAt);
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
      const invoicePdf = await InvoicePdfService.createInvoicePDF(invoice.id);

      expect(invoicePdf).to.not.be.undefined;
      expect(invoicePdf.hash).to.eq(hashJSON(InvoicePdfService.getInvoiceParameters(invoice)));
    });
    it('should return undefined if the invoice does not exist', async () => {
      const invoicePdf = await InvoicePdfService.createInvoicePDF(-1);
      expect(invoicePdf).to.be.undefined;
    });
    it('should throw an error if PDF generation fails', async () => {
      generateInvoiceStub.rejects(new Error('Failed to generate PDF'));

      const invoice = await Invoice.findOne({ where: { id: 1 }, relations: ['to', 'invoiceStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf', 'invoiceEntries'] });
      await expect(InvoicePdfService.createInvoicePDF(invoice.id)).to.be.rejectedWith('Invoice generation failed: Error: Failed to generate PDF');
    });
  });
});
