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
import dinero from 'dinero.js';
import InactiveAdministrativeCostReportPdfService from '../../../../src/service/pdf/inactive-administrative-cost-report-pdf-service';
import { InactiveAdministrativeCostReport } from '../../../../src/entity/report/inactive-administrative-cost-report';

describe('InactiveAdministrativeCostReportPdfService', () => {
  const fromDate = new Date('2026-01-01T00:00:00Z');
  const toDate = new Date('2026-01-31T00:00:00Z');
  const totalAmountInclVat = dinero({ amount: 12100 });
  const totalAmountExclVat = dinero({ amount: 10000 });
  const vatAmount = dinero({ amount: 2100 });

  const makeReport = () => new InactiveAdministrativeCostReport({
    fromDate,
    toDate,
    totalAmountInclVat,
    totalAmountExclVat,
    vatAmount,
    vatPercentage: 21,
    count: 7,
  });

  let originalFR: string | undefined;
  beforeAll(() => { originalFR = process.env.FINANCIAL_RESPONSIBLE; });
  afterAll(() => {
    if (originalFR === undefined) delete process.env.FINANCIAL_RESPONSIBLE;
    else process.env.FINANCIAL_RESPONSIBLE = originalFR;
  });

  describe('getParameters', () => {
    it('formats every numeric field through Dinero and returns the entity data verbatim', async () => {
      const service = new InactiveAdministrativeCostReportPdfService();
      const params = await service.getParameters(makeReport());

      expect(params.fromDate).to.equal(fromDate.toLocaleDateString('nl-NL'));
      expect(params.toDate).to.equal(toDate.toLocaleDateString('nl-NL'));
      expect(params.totalAmountInclVat).to.equal(totalAmountInclVat.toFormat());
      expect(params.totalAmountExclVat).to.equal(totalAmountExclVat.toFormat());
      expect(params.vatAmount).to.equal(vatAmount.toFormat());
      expect(params.vatPercentage).to.equal(21);
      expect(params.count).to.equal(7);
    });

    it('uses the configured FINANCIAL_RESPONSIBLE for the service email', async () => {
      process.env.FINANCIAL_RESPONSIBLE = 'treasurer@example.test';
      try {
        const service = new InactiveAdministrativeCostReportPdfService();
        const params = await service.getParameters(makeReport());
        expect(params.serviceEmail).to.equal('treasurer@example.test');
      } finally {
        delete process.env.FINANCIAL_RESPONSIBLE;
      }
    });

    it('falls back to an empty service email when no financial responsible is configured', async () => {
      delete process.env.FINANCIAL_RESPONSIBLE;
      const service = new InactiveAdministrativeCostReportPdfService();
      const params = await service.getParameters(makeReport());
      expect(params.serviceEmail).to.equal('');
    });
  });

  describe('htmlGenerator', () => {
    it('produces a HTML string from the parameters', async () => {
      const service = new InactiveAdministrativeCostReportPdfService();
      const params = await service.getParameters(makeReport());
      const html = service.htmlGenerator(params);
      expect(html).to.be.a('string');
      expect(html).to.include(params.totalAmountInclVat);
      expect(html).to.include(`${params.vatPercentage}%`);
    });
  });

  describe('createRaw', () => {
    it('returns a Buffer with HTML bytes for the supplied entity', async () => {
      const service = new InactiveAdministrativeCostReportPdfService();
      const buffer = await service.createRaw(makeReport());
      expect(buffer).to.be.instanceOf(Buffer);
      const text = buffer.toString('utf-8');
      expect(text).to.include(totalAmountInclVat.toFormat());
      expect(text).to.include('21%');
    });
  });
});
