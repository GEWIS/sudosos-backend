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
import { BuyerReport, ReportProductEntry, SalesReport } from '../../entity/report/report';
import {
  FileResponse,
  Product,
  UserReportParameters,
  UserReportParametersType,
  UserRouteParams,
} from 'pdf-generator-client';
import { UnstoredPdfService } from './pdf-service';
import { entryToProduct, getPDFTotalsFromReport, userToIdentity } from '../../helpers/pdf';
import User from '../../entity/user/user';
import { EntityManager } from 'typeorm';

export default class UserReportPdfService<T extends SalesReport | BuyerReport> extends UnstoredPdfService<T, UserRouteParams> {

  routeConstructor = UserRouteParams;

  private readonly type: UserReportParametersType;

  constructor(type: UserReportParametersType, manager?: EntityManager) {
    super(manager);
    this.type = type;
  }

  generator(routeParams: UserRouteParams): Promise<FileResponse> {
    return this.client.generateUserReport(routeParams);
  }

  async getParameters(entity: T): Promise<UserReportParameters> {
    const sales: Product[] = [];

    if (!entity.data.products) throw new Error('No products found in report');
    entity.data.products.forEach((s: ReportProductEntry) => sales.push(entryToProduct(s)));

    const user = await this.manager.findOne(User, { where: { id: entity.forId } });

    let data: any = {
      account: userToIdentity(user),
      startDate: entity.fromDate,
      endDate: entity.tillDate,
      entries: sales,
      type: this.type,
      total: getPDFTotalsFromReport(entity),
    };

    if (entity instanceof SalesReport) {
      data.description = entity.description;
    }

    return new UserReportParameters(data);
  }

}
