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
import { Identity, Product, ProductPricing, TotalPricing, VAT } from 'pdf-generator-client';
import User from '../entity/user/user';
import { Report, ReportProductEntry, ReportVatEntry } from '../entity/report/report';

export const PDF_VAT_ZERO = 0;
export const PDF_VAT_LOW = 9;
export const PDF_VAT_HIGH = 21;

export const UNUSED_PARAM = '';
export const UNUSED_NUMBER = 0;
export const PDF_GEN_URL =  process.env.PDF_GEN_URL ? process.env.PDF_GEN_URL : 'http://localhost:3001/pdf';

/**
 * Convert VAT percentage to PDF VAT
 * @param percentage - VAT percentage
 * @throws Error - if unknown VAT percentage
 */
export function vatPercentageToPDFVat(percentage: number): VAT {
  switch (percentage) {
    case PDF_VAT_LOW:
      return VAT.LOW;
    case PDF_VAT_HIGH:
      return VAT.HIGH;
    case PDF_VAT_ZERO:
      return VAT.ZERO;
    default:
      throw new Error(`Unknown VAT percentage: ${percentage}`);
  }
}

/**
 * Get totals from report
 * @param report - Report
 * @throws Error - if no VAT groups found in report
 */
export function getPDFTotalsFromReport(report: Report): TotalPricing {
  if (!report.data.vat) throw new Error('No VAT groups found in report');

  const lowVatGroup = report.data.vat.find((v: ReportVatEntry) => v.vat.percentage === PDF_VAT_LOW);
  const highVatGroup = report.data.vat.find((v: ReportVatEntry) => v.vat.percentage === PDF_VAT_HIGH);

  const lowVat = lowVatGroup ? lowVatGroup.totalInclVat.getAmount() - lowVatGroup.totalExclVat.getAmount() : 0;
  const highVat = highVatGroup ? highVatGroup.totalInclVat.getAmount() - highVatGroup.totalExclVat.getAmount() : 0;

  return new TotalPricing({
    exclVat: report.totalExclVat.getAmount(),
    lowVat,
    highVat,
    inclVat: report.totalInclVat.getAmount(),
  });
}

/**
 * Convert user to identity for PDF
 * @param user
 */
export function userToIdentity(user: User): Identity {
  return new Identity({
    lastNamePreposition: UNUSED_PARAM,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
  });
}

/**
 * Convert report product entry to product for PDF
 * @param entry
 */
export function entryToProduct(entry: ReportProductEntry): Product {
  return new Product({
    name: entry.product.name,
    summary: UNUSED_PARAM,
    pricing: new ProductPricing({
      basePrice: entry.product.priceInclVat.getAmount(),
      vatAmount: entry.product.vat.percentage,
      vatCategory: vatPercentageToPDFVat(entry.product.vat.percentage),
      quantity: entry.count,
    }),
  });
}
