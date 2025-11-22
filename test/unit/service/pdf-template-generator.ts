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


import PdfTemplateGenerator from '../../../src/service/pdf/pdf-template-generator';
import { expect } from 'chai';

describe('PdfTemplateGenerator', () => {
  describe('loadTemplate', () => {
    it('should load a template file from static/pdf directory', () => {
      const template = PdfTemplateGenerator.loadTemplate('example.html');

      expect(template).to.be.a('string');
      expect(template).to.include('<!DOCTYPE html>');
      expect(template).to.include('{{ title }}');
      expect(template).to.include('{{ heading }}');
    });

    it('should throw an error if template file does not exist', () => {
      expect(() => {
        PdfTemplateGenerator.loadTemplate('nonexistent.html');
      }).to.throw('PDF template not found');
    });
  });

  describe('applyTemplate', () => {
    it('should replace all placeholders with provided values', () => {
      const data = {
        title: 'Test Document',
        heading: 'Test Heading',
        content: 'Test Content',
        date: '2024-01-01',
      };

      const result = PdfTemplateGenerator.applyTemplate('example.html', data);
      const expected = '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Test Document</title>\n    <style>\n        body {\n            font-family: Arial, sans-serif;\n            margin: 40px;\n            color: #333;\n        }\n        h1 {\n            color: #D40000;\n        }\n        .content {\n            margin-top: 20px;\n        }\n    </style>\n</head>\n<body>\n    <h1>Test Heading</h1>\n    <div class="content">\n        <p>Test Content</p>\n        <p>Generated on: 2024-01-01</p>\n    </div>\n</body>\n</html>\n';

      expect(result).to.eq(expected);
    });

    it('should replace multiple occurrences of the same placeholder', () => {
      const data = { heading: 'Test' };
      const result = PdfTemplateGenerator.applyTemplate('example.html', data);

      expect(result).to.not.include('{{ heading }}');
      expect((result.match(/Test/g) || []).length).to.be.at.least(1);
    });

    it('should handle null and undefined values by replacing with empty string', () => {
      const data: Record<string, any> = {
        title: null,
        heading: undefined,
        content: 'Valid Content',
        date: '',
      };

      const result = PdfTemplateGenerator.applyTemplate('example.html', data);
      const expected = '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title></title>\n    <style>\n        body {\n            font-family: Arial, sans-serif;\n            margin: 40px;\n            color: #333;\n        }\n        h1 {\n            color: #D40000;\n        }\n        .content {\n            margin-top: 20px;\n        }\n    </style>\n</head>\n<body>\n    <h1></h1>\n    <div class="content">\n        <p>Valid Content</p>\n        <p>Generated on: </p>\n    </div>\n</body>\n</html>\n';

      expect(result).to.eq(expected);
    });
    it('should throw an error if template file does not exist', () => {
      expect(() => {
        PdfTemplateGenerator.applyTemplate('nonexistent.html', {});
      }).to.throw('PDF template not found');
    });
  });
});

