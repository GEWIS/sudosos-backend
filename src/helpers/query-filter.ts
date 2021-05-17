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

export interface FilterOption {
  variable: string,
  argument: string | number,
}

export type FilterOptions = FilterOption[] | FilterOption;

export default class QueryFilter {
  public static applyFilter(
    query: SelectQueryBuilder<any>, filterOptions: FilterOptions,
  ): SelectQueryBuilder<any> {
    let options: FilterOption[];

    if (Array.isArray(filterOptions)) {
      options = filterOptions as FilterOption[];
    } else {
      options = [filterOptions];
    }

    options.forEach((filterOption) => {
      query.andWhere(`${filterOption.variable} = ${filterOption.argument}`);
    });
    return query;
  }
}
