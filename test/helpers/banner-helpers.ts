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

import Banner from '../../src/entity/banner';
import { BannerResponse } from '../../src/controller/response/banner-response';

export function bannerEq(a: Banner, b: BannerResponse): Boolean {
  const aEmpty = a === {} as Banner || a === undefined;
  const bEmpty = b === {} as BannerResponse || b === undefined;
  if (aEmpty !== bEmpty) {
    return false;
  }
  if (aEmpty ? !bEmpty : bEmpty) {
    return false;
  }

  const downloadName = a.image ? (a.image.downloadName ?? null) : null;

  return a.name === b.name
    && downloadName === b.image
    && a.duration === b.duration
    && a.active === b.active
    && Math.floor(a.startDate.getTime() / 1000)
    === Math.floor(new Date(b.startDate).getTime() / 1000)
    && Math.floor(a.endDate.getTime() / 1000)
    === Math.floor(new Date(b.endDate).getTime() / 1000);
}
