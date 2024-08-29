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
import PointOfSaleRevision from '../point-of-sale/point-of-sale-revision';
import ProductRevision from '../product/product-revision';
import VatGroup from '../vat-group';
import ProductCategory from '../product/product-category';
import ContainerRevision from '../container/container-revision';
import Dinero from 'dinero.js';

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

export interface SalesReport extends Report {
}

export interface BuyerReport extends Report {
}
