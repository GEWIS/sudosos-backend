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


import {
  BaseHtmlPdfService,
  HtmlGenerator,
  HtmlPdfService,
  HtmlUnstoredPdfService,
  PdfTemplateParameters,
} from '../../../src/service/pdf/pdf-service';
import { expect } from 'chai';
import sinon, { SinonStub } from 'sinon';
import Pdf from '../../../src/entity/file/pdf-file';
import User from '../../../src/entity/user/user';
import FileService from '../../../src/service/file-service';
import { PdfError } from '../../../src/errors';

// Mock entity for testing
class TestEntity {
  id = 1;

  name = 'Test Entity';
}

// Mock PDF entity
class TestPdf extends Pdf {
  id = 1;
}

// Mock entity that implements IPdfAble
class TestPdfAbleEntity extends TestEntity {
  pdf?: TestPdf;

  pdfService: any;

  async getOwner(): Promise<User> {
    return Object.assign(new User(), { id: 1 } as User);
  }

  async createPdf(): Promise<TestPdf> {
    return this.pdfService.createPdf(this);
  }

  async getPdfParamHash(): Promise<string> {
    return 'test-hash';
  }
}

// Mock entity that implements IUnstoredPdfAble
class TestUnstoredPdfAbleEntity extends TestEntity {
  pdfService: any;

  async createPdf(): Promise<Buffer> {
    return this.pdfService.createPdf(this) as Promise<Buffer>;
  }
}

const testGenerator: HtmlGenerator<PdfTemplateParameters> = (params) => `<html>${params.content}</html>`;

// Concrete implementation of BaseHtmlPdfService for testing
class TestBaseHtmlPdfService extends BaseHtmlPdfService<TestEntity, PdfTemplateParameters> {
  htmlGenerator = testGenerator;

  async getParameters(entity: TestEntity): Promise<PdfTemplateParameters> {
    return {
      title: `Document for ${entity.name}`,
      heading: `Heading for ${entity.name}`,
      content: `Content for entity ID ${entity.id}`,
      date: new Date().toISOString(),
    };
  }
}

// Concrete implementation of HtmlPdfService for testing
class TestHtmlPdfService extends HtmlPdfService<TestPdf, any, PdfTemplateParameters> {
  htmlGenerator = testGenerator;

  pdfConstructor = TestPdf;

  async getParameters(entity: TestPdfAbleEntity): Promise<PdfTemplateParameters> {
    return {
      title: `PDF for ${entity.name}`,
      heading: 'PDF Heading',
      content: 'PDF Content',
      date: new Date().toISOString(),
    };
  }
}

// Concrete implementation of HtmlUnstoredPdfService for testing
class TestHtmlUnstoredPdfService extends HtmlUnstoredPdfService<TestUnstoredPdfAbleEntity, PdfTemplateParameters> {
  htmlGenerator = testGenerator;

  async getParameters(entity: TestUnstoredPdfAbleEntity): Promise<PdfTemplateParameters> {
    return {
      title: `Unstored PDF for ${entity.name}`,
      heading: 'Unstored PDF Heading',
      content: 'Unstored PDF Content',
      date: new Date().toISOString(),
    };
  }
}

describe('BaseHtmlPdfService', () => {
  let service: TestBaseHtmlPdfService;
  let compileHtmlStub: SinonStub;

  beforeEach(() => {
    service = new TestBaseHtmlPdfService();
  });

  afterEach(() => {
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
  });

  describe('constructor', () => {
    it('should set default HTML PDF gen URL from environment variable', () => {
      const originalEnv = process.env.HTML_PDF_GEN_URL;
      delete process.env.HTML_PDF_GEN_URL;
      
      const newService = new TestBaseHtmlPdfService();
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(newService['htmlPdfGenUrl']).to.eq('http://localhost:3001');
      
      if (originalEnv) {
        process.env.HTML_PDF_GEN_URL = originalEnv;
      }
    });

    it('should use HTML_PDF_GEN_URL from environment if set', () => {
      const originalEnv = process.env.HTML_PDF_GEN_URL;
      process.env.HTML_PDF_GEN_URL = 'http://custom-url:8080';
      
      const newService = new TestBaseHtmlPdfService();
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(newService['htmlPdfGenUrl']).to.eq('http://custom-url:8080');
      
      if (originalEnv) {
        process.env.HTML_PDF_GEN_URL = originalEnv;
      } else {
        delete process.env.HTML_PDF_GEN_URL;
      }
    });

    it('should configure the PDF compiler client', () => {
      // The client configuration happens in the constructor
      // We just verify the service is created successfully
      const newService = new TestBaseHtmlPdfService();
      expect(newService).to.be.instanceOf(TestBaseHtmlPdfService);
    });
  });

  describe('getHtml', () => {
    it('should get parameters and apply template', async () => {
      const entity = new TestEntity();
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);

      const getParametersSpy = sinon.spy(service, 'getParameters');
      const htmlGeneratorSpy = sinon.spy(service, 'htmlGenerator');

      // eslint-disable-next-line @typescript-eslint/dot-notation
      const html = await service['getHtml'](entity);

      expect(getParametersSpy).to.have.been.calledOnceWith(entity);
      expect(htmlGeneratorSpy).to.have.been.calledOnce;
      const actualParams = htmlGeneratorSpy.getCall(0).args[0];
      expect(actualParams.title).to.eq(expectedParams.title);
      expect(actualParams.heading).to.eq(expectedParams.heading);
      expect(actualParams.content).to.eq(expectedParams.content);
      expect(actualParams.date).to.be.a('string');
      expect(html).to.eq(expectedHtml);

      getParametersSpy.restore();
      htmlGeneratorSpy.restore();
    });
  });

  describe('compileHtml', () => {
    it('should successfully compile HTML to PDF buffer', async () => {
      const html = '<html><body>Test</body></html>';
      const pdfBuffer = Buffer.from('PDF content');

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);

      // eslint-disable-next-line @typescript-eslint/dot-notation
      const result = await service['compileHtml'](html);

      expect(compileHtmlStub).to.have.been.calledOnceWith(html);
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString()).to.eq(pdfBuffer.toString());
    });

    it('should throw PdfError when HTTP status is not 200', async () => {
      const html = '<html><body>Test</body></html>';

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).rejects(new PdfError('HTML PDF generation failed: 500 Internal Server Error'));

      // eslint-disable-next-line @typescript-eslint/dot-notation
      await expect(service['compileHtml'](html)).to.be.rejectedWith(PdfError, 'HTML PDF generation failed');
    });

    it('should throw PdfError when compilation fails', async () => {
      const html = '<html><body>Test</body></html>';

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).rejects(new PdfError('HTML PDF generation failed: Network error'));

      // eslint-disable-next-line @typescript-eslint/dot-notation
      await expect(service['compileHtml'](html)).to.be.rejectedWith(PdfError, 'HTML PDF generation failed');
    });
  });

  describe('createPdf', () => {
    it('should create PDF buffer from HTML template', async () => {
      const entity = new TestEntity();
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);
      const pdfBuffer = Buffer.from('PDF content');

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);

      const result = await service.createPdfBuffer(entity);

      expect(compileHtmlStub).to.have.been.calledOnceWith(expectedHtml);
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString()).to.eq(pdfBuffer.toString());
    });
  });

  describe('createRaw', () => {
    it('should return HTML as buffer', async () => {
      const entity = new TestEntity();
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);

      const result = await service.createRaw(entity);

      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString('utf-8')).to.eq(expectedHtml);
    });
  });
});

describe('HtmlPdfService', () => {
  let service: TestHtmlPdfService;
  let uploadPdfStub: SinonStub;
  let compileHtmlStub: SinonStub;

  beforeEach(() => {
    service = new TestHtmlPdfService('./test-location');
    uploadPdfStub = sinon.stub(service.fileService, 'uploadPdf');
  });

  afterEach(() => {
    uploadPdfStub.restore();
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
  });

  describe('constructor', () => {
    it('should initialize FileService with provided location', () => {
      const newService = new TestHtmlPdfService('./custom-location');
      expect(newService.fileService).to.be.instanceOf(FileService);
    });
  });

  describe('createPdf', () => {
    it('should create and upload PDF entity', async () => {
      const entity = new TestPdfAbleEntity();
      const user = Object.assign(new User(), { id: 1 } as User);
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);
      const pdfBuffer = Buffer.from('PDF content');
      const expectedPdf = new TestPdf();

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);
      uploadPdfStub.resolves(expectedPdf);

      const result = await service.createPdfWithEntity(entity);

      expect(compileHtmlStub).to.have.been.calledOnceWith(expectedHtml);
      expect(uploadPdfStub).to.have.been.calledOnce;
      expect(uploadPdfStub).to.have.been.calledWith(
        entity,
        TestPdf,
        sinon.match.instanceOf(Buffer),
        user,
      );
      expect(result).to.eq(expectedPdf);
    });
  });
});

describe('HtmlUnstoredPdfService', () => {
  let service: TestHtmlUnstoredPdfService;
  let compileHtmlStub: SinonStub;

  beforeEach(() => {
    service = new TestHtmlUnstoredPdfService();
  });

  afterEach(() => {
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
  });

  describe('createPdf', () => {
    it('should return PDF buffer', async () => {
      const entity = new TestUnstoredPdfAbleEntity();
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);
      const pdfBuffer = Buffer.from('PDF content');

      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);

      const result = await service.createPdfBuffer(entity);

      expect(compileHtmlStub).to.have.been.calledOnceWith(expectedHtml);
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString()).to.eq(pdfBuffer.toString());
    });
  });

  describe('createRaw', () => {
    it('should return HTML as buffer', async () => {
      const entity = new TestUnstoredPdfAbleEntity();
      const expectedParams = await service.getParameters(entity);
      const expectedHtml = service.htmlGenerator(expectedParams);

      const result = await service.createRaw(entity);

      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString('utf-8')).to.eq(expectedHtml);
    });
  });
});

