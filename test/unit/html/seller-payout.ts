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
  createSellerPayoutPdf,
  ISellerPayoutPdf,
} from '../../../src/html/seller-payout.html';

describe('createSellerPayoutPdf', () => {
  const params: ISellerPayoutPdf = {
    reference: 'SDS-SP-0001',
    identifier: '1',
    description: 'October bar sales',
    account: 'Bar Committee',
    customerNumber: '7',
    startDate: '1-1-2026',
    endDate: '31-1-2026',
    vatBreakdown: [
      { rate: 9, excl: 8.26, vat: 0.74, incl: 9.00 },
      { rate: 21, excl: 33.06, vat: 6.94, incl: 40.00 },
    ],
    lineItems: [
      { description: 'Beer', qty: 40, rate: 21, excl: 33.06, vat: 6.94, incl: 40.00 },
      { description: 'Cola', qty: 10, rate: 9, excl: 8.26, vat: 0.74, incl: 9.00 },
    ],
    totalIncl: 49.00,
    subtotalExcl: 41.32,
    totalVat: 7.68,
  };

  it('renders the disbursement header, reference, account and period', () => {
    const html = createSellerPayoutPdf(params);
    expect(html).to.be.a('string');
    expect(html).to.include('Seller Disbursement');
    expect(html).to.include(params.reference);
    expect(html).to.include(params.account);
    expect(html).to.include(params.startDate);
    expect(html).to.include(params.endDate);
  });

  it('renders the disbursement note with the totals (nl-NL formatted)', () => {
    const html = createSellerPayoutPdf(params);
    expect(html).to.include('This is a payout of your balance');
    expect(html).to.include('Payout including VAT');
    expect(html).to.include('49,00');
    expect(html).to.include('41,32');
  });

  it('renders each line item description and quantity', () => {
    const html = createSellerPayoutPdf(params);
    expect(html).to.include('Beer');
    expect(html).to.include('>40<');
    expect(html).to.include('Cola');
    expect(html).to.include('>10<');
  });

  it('renders each VAT band rate', () => {
    const html = createSellerPayoutPdf(params);
    expect(html).to.include('9%');
    expect(html).to.include('21%');
  });

  it('renders the description as a section', () => {
    const html = createSellerPayoutPdf(params);
    expect(html).to.include(params.description);
  });

  it('handles an empty line-items list without throwing', () => {
    const empty: ISellerPayoutPdf = { ...params, lineItems: [], vatBreakdown: [] };
    const html = createSellerPayoutPdf(empty);
    expect(html).to.be.a('string');
    expect(html).to.include('Total');
  });
});
