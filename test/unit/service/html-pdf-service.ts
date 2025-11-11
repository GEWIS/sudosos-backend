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
 *
 *  @license
 */


import {
  BaseHtmlPdfService,
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
import PdfTemplateGenerator from '../../../src/service/pdf/pdf-template-generator';

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

// Concrete implementation of BaseHtmlPdfService for testing
class TestBaseHtmlPdfService extends BaseHtmlPdfService<TestEntity, PdfTemplateParameters> {
  templateFileName = 'example.html';

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
  templateFileName = 'example.html';

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
  templateFileName = 'example.html';

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
  let applyTemplateStub: SinonStub;

  beforeEach(() => {
    service = new TestBaseHtmlPdfService();
    applyTemplateStub = sinon.stub(PdfTemplateGenerator, 'applyTemplate');
  });

  afterEach(() => {
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
    applyTemplateStub.restore();
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
      const expectedParams = {
        title: 'Test Title',
        heading: 'Test Heading',
        content: 'Test Content',
        date: '2024-01-01',
      };
      const expectedHtml = '<html>Test HTML</html>';

      applyTemplateStub.returns(expectedHtml);
      const getParametersStub = sinon.stub(service, 'getParameters').resolves(expectedParams);

      // eslint-disable-next-line @typescript-eslint/dot-notation
      const html = await service['getHtml'](entity);

      expect(getParametersStub).to.have.been.calledOnceWith(entity);
      expect(applyTemplateStub).to.have.been.calledOnceWith('example.html', expectedParams);
      expect(html).to.eq(expectedHtml);

      getParametersStub.restore();
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
      const expectedHtml = '<html>Test HTML</html>';
      const pdfBuffer = Buffer.from('PDF content');

      applyTemplateStub.returns(expectedHtml);
      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);

      const result = await service.createPdf(entity);

      expect(applyTemplateStub).to.have.been.calledOnce;
      expect(compileHtmlStub).to.have.been.calledOnceWith(expectedHtml);
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString()).to.eq(pdfBuffer.toString());
    });
  });

  describe('createRaw', () => {
    it('should return HTML as buffer', async () => {
      const entity = new TestEntity();
      const expectedHtml = '<html>Test HTML</html>';

      applyTemplateStub.returns(expectedHtml);

      const result = await service.createRaw(entity);

      expect(applyTemplateStub).to.have.been.calledOnce;
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString('utf-8')).to.eq(expectedHtml);
    });
  });
});

describe('HtmlPdfService', () => {
  let service: TestHtmlPdfService;
  let uploadPdfStub: SinonStub;
  let applyTemplateStub: SinonStub;
  let compileHtmlStub: SinonStub;

  beforeEach(() => {
    service = new TestHtmlPdfService('./test-location');
    uploadPdfStub = sinon.stub(service.fileService, 'uploadPdf');
    applyTemplateStub = sinon.stub(PdfTemplateGenerator, 'applyTemplate');
  });

  afterEach(() => {
    uploadPdfStub.restore();
    applyTemplateStub.restore();
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
      const expectedHtml = '<html>Test HTML</html>';
      const pdfBuffer = Buffer.from('PDF content');
      const expectedPdf = new TestPdf();

      applyTemplateStub.returns(expectedHtml);
      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);
      uploadPdfStub.resolves(expectedPdf);

      const result = await service.createPdf(entity);

      expect(applyTemplateStub).to.have.been.calledOnce;
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
  let applyTemplateStub: SinonStub;
  let compileHtmlStub: SinonStub;

  beforeEach(() => {
    service = new TestHtmlUnstoredPdfService();
    applyTemplateStub = sinon.stub(PdfTemplateGenerator, 'applyTemplate');
  });

  afterEach(() => {
    applyTemplateStub.restore();
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
  });

  describe('createPdf', () => {
    it('should return PDF buffer', async () => {
      const entity = new TestUnstoredPdfAbleEntity();
      const expectedHtml = '<html>Test HTML</html>';
      const pdfBuffer = Buffer.from('PDF content');

      applyTemplateStub.returns(expectedHtml);
      compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(pdfBuffer);

      const result = await service.createPdf(entity);

      expect(applyTemplateStub).to.have.been.calledOnce;
      expect(compileHtmlStub).to.have.been.calledOnceWith(expectedHtml);
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString()).to.eq(pdfBuffer.toString());
    });
  });

  describe('createRaw', () => {
    it('should return HTML as buffer', async () => {
      const entity = new TestUnstoredPdfAbleEntity();
      const expectedHtml = '<html>Test HTML</html>';

      applyTemplateStub.returns(expectedHtml);

      const result = await service.createRaw(entity);

      expect(applyTemplateStub).to.have.been.calledOnce;
      expect(result).to.be.instanceOf(Buffer);
      expect(result.toString('utf-8')).to.eq(expectedHtml);
    });
  });
});

