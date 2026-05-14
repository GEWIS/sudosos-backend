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
  createInactiveAdministrativeCostReportPdf,
  IInactiveAdministrativeCostReportPdf,
} from '../../../src/html/inactive-administrative-cost-report.html';

describe('createInactiveAdministrativeCostReportPdf', () => {
  const params: IInactiveAdministrativeCostReportPdf = {
    fromDate: '01-01-2026',
    toDate: '31-01-2026',
    totalAmountInclVat: '€121,00',
    totalAmountExclVat: '€100,00',
    vatAmount: '€21,00',
    vatPercentage: 21,
    count: 7,
    serviceEmail: 'treasurer@example.test',
  };

  it('returns an HTML document containing the report period and totals', () => {
    const html = createInactiveAdministrativeCostReportPdf(params);
    expect(html).to.be.a('string');
    expect(html).to.include(params.fromDate);
    expect(html).to.include(params.toDate);
    expect(html).to.include(params.totalAmountInclVat);
    expect(html).to.include(params.totalAmountExclVat);
    expect(html).to.include(params.vatAmount);
  });

  it('renders the deduction count and VAT percentage in the details table', () => {
    const html = createInactiveAdministrativeCostReportPdf(params);
    expect(html).to.include(`>${params.count}<`);
    expect(html).to.include(`${params.vatPercentage}%`);
  });

  it('uses the supplied service email in the wrapper template', () => {
    const html = createInactiveAdministrativeCostReportPdf(params);
    expect(html).to.include(params.serviceEmail);
  });

  it('handles a zero-count empty report without throwing', () => {
    const empty: IInactiveAdministrativeCostReportPdf = {
      ...params,
      count: 0,
      totalAmountInclVat: '€0,00',
      totalAmountExclVat: '€0,00',
      vatAmount: '€0,00',
    };
    const html = createInactiveAdministrativeCostReportPdf(empty);
    expect(html).to.include('>0<');
    expect(html).to.include('€0,00');
  });
});
