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

import PointOfSale from '../../entity/point-of-sale/point-of-sale';
import PointOfSaleService from '../point-of-sale-service';
import JsonWebToken from '../../authentication/json-web-token';

/**
 * Determines the relation between a user and a point of sale.
 * Returns 'all' if user is not connected to POS, 'organ' if connected via organ, 'own' if directly connected.
 * @param userId - The user ID.
 * @param token - The JWT token containing organ information.
 * @param pointOfSaleId - The point of sale ID.
 * @returns The relation: 'all', 'organ', or 'own'.
 */
export async function getPointOfSaleRelation(
  userId: number,
  token: JsonWebToken,
  pointOfSaleId: number,
): Promise<'all' | 'organ' | 'own'> {
  const pos = await PointOfSale.findOne({
    where: { id: pointOfSaleId },
    relations: ['owner', 'user'],
  });

  if (!pos) return 'all';

  // Check if user is in the same organ as the POS owner
  if (token.organs?.some(organ => organ.id === pos.owner.id)) {
    return 'organ';
  }

  // Check if user can view the POS directly
  const canViewPointOfSale = await PointOfSaleService.canViewPointOfSale(userId, pos);
  if (canViewPointOfSale) {
    return 'own';
  }

  return 'all';
}
