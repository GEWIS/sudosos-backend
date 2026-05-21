/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 *
 *  @license
 */

import chai, { expect } from 'chai';
import sinon, { SinonStub } from 'sinon';
import { DataSource, IsNull } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

import Database, { AppDataSource } from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import InvoiceHtmlPdfService from '../../../src/service/pdf/invoice-html-pdf-service';
import Invoice from '../../../src/entity/invoices/invoice';
import InvoicePdf from '../../../src/entity/file/invoice-pdf';
import User from '../../../src/entity/user/user';
import FileService from '../../../src/service/file-service';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { INVOICE_PDF_LOCATION } from '../../../src/files/storage';
import { InvoiceSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import InvoiceService from '../../../src/service/invoice-service';
import { createInvoiceWithTransfers } from '../../helpers/invoice-helpers';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { InvoiceState } from '../../../src/entity/invoices/invoice-status';
import { BAC } from '../../../src/files/templates/bac-letterhead';

chai.use(deepEqualInAnyOrder);

describe('InvoiceHtmlPdfService', async (): Promise<void> => {
  let ctx: {
    connection: DataSource;
    app: Application;
    specification: SwaggerSpecification;
    users: User[];
    invoices: Invoice[];
    pdfParams: any;
    fileService: FileService;
  };

  beforeAll(async function test(): Promise<void> {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const { transactions } = await new TransactionSeeder().seed(users);
    const { invoices } = await new InvoiceSeeder().seed(users, transactions);

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

    ctx = {
      connection,
      app,
      specification,
      users,
      invoices,
      pdfParams,
      fileService,
    };
  });

  afterAll(async () => {
    await finishTestDB(ctx.connection);
  });

  let compileHtmlStub: SinonStub;
  let uploadPdfStub: SinonStub;
  let createFileStub: SinonStub;

  let pdfService = new InvoiceHtmlPdfService(INVOICE_PDF_LOCATION);

  beforeEach(function () {
    compileHtmlStub = sinon.stub(pdfService, 'compileHtml' as any).resolves(Buffer.from('PDF content'));
    uploadPdfStub = sinon.stub(pdfService.fileService, 'uploadPdf');
    createFileStub = sinon.stub(pdfService.fileService, 'createFile');
  });

  afterEach(function () {
    compileHtmlStub.restore();
    uploadPdfStub.restore();
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

  describe('Invoice: getOrCreatePdf', () => {
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

      const newPdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
        hash: await invoice.getPdfParamHash(),
      });
      uploadPdfStub.resolves(newPdf);
      invoice.pdfService = pdfService;

      await invoice.getOrCreatePdf();
      expect(uploadPdfStub).to.have.been.calledOnce;
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

      const newPdf = Object.assign(new InvoicePdf(), {
        ...ctx.pdfParams,
        hash: await invoice.getPdfParamHash(),
      });
      uploadPdfStub.resolves(newPdf);
      invoice.pdfService = pdfService;

      await invoice.getOrCreatePdf(true);

      // Upload was still called.
      expect(uploadPdfStub).to.have.been.calledOnce;
    });
  });

  describe('getParameters', () => {
    it('should return all required parameters for generating an invoice PDF', async () => {
      const invoice = ctx.invoices[0];
      const params = await pdfService.getParameters(invoice);

      expect(params.reference).to.eq(invoice.reference);
      expect(params.identifier).to.eq(String(invoice.id));
      expect(params.customerNumber).to.eq(String(invoice.toId));
      expect(params.subject).to.eq(invoice.description);
      expect(params.date).to.eq(invoice.date.toLocaleDateString('nl-NL'));
      expect(params.addressee).to.eq(invoice.addressee);
      expect(params.address.street).to.eq(invoice.street);
      expect(params.address.postalCode).to.eq(invoice.postalCode);
      expect(params.address.city).to.eq(invoice.city);
      expect(params.address.country).to.eq(invoice.country);

      const expectedDue = new Date(invoice.date);
      expectedDue.setDate(expectedDue.getDate() + BAC.paymentTermDays);
      expect(params.dueDate).to.eq(expectedDue.toLocaleDateString('nl-NL'));
    });

    it('should aggregate totals correctly across all sub-transaction rows', async () => {
      const invoice = ctx.invoices[0];
      const params = await pdfService.getParameters(invoice);

      let expectedExclCents = 0;
      let expectedVatCents = 0;
      invoice.subTransactionRows.forEach((row) => {
        const inclCents = row.product.priceInclVat.getAmount();
        const exclPerUnit = Math.round(inclCents / (1 + row.product.vat.percentage / 100));
        expectedExclCents += exclPerUnit * row.amount;
        expectedVatCents += (inclCents - exclPerUnit) * row.amount;
      });

      expect(params.subtotalExcl).to.be.closeTo(expectedExclCents / 100, 0.001);
      expect(params.totalVat).to.be.closeTo(expectedVatCents / 100, 0.001);
      expect(params.totalIncl).to.be.closeTo((expectedExclCents + expectedVatCents) / 100, 0.001);
      expect(params.lineItems).to.have.length(invoice.subTransactionRows.length);
    });

    it('should sort line items by sub_transaction_row id ascending', async () => {
      const invoice = ctx.invoices[0];
      const params = await pdfService.getParameters(invoice);

      const ids = params.lineItems.map((it) => it.id);
      const sorted = [...ids].sort((a, b) => a - b);
      expect(ids).to.deep.equal(sorted);
    });
  });

  describe('createPdf', () => {
    it('should generate and upload a new PDF for the given invoice', async () => {
      const options = InvoiceService.getOptions({ returnInvoiceEntries: true });
      const invoice = await Invoice.findOne({ ...options, where: { pdf: IsNull() } });

      uploadPdfStub.restore();
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
      compileHtmlStub.rejects(new Error('Failed to generate PDF'));
      const options = InvoiceService.getOptions({ returnInvoiceEntries: true });
      const invoice = await Invoice.findOne({ ...options, where: { pdf: IsNull() } });
      invoice.pdfService = pdfService;
      await expect(invoice.createPdf()).to.be.rejectedWith();
    });
  });

  describe('PDF of deleted invoice', () => {
    it('should produce the same parameters and hash before and after deletion', async () => {
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

  describe('HTML content', () => {
    it('should embed key anchor strings for the F6c template', async () => {
      compileHtmlStub.restore();

      const invoice = ctx.invoices[0];
      invoice.pdfService = pdfService;
      const html = (await pdfService.createRaw(invoice)).toString('utf-8');

      expect(html).to.contain('Total including VAT');
      expect(html).to.contain(BAC.iban);
      expect(html).to.contain(invoice.addressee);
    });

    it('should render an Attn. line when attention is set', async () => {
      compileHtmlStub.restore();

      const invoice = Object.assign(ctx.invoices[0], { attention: 'Jan Janssen' });
      invoice.pdfService = pdfService;
      const html = (await pdfService.createRaw(invoice)).toString('utf-8');

      expect(html).to.contain('Attn. Jan Janssen');
    });

    it('should omit the Attn. line when attention is empty', async () => {
      compileHtmlStub.restore();

      const invoice = Object.assign(ctx.invoices[0], { attention: '' });
      invoice.pdfService = pdfService;
      const html = (await pdfService.createRaw(invoice)).toString('utf-8');

      expect(html).to.not.contain('Attn.');
    });
  });
});
