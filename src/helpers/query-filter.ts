import {SelectQueryBuilder} from "typeorm";

export interface FilterOption {
  variable: string,
  argument: string | number,
}

export type FilterOptions = FilterOption[] | FilterOption

export default class QueryFilter {

  public static applyFilter(query: SelectQueryBuilder<any>, filterOptions: FilterOptions): SelectQueryBuilder<any> {
    let options: FilterOption[];

    if (Array.isArray(filterOptions)) {
      options = filterOptions as FilterOption[]
    } else {
      options = [filterOptions]
    }

    options.forEach((filterOption) => {
      query.andWhere(`${filterOption.variable} = ${filterOption.argument}`)
    });
    return query
  }
}