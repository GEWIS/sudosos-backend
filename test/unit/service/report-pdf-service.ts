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

import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { expect } from 'chai';
import { PDF_VAT_HIGH } from '../../../src/helpers/pdf';
import { Product } from 'pdf-generator-client';
import sinon, { SinonStub } from 'sinon';
import { FineReport } from '../../../src/entity/report/fine-report';
import FineReportPdfService from '../../../src/service/pdf/report-pdf-service';

describe('ReportPdfService', () => {
  describe('fineReportToParameters', () => {
    it('should convert fine report to parameters', async () => {
      const report: FineReport = new FineReport({
        fromDate: new Date('2022-01-01'),
        toDate: new Date('2022-12-31'),
        count: 10,
        handedOut: DineroTransformer.Instance.from(200),
        waivedCount: 5,
        waivedAmount: DineroTransformer.Instance.from(100),
      });

      const reportParams = await report.pdfService.getParameters(report);
      expect(reportParams.startDate).to.eq(report.fromDate);
      expect(reportParams.endDate).to.eq(report.toDate);
      expect(reportParams.fines.length).to.eq(2);

      const handedOut = reportParams.fines.find((fine: Product) => fine.name === 'Handed out');
      expect(handedOut).to.not.be.undefined;
      expect(handedOut?.pricing.basePrice).to.eq(report.handedOut.getAmount());
      expect(handedOut.pricing.quantity).to.eq(report.count);
      expect(handedOut.pricing.vatAmount).to.eq(PDF_VAT_HIGH);
      expect(reportParams.total.inclVat).to.eq(report.handedOut.getAmount() - report.waivedAmount.getAmount());

      const waived = reportParams.fines.find((fine: Product) => fine.name === 'Waived');
      expect(waived).to.not.be.undefined;
      expect(reportParams.total.exclVat).to.eq(Math.round(reportParams.total.inclVat / (1 + (PDF_VAT_HIGH / 100))));
      expect(waived?.pricing.basePrice).to.eq(report.waivedAmount.getAmount() * -1);

      expect(waived.pricing.quantity).to.eq(report.waivedCount);
    });
    it('should return params with a total value of 0 if handed out equals waived', async () => {
      const report: FineReport = new FineReport({
        fromDate: new Date('2022-01-01'),
        toDate: new Date('2022-12-31'),
        count: 10,
        handedOut: DineroTransformer.Instance.from(100),
        waivedCount: 10,
        waivedAmount: DineroTransformer.Instance.from(100),
      });

      const reportParams = await report.pdfService.getParameters(report);
      expect(reportParams.total.inclVat).to.eq(0);
      expect(reportParams.total.exclVat).to.eq(0);
    });
    it('should return parameters without waived fines', async () => {
      const report: FineReport = new FineReport({
        fromDate: new Date('2022-01-01'),
        toDate: new Date('2022-12-31'),
        count: 10,
        handedOut: DineroTransformer.Instance.from(100),
        waivedCount: 0,
        waivedAmount: DineroTransformer.Instance.from(0),
      });

      const reportParams = await report.pdfService.getParameters(report);
      expect(reportParams.fines.length).to.eq(1);
    });
  });
  describe('fineReportToPdf', () => {

    let generateFineReportStub: SinonStub;

    let pdfService = new FineReportPdfService();

    beforeEach(function () {
      generateFineReportStub = sinon.stub(pdfService.client, 'generateFineReport');
    });

    afterEach(function () {
      generateFineReportStub.restore();
    });

    it('should return a pdf report', async () => {
      generateFineReportStub.resolves({
        data: new Blob(),
        status: 200,
      });

      const report: FineReport = new FineReport({
        fromDate: new Date('2022-01-01'),
        toDate: new Date('2022-12-31'),
        count: 10,
        handedOut: DineroTransformer.Instance.from(200),
        waivedCount: 5,
        waivedAmount: DineroTransformer.Instance.from(100),
      });
      report.pdfService = pdfService;

      const pdf = await report.createPdf();
      expect(pdf).to.not.be.undefined;
    });
    it('should throw an error if PDF generation fails', async () => {
      generateFineReportStub.rejects(new Error('Failed to generate PDF'));

      const report: FineReport = new FineReport({
        fromDate: new Date('2022-01-01'),
        toDate: new Date('2022-12-31'),
        count: 10,
        handedOut: DineroTransformer.Instance.from(200),
        waivedCount: 5,
        waivedAmount: DineroTransformer.Instance.from(100),
      });
      report.pdfService = pdfService;

      await expect(report.createPdf()).to.be.rejectedWith();
    });
  });
});
