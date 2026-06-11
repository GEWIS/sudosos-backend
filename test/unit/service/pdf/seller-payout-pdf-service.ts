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
import sinon from 'sinon';
import dinero from 'dinero.js';
import SellerPayoutPdfService from '../../../../src/service/pdf/seller-payout-pdf-service';
import { SalesReportService } from '../../../../src/service/report-service';
import SellerPayout from '../../../../src/entity/transactions/payout/seller-payout';
import { SELLER_PAYOUT_PDF_LOCATION } from '../../../../src/files/storage/locations';

describe('SellerPayoutPdfService', () => {
  const startDate = new Date('2022-01-01');
  const endDate = new Date('2022-12-31');

  const payout = {
    id: 1,
    startDate,
    endDate,
    reference: 'Some description',
    requestedBy: { id: 7, firstName: 'Bar', lastName: 'Committee' },
  } as unknown as SellerPayout;

  // Two products supplied out of order to exercise the name sort.
  const cola = {
    count: 3,
    product: { name: 'Cola', vat: { percentage: 9 } },
    totalExclVat: dinero({ amount: 300 }),
    totalInclVat: dinero({ amount: 327 }),
  };
  const beer = {
    count: 2,
    product: { name: 'Beer', vat: { percentage: 21 } },
    totalExclVat: dinero({ amount: 200 }),
    totalInclVat: dinero({ amount: 242 }),
  };

  // Two VAT bands supplied out of order to exercise the rate sort.
  const vatHigh = {
    vat: { percentage: 21 },
    totalExclVat: dinero({ amount: 500 }),
    totalInclVat: dinero({ amount: 605 }),
  };
  const vatLow = {
    vat: { percentage: 9 },
    totalExclVat: dinero({ amount: 100 }),
    totalInclVat: dinero({ amount: 109 }),
  };

  const makeReport = () => ({
    data: { products: [cola, beer], vat: [vatHigh, vatLow] },
    totalExclVat: dinero({ amount: 600 }),
    totalInclVat: dinero({ amount: 714 }),
  });

  afterEach(() => sinon.restore());

  it('maps the sales report into seller payout pdf parameters', async () => {
    const report = makeReport();
    sinon.stub(SalesReportService.prototype, 'getReport').resolves(report as any);

    const service = new SellerPayoutPdfService(SELLER_PAYOUT_PDF_LOCATION);
    const params = await service.getParameters(payout);

    expect(params.reference).to.equal('SDS-SP-0001');
    expect(params.identifier).to.equal('1');
    expect(params.account).to.equal('Bar Committee');
    expect(params.customerNumber).to.equal('7');
    expect(params.description).to.equal('Some description');
    expect(params.startDate).to.equal(startDate.toLocaleDateString('nl-NL'));
    expect(params.endDate).to.equal(endDate.toLocaleDateString('nl-NL'));

    // Line items sorted by description (Beer before Cola), amounts in euros.
    expect(params.lineItems.map((it) => it.description)).to.deep.equal(['Beer', 'Cola']);
    expect(params.lineItems[0].qty).to.equal(2);
    expect(params.lineItems[0].rate).to.equal(21);
    expect(params.lineItems[0].excl).to.be.closeTo(beer.totalExclVat.getAmount() / 100, 0.001);
    expect(params.lineItems[0].incl).to.be.closeTo(beer.totalInclVat.getAmount() / 100, 0.001);
    expect(params.lineItems[0].vat).to.be.closeTo(
      (beer.totalInclVat.getAmount() - beer.totalExclVat.getAmount()) / 100, 0.001,
    );

    // VAT bands sorted ascending by rate (9% before 21%).
    expect(params.vatBreakdown.map((b) => b.rate)).to.deep.equal([9, 21]);
    expect(params.vatBreakdown[0].excl).to.be.closeTo(vatLow.totalExclVat.getAmount() / 100, 0.001);
    expect(params.vatBreakdown[0].vat).to.be.closeTo(
      (vatLow.totalInclVat.getAmount() - vatLow.totalExclVat.getAmount()) / 100, 0.001,
    );

    expect(params.subtotalExcl).to.be.closeTo(report.totalExclVat.getAmount() / 100, 0.001);
    expect(params.totalIncl).to.be.closeTo(report.totalInclVat.getAmount() / 100, 0.001);
    expect(params.totalVat).to.be.closeTo(
      (report.totalInclVat.getAmount() - report.totalExclVat.getAmount()) / 100, 0.001,
    );
  });

  it('renders the parameters to an HTML buffer via createRaw', async () => {
    sinon.stub(SalesReportService.prototype, 'getReport').resolves(makeReport() as any);

    const service = new SellerPayoutPdfService(SELLER_PAYOUT_PDF_LOCATION);
    const buffer = await service.createRaw(payout);

    expect(buffer).to.be.instanceOf(Buffer);
    const text = buffer.toString('utf-8');
    expect(text).to.include('Cola');
    expect(text).to.include('Seller Disbursement');
  });

  it('handles an empty report (no products / no vat) without throwing', async () => {
    const report = {
      data: {},
      totalExclVat: dinero({ amount: 0 }),
      totalInclVat: dinero({ amount: 0 }),
    };
    sinon.stub(SalesReportService.prototype, 'getReport').resolves(report as any);

    const service = new SellerPayoutPdfService(SELLER_PAYOUT_PDF_LOCATION);
    const params = await service.getParameters(payout);

    expect(params.lineItems).to.deep.equal([]);
    expect(params.vatBreakdown).to.deep.equal([]);
    expect(params.subtotalExcl).to.equal(0);
    expect(params.totalIncl).to.equal(0);
  });
});
