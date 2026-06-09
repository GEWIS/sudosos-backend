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

import { expect } from 'chai';
import { PDF_VAT_HIGH } from '../../../../src/helpers/pdf';
import DineroTransformer from '../../../../src/entity/transformer/dinero-transformer';
import FineReportPdfService from '../../../../src/service/pdf/fine-report-pdf-service';
import { FineReport } from '../../../../src/entity/report/fine-report';

describe('FineReportPdfService', () => {
  const fromDate = new Date('2022-01-01');
  const toDate = new Date('2022-12-31');

  const makeReport = (init?: Partial<FineReport>) => new FineReport({
    fromDate,
    toDate,
    count: 10,
    handedOut: DineroTransformer.Instance.from(200),
    waivedCount: 5,
    waivedAmount: DineroTransformer.Instance.from(100),
    ...init,
  });

  describe('getParameters', () => {
    it('formats the entity amounts and computes the VAT split', async () => {
      const report = makeReport();
      const service = new FineReportPdfService();
      const params = await service.getParameters(report);

      expect(params.fromDate).to.equal(fromDate.toLocaleDateString('nl-NL'));
      expect(params.toDate).to.equal(toDate.toLocaleDateString('nl-NL'));
      expect(params.count).to.equal(10);
      expect(params.waivedCount).to.equal(5);
      expect(params.handedOut).to.equal(report.handedOut.toFormat());
      expect(params.waivedAmount).to.equal(report.waivedAmount.toFormat());
      expect(params.totalInclVat).to.equal(DineroTransformer.Instance.from(100).toFormat());
      expect(params.totalExclVat).to.equal(
        DineroTransformer.Instance.from(Math.round(100 / (1 + (PDF_VAT_HIGH / 100)))).toFormat(),
      );
      expect(params.vatPercentage).to.equal(PDF_VAT_HIGH);
    });

    it('returns a total of zero when handed out equals waived', async () => {
      const report = makeReport({
        waivedCount: 10,
        handedOut: DineroTransformer.Instance.from(100),
        waivedAmount: DineroTransformer.Instance.from(100),
      });
      const service = new FineReportPdfService();
      const params = await service.getParameters(report);

      expect(params.totalInclVat).to.equal(DineroTransformer.Instance.from(0).toFormat());
      expect(params.totalExclVat).to.equal(DineroTransformer.Instance.from(0).toFormat());
    });

    it('omits the waived row when there are no waived fines', async () => {
      const report = makeReport({
        waivedCount: 0,
        handedOut: DineroTransformer.Instance.from(100),
        waivedAmount: DineroTransformer.Instance.from(0),
      });
      const service = new FineReportPdfService();
      const params = await service.getParameters(report);
      expect(params.waivedCount).to.equal(0);

      const html = await service.createRaw(report);
      expect(html.toString('utf-8')).to.not.include('Waived');
    });
  });

  describe('htmlGenerator', () => {
    it('produces a HTML string from the parameters', async () => {
      const service = new FineReportPdfService();
      const params = await service.getParameters(makeReport());
      const html = service.htmlGenerator(params);
      expect(html).to.be.a('string');
      expect(html).to.include(params.totalInclVat);
      expect(html).to.include(`${params.vatPercentage}%`);
    });
  });

  describe('createRaw', () => {
    it('returns a Buffer with HTML bytes for the supplied entity', async () => {
      const report = makeReport();
      const service = new FineReportPdfService();
      const buffer = await service.createRaw(report);
      expect(buffer).to.be.instanceOf(Buffer);
      const text = buffer.toString('utf-8');
      expect(text).to.include(report.handedOut.toFormat());
      expect(text).to.include(`${PDF_VAT_HIGH}%`);
    });
  });
});
