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

import WithManager from '../../../src/database/with-manager';
import ProductCategory from '../../../src/entity/product/product-category';

export default class ProductCategorySeeder extends WithManager {
  /**
   * Seeds a default dataset of product categories, and stores them in the database.
   */
  public async seed(): Promise<ProductCategory[]> {
    const rootCategories = await this.manager.save(ProductCategory, [
      {
        id: 1,
        name: 'Alcoholic',
      }, {
        id: 2,
        name: 'Non-alcoholic',
      }, {
        id: 3,
        name: 'Food',
      },
    ]);
    const subCategories = await this.manager.save(ProductCategory, [
      {
        id: 4,
        name: 'Pils',
        parent: rootCategories[0],
      }, {
        id: 5,
        name: 'Tripel',
        parent: rootCategories[0],
      }, {
        id: 6,
        name: 'Blond',
        parent: rootCategories[0],
      }, {
        id: 7,
        name: 'Dubbel',
        parent: rootCategories[0],
      }, {
        id: 8,
        name: 'Zoete troep',
        parent: rootCategories[0],
      },
    ]);
    return [...rootCategories, ...subCategories];
  }
}
