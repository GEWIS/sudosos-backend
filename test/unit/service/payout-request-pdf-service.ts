import { Client } from 'pdf-generator-client';
import sinon, { SinonStub } from 'sinon';
import chai, { expect } from 'chai';
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import {
  seedPayoutRequests,
  seedUsers,
} from '../../seed';
import Swagger from '../../../src/start/swagger';
import { json } from 'body-parser';
import FileService from '../../../src/service/file-service';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import PayoutRequest from "../../../src/entity/transactions/payout-request";
import PayoutRequestPdfService from "../../../src/service/payout-request-pdf-service";
import PayoutRequestPdf from "../../../src/entity/file/payout-request-pdf";

chai.use(deepEqualInAnyOrder);
describe('PayoutRequestPdfService', async () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    payoutRequests: PayoutRequest[],
    pdfParams: any,
    fileService: FileService,
    client: Client,
  };

  before(async function test(): Promise<void> {
    this.timeout(50000);
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();
    const { payoutRequests } = await seedPayoutRequests(users);

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
      payoutRequests,
      pdfParams,
      fileService,
      client:  new Client('url', { fetch }),
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  let generatePayoutRequestStub: SinonStub;
  let uploadPayoutStub: SinonStub;
  let createFileStub: SinonStub;

  beforeEach(function () {
    generatePayoutRequestStub = sinon.stub(PayoutRequestPdfService.pdfGenerator.client, 'generatePayout');
    uploadPayoutStub = sinon.stub(PayoutRequestPdfService.pdfGenerator.fileService, 'uploadPdf');
    createFileStub = sinon.stub(PayoutRequestPdfService.pdfGenerator.fileService, 'createFile');
  });

  afterEach(function () {
    // Restore the original function after each test
    generatePayoutRequestStub.restore();
    uploadPayoutStub.restore();
    createFileStub.restore();
  });

  describe('PayoutRequest: validatePdfHash', () => {
    it('should return true if the PDF hash matches the expected hash', async () => {
      const payoutRequest = ctx.payoutRequests[0];
      const pdf = new PayoutRequestPdf();
      pdf.hash = payoutRequest.getPdfParamHash();
      payoutRequest.pdf = pdf;

      const result = FileService.validatePdfHash(payoutRequest);

      expect(result).to.be.true;
    });
    it('should return false if the PDF hash does not match the expected hash', async () => {
      const payoutRequest = ctx.payoutRequests[0];
      const pdf = new PayoutRequestPdf();
      pdf.hash = 'false';
      payoutRequest.pdf = pdf;

      const result = FileService.validatePdfHash(payoutRequest);

      expect(result).to.be.false;
    });
    it('should return false if the payoutRequest has no associated PDF', async () => {
      const payoutRequest = ctx.payoutRequests[0];
      const result = FileService.validatePdfHash(payoutRequest);

      expect(result).to.be.false;
    });
  });

  describe('PayoutRequest: getOrCreatePDF', () => {
    it('should return an existing PDF if the hash matches and force is false', async () => {
      const payoutRequest = ctx.payoutRequests[0];

      const pdf = Object.assign(new PayoutRequestPdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = payoutRequest.getPdfParamHash();
      await PayoutRequestPdf.save(pdf);

      payoutRequest.pdf = pdf;
      await PayoutRequest.save(payoutRequest);

      const file = await FileService.getOrCreatePDF(payoutRequest);
      expect(file.downloadName).to.eq(pdf.downloadName);
    });
    it('should regenerate and return a new PDF if the hash does not match', async () => {
      const payoutRequest = ctx.payoutRequests[0];

      const pdf = Object.assign(new PayoutRequestPdf(), {
        ...ctx.pdfParams,
      });
      await PayoutRequestPdf.save(pdf);

      payoutRequest.pdf = pdf;
      await PayoutRequest.save(payoutRequest);

      generatePayoutRequestStub.resolves({
        data: new Blob(),
        status: 200,
      });
      uploadPayoutStub.resolves({});

      await FileService.getOrCreatePDF(payoutRequest);
      expect(uploadPayoutStub).to.have.been.calledOnce;
    });
    it('should always regenerate and return a new PDF if force is true, even if the hash matches', async () => {
      const payoutRequest = ctx.payoutRequests[0];

      const pdf = Object.assign(new PayoutRequestPdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = payoutRequest.getPdfParamHash();
      await PayoutRequestPdf.save(pdf);

      payoutRequest.pdf = pdf;
      await PayoutRequest.save(payoutRequest);

      // Hash is valid
      expect(FileService.validatePdfHash(payoutRequest)).to.be.true;

      generatePayoutRequestStub.resolves({
        data: new Blob(),
        status: 200,
      });
      uploadPayoutStub.resolves({});

      await FileService.getOrCreatePDF(payoutRequest, true);

      // Upload was still called.
      expect(uploadPayoutStub).to.have.been.calledOnce;
    });
    it('should return undefined if the payoutRequest does not exist', async () => {
      const file = await FileService.getOrCreatePDF(undefined);
      expect(file).to.be.undefined;
    });
  });

  describe('createPayoutRequestPDF', () => {
    it('should generate and upload a new PDF for the given payoutRequest ID', async () => {
      generatePayoutRequestStub.resolves({
        data: new Blob(),
        status: 200,
      });

      const payoutRequest = await PayoutRequest.findOne({ where: { id: 1 }, relations: ['requestedBy', 'payoutRequestStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf'] });
      uploadPayoutStub.restore();
      createFileStub.resolves({
        downloadName: 'test',
        location: 'test',
        createdBy: payoutRequest.requestedBy.id,
        id: 42,
      });
      const payoutRequestPdf = await PayoutRequestPdfService.createPdf(payoutRequest.id);

      expect(payoutRequestPdf).to.not.be.undefined;
      expect(payoutRequestPdf.hash).to.eq(payoutRequest.getPdfParamHash());
    });
    it('should return undefined if the payoutRequest does not exist', async () => {
      const payoutRequestPdf = await PayoutRequestPdfService.createPdf(-1);
      expect(payoutRequestPdf).to.be.undefined;
    });
    it('should throw an error if PDF generation fails', async () => {
      generatePayoutRequestStub.rejects(new Error('Failed to generate PDF'));

      const payoutRequest = await PayoutRequest.findOne({ where: { id: 1 }, relations: ['requestedBy', 'payoutRequestStatus', 'transfer', 'transfer.to', 'transfer.from', 'pdf'] });
      await expect(PayoutRequestPdfService.createPdf(payoutRequest.id)).to.be.rejectedWith();
    });
  });
});
