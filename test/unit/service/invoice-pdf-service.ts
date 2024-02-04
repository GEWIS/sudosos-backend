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
import InvoicePdfService, {PdfGenerator} from '../../../src/service/invoice-pdf-service';
import {
  Client,
} from 'pdf-generator-client';
import sinon from 'sinon';
import Invoice from '../../../src/entity/invoices/invoice';
import { expect } from 'chai';
import InvoicePdf from '../../../src/entity/file/invoice-pdf';
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import {
  seedContainers, seedInvoices,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedTransactions,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import { hashJSON } from '../../../src/helpers/hash';
describe('InvoicePdfService', async (): Promise<void> => {
  let ctx: {
    connection: Connection;
    app: Application;
    specification: SwaggerSpecification;
    users: User[];
    invoices: Invoice[];
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();

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

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      users,
      invoices,
    };
  });

  // TODO fix any
  let generateInvoiceStub: any;

  beforeEach(function () {
    generateInvoiceStub = sinon.stub(Client.prototype, 'generateInvoice');
  });

  afterEach(function () {
    // Restore the original function after each test
    generateInvoiceStub.restore();
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
      const pdf = new InvoicePdf();

      pdf.hash = hashJSON(InvoicePdfService.getInvoiceParameters(invoice));
      pdf.downloadName = 'test name';
      pdf.location = 'location';
      pdf.createdBy = ctx.users[0];
      await InvoicePdf.save(pdf);

      await Invoice.save(invoice);
      console.error(invoice);
      const file = await InvoicePdfService.getOrCreatePDF(invoice.id, {} as PdfGenerator);
      expect(file.downloadName).to.eq(pdf.downloadName);
    });
    it('should regenerate and return a new PDF if the hash does not match', async () => {});
    it('should always regenerate and return a new PDF if force is true, even if the hash matches', async () => {});
    it('should return undefined if the invoice does not exist', async () => {});
    it('should handle and log errors if PDF generation fails', async () => {});
  });

  describe('entriesToProductsPricing', () => {
    it('should correctly convert invoice entries to products and total pricing', async () => {});
    it('should calculate VAT amounts correctly for each VAT category', async () => {});
    it('should handle invoices with zero entries', async () => {});
    it('should throw an error for unsupported VAT percentages', async () => {});
  });

  describe('getInvoiceParameters', () => {
    it('should return all required parameters for generating an invoice PDF', async () => {});
    it('should handle cases with missing invoice information gracefully', async () => {});
    it('should correctly format the recipient and sender information', async () => {});
    it('should include correct dates, company, and address information', async () => {});
  });

  describe('getPdfParams', () => {
    it('should prepare PDF parameters including file settings', async () => {});
    it('should log an error if parameters are missing or incorrect', async () => {});
    it('should correctly set the language, file type, and stationery for the PDF', async () => {});
  });

  describe('createInvoicePDF', () => {
    it('should generate and upload a new PDF for the given invoice ID', async () => {});
    it('should return undefined if the invoice does not exist', async () => {});
    it('should handle and log errors during PDF generation', async () => {});
    it('should handle and log errors during PDF upload', async () => {});
    it('should verify that the generated PDF matches the expected format and content', async () => {});
  });
});
