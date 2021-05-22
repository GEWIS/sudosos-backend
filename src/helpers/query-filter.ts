/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
import { SelectQueryBuilder } from 'typeorm';

/**
 * Defines the mapping from properties on the parameter object, to
 * the respective identifiers in queries.
 */
export interface FilterMapping {
  [key: string]: string;
}

/**
 * Defines the filtering parameters to which can be mapped.
 */
export interface FilterParameters {
  [key: string]: any;
}

export default class QueryFilter {
  public static applyFilter(
    query: SelectQueryBuilder<any>,
    mapping: FilterMapping,
    params: FilterParameters,
  ): SelectQueryBuilder<any> {
    Object.keys(mapping).forEach((param: string) => {
      const value = params[param];
      if (value !== undefined) {
        query.andWhere(`${mapping[param]} = :${param}`);
      }
    });
    return query.setParameters(params);
  }
}
