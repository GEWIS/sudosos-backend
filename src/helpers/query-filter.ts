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
 * This is the module page of the query-filter.
 *
 * @module helpers
 */

import {
  BaseEntity,
  FindOptionsWhere, FindOptionsWhereProperty, Like, Raw,
  SelectQueryBuilder,
} from 'typeorm';
import { asNumber } from './validators';
import { toMySQLString } from './timestamps';

type KeyOfType<T, V> = keyof {
  [P in keyof T as T[P] extends V ? P : never]: any
};

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
          let parsed: string[];
          if (value.length === 0) {
            parsed = ['NULL'];
          } else if (value.length > 0 && typeof value[0] === 'string') {
            parsed = value.map((s) => `"${s}"`);
          } else {
            parsed = value;
          }
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
        const split = property.split('.');
        if (split.length === 1 && property.substring(0, 1) === '%') {
          // No dot, so no nested where clause. However, search starts with a "%"
          where[property.substring(1)] = Like(`%${value}%`);
        } else if (split.length === 1) {
          // No dot, so no nested where clause and no LIKE-search
          where[property] = value;
          // No
        } else {
          // Where clause is nested, so where clause should be an object
          const newMapping: any = {};
          newMapping[param] = split.slice(1).join('.');
          where[split[0]] = this.createFilterWhereClause(newMapping, params);
        }
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

  /**
   * Given a time range, return a find options filter that filters based on this range
   * @param fromDate
   * @param tillDate
   */
  public static createFilterWhereDate(fromDate?: Date, tillDate?: Date): FindOptionsWhereProperty<Date> | undefined {
    if (fromDate && tillDate) return Raw(
      (alias) => `${alias} >= :fromDate AND ${alias} < :tillDate`,
      { fromDate: toMySQLString(fromDate), tillDate: toMySQLString(tillDate) },
    );
    if (fromDate) return Raw(
      (alias) => `${alias} >= :fromDate`,
      { fromDate: toMySQLString(fromDate) },
    );
    if (tillDate) return Raw(
      (alias) => `${alias} < :tillDate`,
      { tillDate: toMySQLString(tillDate) },
    );
  }

  /**
   * Return a filter options that only returns the attributes
   * whose timeframe partially overlaps with the given timeframe
   * @param rangeStartAttributeName Name of the entity's attribute that defines
   * the start of the timeframe
   * @param rangeEndAttributeName Name of the entity's attribute that defines
   * the end of the timeframe
   * @param rangeFromDate Optional start of the selecting timeframe
   * @param rangeTillDate Optional end of the selecting timeframe
   */
  public static createFilterWhereDateRange<Entity extends BaseEntity>(
    rangeStartAttributeName: KeyOfType<Entity, Date>,
    rangeEndAttributeName: KeyOfType<Entity, Date>,
    rangeFromDate?: Date,
    rangeTillDate?: Date,
  ): FindOptionsWhere<Entity>[] {
    const fromDate = rangeFromDate ? toMySQLString(rangeFromDate) : undefined;
    const tillDate = rangeTillDate ? toMySQLString(rangeTillDate) : undefined;

    /*
     *                          +------------------+
     *    <---------------------+      Range       +-------------------->
     *                          +------------------+
     * ---------------------------------------------------------------------
     *  +-------------------+                          +------------------+
     *  |X Completely before|                          |X Completely after|
     *  +-------------------+                          +------------------+
     *             +-------------------+    +---------------------+
     *             |✓ EndDate contained|    |✓ StartDate contained|
     *             +-------------------+    +---------------------+
     *                           +----------------+
     *                           |✓ SellerPayout  |
     *                           |  within range  |
     *                           +----------------+
     *                     +----------------------------+
     *                     |✓  Range within SellerPayout|
     *                     +----------------------------+
     */

    if (fromDate && tillDate) return [
      { // EndDate contained && SellerPayout within range
        [rangeEndAttributeName]: Raw((alias) => `${alias} > :fromDate AND ${alias} <= :tillDate`, { fromDate, tillDate }),
      },
      { // StartDate contained && SellerPayout within range
        [rangeStartAttributeName]: Raw((alias) => `${alias} >= :fromDate AND ${alias} < :tillDate`, { fromDate, tillDate }),
      },
      { // Range within SellerPayout
        [rangeStartAttributeName]: Raw((alias) => `${alias} <= :fromDate`, { fromDate }),
        [rangeEndAttributeName]: Raw((alias) => `${alias} >= :tillDate`, { tillDate }),
      },
    ] as FindOptionsWhere<Entity>[];

    /*
     *                            |FromDate
     *                            +--------------------->
     *
     * ------------------------------------------------------
     *   +-------------------+         +------------------+
     *   |X Completely before|         |✓ Completely after|
     *   +-------------------+         +------------------+
     *                 +--------------------+
     *                 |✓  startDate before |
     *                 |    endDate after   |
     *                 +--------------------+
     *
     * If the endDate equals the fromDate, the entry is not returned
     */
    if (fromDate) return [
      { // StartDate after (endDate before) && Completely after
        [rangeEndAttributeName]: Raw((alias) => `${alias} > :fromDate`, { fromDate }),
      },
    ] as FindOptionsWhere<Entity>[];

    /*
     *                    tillDate|
     *     <----------------------+
     *
     * ------------------------------------------------------
     *
     *   +-------------------+         +------------------+
     *   |✓ Completely before|         |X Completely after|
     *   +-------------------+         +------------------+
     *                 +--------------------+
     *                 |✓  startDate before |
     *                 |    endDate after   |
     *                 +--------------------+
     *
     * If the startDate equals the tillDate, the entry is not returned
     */
    if (tillDate) return [
      { // StartDate after (endDate before) && Completely before
        [rangeStartAttributeName]: Raw((alias) => `${alias} < :tillDate`, { tillDate }),
      },
    ] as FindOptionsWhere<Entity>[];

    return [];
  }
}
