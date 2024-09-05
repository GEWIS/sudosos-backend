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
import WithManager from '../../../src/with-manager';
import VatGroup from '../../../src/entity/vat-group';
import { VatGroupRequest } from '../../../src/controller/request/vat-group-request';

export default class VatGroupSeeder extends WithManager {
  /**
   * Seed the (default) Dutch VAT groups (2022)
   */
  public async seed(): Promise<VatGroup[]> {
    const vatGroup = (data: VatGroupRequest) => Object.assign(new VatGroup(), data) as VatGroup;

    return this.manager.save(VatGroup, [
      vatGroup({
        name: 'Hoog tarief',
        percentage: 21,
        deleted: false,
        hidden: false,
      }),
      vatGroup({
        name: 'Laag tarief',
        percentage: 9,
        deleted: false,
        hidden: false,
      }),
      vatGroup({
        name: 'BTW-vrij',
        percentage: 0,
        deleted: false,
        hidden: false,
      }),
      vatGroup({
        name: 'NoTaxesYaaaay',
        percentage: 0,
        deleted: false,
        hidden: true,
      }),
      vatGroup({
        name: 'Laag tarief (oud)',
        percentage: 6,
        deleted: true,
        hidden: false,
      }),
    ]);
  }
}
