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


import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { defaultBefore, DefaultContext, finishTestDB } from '../../helpers/test-helpers';
import { WriteOffSeeder } from '../../seed';
import WriteOff from '../../../src/entity/transactions/write-off';
import FileService from '../../../src/service/file-service';
import { Client } from 'pdf-generator-client';
import { WRITE_OFF_PDF_LOCATION } from '../../../src/files/storage';
import sinon, { SinonStub } from 'sinon';
import WriteOffPdfService from '../../../src/service/pdf/write-off-pdf-service';
import User from '../../../src/entity/user/user';
import chai, { expect } from 'chai';
import WriteOffPdf from '../../../src/entity/file/write-off-pdf';

type PdfParams = {
  hash: string;
  downloadName: string;
  location: string;
  createdBy: User;
};

chai.use(deepEqualInAnyOrder);
describe('WriteOffPdfService', () => {
  let ctx: DefaultContext & {
    writeOffs: WriteOff[];
    fileService: FileService,
    client: Client,
    pdfParams: PdfParams,
  };
  
  before(async function t(): Promise<void> {
    this.timeout(50000);
    const defaultContext = await defaultBefore();
    
    const writeOffs = await new WriteOffSeeder().seed();
    const fileService: FileService = new FileService('./data/simple', 'disk');
    
    const pdfParams: PdfParams = {
      hash: 'default hash',
      downloadName: 'test name',
      location: 'location',
      createdBy: writeOffs[0].to,
    };
    
    ctx = {
      ...defaultContext,
      writeOffs,
      fileService,
      client: new Client('url', { fetch }),
      pdfParams,
    };
  });
  
  after(async () => {
    await finishTestDB(ctx.connection);
  });
  
  let generateWriteOffStub: SinonStub;
  let uploadWriteOffStub: SinonStub;
  let createFileStub: SinonStub;
  
  let pdfService = new WriteOffPdfService(WRITE_OFF_PDF_LOCATION);
  
  beforeEach(function () {
    generateWriteOffStub = sinon.stub(pdfService.client, 'generateWriteOff');
    uploadWriteOffStub = sinon.stub(pdfService.fileService, 'uploadPdf');
    createFileStub = sinon.stub(pdfService.fileService, 'createFile');
  });
  
  afterEach(function () {
    generateWriteOffStub.restore();
    uploadWriteOffStub.restore();
    createFileStub.restore();
  });
  
  describe('WriteOff: validatePdfHash', () => {
    it('should return true if the PDF hash matches the expected hash', async () => {
      const writeOff = ctx.writeOffs[0];
      const pdf = new WriteOffPdf();
      pdf.hash = await writeOff.getPdfParamHash();
      writeOff.pdf = pdf;
        
      const result = await writeOff.validatePdfHash();
        
      expect(result).to.be.true;
    });
    it('should return false if the PDF hash does not match the expected hash', async () => {
      const writeOff = ctx.writeOffs[0];
      const pdf = new WriteOffPdf();
      pdf.hash = 'false';
      writeOff.pdf = pdf;
        
      const result = await writeOff.validatePdfHash();
        
      expect(result).to.be.false;
    });
    it('should return false if the writeOff has no associated PDF', async () => {
      const writeOff = ctx.writeOffs[0];
      const result = await writeOff.validatePdfHash();
        
      expect(result).to.be.false;
    });
  });

  describe('WriteOff: getOrCreatePDF', () => {
    it('should return an existing PDF if the hash matches and force is false', async () => {
      const writeOff = ctx.writeOffs[0];

      const pdf = Object.assign(new WriteOffPdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = await writeOff.getPdfParamHash();
      await WriteOffPdf.save(pdf);

      writeOff.pdf = pdf;
      await WriteOff.save(writeOff);

      const file = await writeOff.getOrCreatePdf();
      expect(file.downloadName).to.eq(pdf.downloadName);
    });
    it('should regenerate and return a new PDF if the hash does not match', async () => {
      const writeOff = ctx.writeOffs[0];

      const pdf = Object.assign(new WriteOffPdf(), {
        ...ctx.pdfParams,
      });
      await WriteOffPdf.save(pdf);

      writeOff.pdf = pdf;
      await WriteOff.save(writeOff);

      generateWriteOffStub.resolves({
        data: new Blob(),
        status: 200,
      });
      const newPdf = Object.assign(new WriteOffPdf(), {
        ...ctx.pdfParams,
        hash: await writeOff.getPdfParamHash(),
      });
      uploadWriteOffStub.resolves(newPdf);
      writeOff.pdfService = pdfService;

      await writeOff.getOrCreatePdf();
      expect(uploadWriteOffStub).to.have.been.calledOnce;
    });
    it('should always regenerate and return a new PDF if force is true, even if the hash matches', async () => {
      const writeOff = ctx.writeOffs[0];

      const pdf = Object.assign(new WriteOffPdf(), {
        ...ctx.pdfParams,
      });

      pdf.hash = await writeOff.getPdfParamHash();
      await WriteOffPdf.save(pdf);

      writeOff.pdf = pdf;
      await WriteOff.save(writeOff);

      // Hash is valid
      expect(await writeOff.validatePdfHash()).to.be.true;

      generateWriteOffStub.resolves({
        data: new Blob(),
        status: 200,
      });
      const newPdf = Object.assign(new WriteOffPdf(), {
        ...ctx.pdfParams,
        hash: await writeOff.getPdfParamHash(),
      });
      uploadWriteOffStub.resolves(newPdf);
      writeOff.pdfService = pdfService;

      await writeOff.getOrCreatePdf(true);

      // Upload was still called.
      expect(uploadWriteOffStub).to.have.been.calledOnce;
    });
  });

  describe('createWriteOffPDF', () => {
    it('should generate and upload a new PDF for the given writeOff ID', async () => {
      generateWriteOffStub.resolves({
        data: new Blob(),
        status: 200,
      });

      const writeOff = await WriteOff.findOne({ where: { id: 1 }, relations: ['to'] });
      const newPdf = Object.assign(new WriteOffPdf(), {
        hash: await writeOff.getPdfParamHash(),
        downloadName: 'test',
        location: 'test',
        createdBy: writeOff.to,
        id: 42,
      });
      uploadWriteOffStub.resolves(newPdf);
      createFileStub.resolves({
        downloadName: 'test',
        location: 'test',
        createdBy: writeOff.to.id,
        id: 42,
      });
      writeOff.pdfService = pdfService;
      const writeOffPdf = await writeOff.createPdf();

      expect(writeOffPdf).to.not.be.undefined;
      expect(writeOffPdf.hash).to.eq(await writeOff.getPdfParamHash());
    });
    it('should throw an error if PDF generation fails', async () => {
      generateWriteOffStub.rejects(new Error('Failed to generate PDF'));

      const writeOff = await WriteOff.findOne({ where: { id: 1 }, relations: ['to', 'transfer'] });
      writeOff.pdfService = pdfService;
      await expect(writeOff.createPdf()).to.eventually.be.rejectedWith();
    });
  });
});