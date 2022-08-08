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
import {
  FindOptionsWhere,
  SelectQueryBuilder,
} from 'typeorm';
import { asNumber } from './validators';

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
  /**
   * Applies the specified query filtering onto the given query builder.
   * @param query - The query builder to which to add where clauses.
   * @param mapping - The mapping of property names on the parameters object to
   *  property names in the query.
   * @param params - The object containing the actual parameter values.
   * @returns The resulting query bulider.
   */
  public static applyFilter(
    query: SelectQueryBuilder<any>,
    mapping: FilterMapping,
    params: FilterParameters,
  ): SelectQueryBuilder<any> {
    Object.keys(mapping).forEach((param: string) => {
      const value = params[param];
      if (value !== undefined) {
        if (Array.isArray(value)) {
          const parsed = value.length > 0 && typeof value[0] === 'string'
            ? value.map((s) => `"${s}"`) : value;
          query.andWhere(`${mapping[param]} in (${parsed.toString()})`);
        } else {
          query.andWhere(`${mapping[param]} = :${param}`);
        }
      }
    });
    return query.setParameters(params);
  }

  /**
   * Creates a FindManyOptions object containing the conditions needed to apply the given filter.
   * @param mapping - The mapping of property names on the parameters object to
   *  property names in the query.
   * @param params - The object containing the actual parameter values.
   * @returns The where clause which can be used in a FindManyOptions object.
   */
  public static createFilterWhereClause(
    mapping: FilterMapping,
    params: FilterParameters,
  ): FindOptionsWhere<any> {
    const where: FindOptionsWhere<any> = {};

    Object.keys(mapping).forEach((param: string) => {
      const value = params[param];
      if (value !== undefined) {
        const property: string = mapping[param];
        where[property] = value;
      }
    });

    return where;
  }

  /**
   * Extract the given query field and parse it to either undefined, a number or an array of numbers
   * @param query
   */
  public static extractUndefinedNumberOrArray(query: any): undefined | number | number[] {
    if (query === undefined) return undefined;
    if (Array.isArray(query)) return query.map((d: any) => asNumber(d));
    return asNumber(query);
  }
}
