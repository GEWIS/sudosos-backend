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
import {
  createFineReportPdf,
  IFineReportPdf,
} from '../../../src/html/fine-report.html';

describe('createFineReportPdf', () => {
  const params: IFineReportPdf = {
    fromDate: '01-01-2026',
    toDate: '31-12-2026',
    count: 10,
    handedOut: '€2,00',
    waivedCount: 5,
    waivedAmount: '€1,00',
    totalExclVat: '€0,83',
    vatAmount: '€0,17',
    vatPercentage: 21,
    totalInclVat: '€1,00',
    serviceEmail: 'treasurer@example.test',
  };

  it('returns an HTML document containing the report period and totals', () => {
    const html = createFineReportPdf(params);
    expect(html).to.be.a('string');
    expect(html).to.include(params.fromDate);
    expect(html).to.include(params.toDate);
    expect(html).to.include(params.handedOut);
    expect(html).to.include(params.waivedAmount);
    expect(html).to.include(params.totalInclVat);
    expect(html).to.include(params.totalExclVat);
    expect(html).to.include(params.vatAmount);
  });

  it('renders the handed-out count and VAT percentage in the details table', () => {
    const html = createFineReportPdf(params);
    expect(html).to.include(`>${params.count}<`);
    expect(html).to.include(`${params.vatPercentage}%`);
  });

  it('uses the supplied service email in the wrapper template', () => {
    const html = createFineReportPdf(params);
    expect(html).to.include(params.serviceEmail);
  });

  it('omits the Waived row when waivedCount is 0', () => {
    const noWaived: IFineReportPdf = {
      ...params,
      waivedCount: 0,
      waivedAmount: '€0,00',
    };
    const html = createFineReportPdf(noWaived);
    expect(html).to.not.include('Waived');
    expect(html).to.include(params.handedOut);
  });
});
