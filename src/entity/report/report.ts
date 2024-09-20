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

/**
 * This is the module page of the report.
 *
 * @module reports
 * @mergeTarget
 */

import Dinero from 'dinero.js';
import ProductRevision from '../product/product-revision';
import VatGroup from '../vat-group';
import ProductCategory from '../product/product-category';
import PointOfSaleRevision from '../point-of-sale/point-of-sale-revision';
import ContainerRevision from '../container/container-revision';
import { UnstoredPdfAble } from '../file/pdf-able';
import UserReportPdfService from '../../service/pdf/user-report-pdf-service';
import { UserReportParametersType } from 'pdf-generator-client';

export interface IReport {
  forId: number;

  fromDate: Date;

  tillDate: Date;

  totalExclVat: Dinero.Dinero;

  totalInclVat: Dinero.Dinero;

  data: ReportData;
}

export class Report implements IReport {
  constructor(init?: Partial<IReport>) {
    Object.assign(this, init);
  }
}

export interface ReportEntry {
  totalExclVat: Dinero.Dinero,
  totalInclVat: Dinero.Dinero
}

export interface ReportProductEntry extends ReportEntry {
  count: number,
  product: ProductRevision,
}

export interface ReportVatEntry extends ReportEntry {
  vat: VatGroup,
}

export interface ReportCategoryEntry extends ReportEntry {
  category: ProductCategory,
}

export interface ReportPosEntry extends ReportEntry {
  pos: PointOfSaleRevision,
}

export interface ReportContainerEntry extends ReportEntry {
  container: ContainerRevision,
}

export interface ReportData {
  products?: ReportProductEntry[],
  categories?: ReportCategoryEntry[],
  vat?: ReportVatEntry[],
  pos?: ReportPosEntry[],
  containers?: ReportContainerEntry[],
}

export interface Report {
  forId: number,
  fromDate: Date,
  tillDate: Date,
  data: ReportData,
  totalExclVat: Dinero.Dinero,
  totalInclVat: Dinero.Dinero,
}


export class SalesReport extends UnstoredPdfAble(Report) {
  pdfService = new UserReportPdfService(UserReportParametersType.Sales);

  description: string;
}

export class BuyerReport extends UnstoredPdfAble(Report) {
  pdfService = new UserReportPdfService(UserReportParametersType.Purchases);
}
