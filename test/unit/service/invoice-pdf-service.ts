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
import Database, { AppDataSource } from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import FileService from '../../../src/service/file-service';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { INVOICE_PDF_LOCATION } from '../../../src/files/storage';
import { InvoiceSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import InvoiceService from '../../../src/service/invoice-service';
import { createInvoiceWithTransfers } from './invoice-service';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { InvoiceState } from '../../../src/entity/invoices/invoice-status';

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

    const users = await new UserSeeder().seed();
    const { transactions } = await new TransactionSeeder().seed(users);
    const { invoices } = await new InvoiceSeeder().seed(users, transactions);

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
      client: new Client('url', { fetch }),
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

  // TODO: test invoiceToPricing and subTransactionRowToProduct
  describe('invoiceToPricing', () => {
    it('should return the correct pricing for an invoice', async () => {
      const invoice = ctx.invoices[0];
      const pricing = invoice.pdfService.invoiceToPricing(invoice);

      let totalExclVat = 0, totalInclVat = 0;
      invoice.subTransactionRows.forEach((row) => {
        totalExclVat += Math.round(row.product.priceInclVat.getAmount() / (1 + (row.product.vat.percentage / 100))) * row.amount;
        totalInclVat += row.product.priceInclVat.getAmount() * row.amount;
      });

      expect(pricing.exclVat).to.eq(totalExclVat);
      expect(pricing.inclVat).to.eq(totalInclVat);
      expect(pricing.exclVat + pricing.lowVat + pricing.highVat).to.eq(totalInclVat);
    })
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

      const options = InvoiceService.getOptions({ returnInvoiceEntries: true });
      const invoice = await Invoice.findOne({ ...options, where: { pdf: IsNull() } });

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
      const options = InvoiceService.getOptions({ returnInvoiceEntries: true });
      const invoice = await Invoice.findOne({ ...options, where: { pdf: IsNull() } });
      invoice.pdfService = pdfService;
      await expect(invoice.createPdf()).to.be.rejectedWith();
    });
  });
  describe('PDF of deleted invoice', () => {
    it('should return the correct PDF', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const invoice = await createInvoiceWithTransfers(debtor.id, creditor.id, 1);
        const hash = await invoice.getPdfParamHash();
        const params = await invoice.pdfService.getParameters(invoice);

        const updatedInvoice = await AppDataSource.manager.transaction(async (manager) => {
          return new InvoiceService(manager).updateInvoice({
            byId: invoice.to.id,
            invoiceId: invoice.id,
            state: InvoiceState.DELETED,
          });
        });

        const newHash = await updatedInvoice.getPdfParamHash();
        const newParams = await updatedInvoice.pdfService.getParameters(updatedInvoice);
        expect(newHash).to.deep.equal(hash);
        expect(newParams).to.deep.equal(params);
      });
    });
  });
});
