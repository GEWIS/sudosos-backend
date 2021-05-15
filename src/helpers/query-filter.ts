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
 * Interface describing a filter.
 */
export interface FilterOption {
  // Left hand side of the filter.
  variable: string,
  // Right hand side of the filter.
  argument: string | number,
  // Meta filters wont be evaluated but can still be used in the service.
  meta?: boolean,
}

/**
 * Array wrapper for the FilterOption
 */
export type FilterOptions = FilterOption[] | FilterOption;


/**
 * Class wrapper for FilterOptions related logic.
 */
export default class QueryFilter {
  // Makes sure that the FilterOptions is an array.
  static makeArray(filterOptions: FilterOptions): FilterOption[] {
    if (Array.isArray(filterOptions)) {
      return filterOptions as FilterOption[];
    }
    return [filterOptions];
  }

  /**
   * Get the filterOption based on the variable.
   * @param filterOptions - The FilterOptions to search.
   * @param option - The left hand side of the filter.
   */
  public static getFilter(filterOptions: FilterOptions, option: string): FilterOption {
    if (filterOptions === undefined) return undefined;
    const options: FilterOption[] = this.makeArray(filterOptions);
    return options.find((filterOption) => filterOption.variable === option);
  }

  /**
   * Applies all the filters in a FilterOptions to a query.
   * @param query - The query the filter.
   * @param filterOptions - The FilterOptions to apply.
   */
  public static applyFilter(query: SelectQueryBuilder<any>, filterOptions: FilterOptions)
    : SelectQueryBuilder<any> {
    const options: FilterOption[] = this.makeArray(filterOptions);

    options.forEach((filterOption) => {
      if (!filterOption.meta) query.andWhere(`${filterOption.variable} = ${filterOption.argument}`);
    });

    return query;
  }
}
