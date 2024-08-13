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

import { EntityManager, FindManyOptions } from 'typeorm';
import ProductCategory from '../entity/product/product-category';
import {
  PaginatedProductCategoryResponse,
  ProductCategoryResponse,
} from '../controller/response/product-category-response';
import ProductCategoryRequest from '../controller/request/product-category-request';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { PaginationParameters } from '../helpers/pagination';
import { AppDataSource } from '../database/database';

/**
 * Define productCategory filtering parameters used to filter query results.
 */
export interface ProductCategoryFilterParameters {
  /**
   * Filter based on product id.
   */
  id?: number;
  /**
   * Filter based on product owner.
   */
  name?: string;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductCategoryService {
  private manager: EntityManager;

  constructor(manager?: EntityManager) {
    this.manager = manager ?? AppDataSource.manager;
  }

  /**
   * Creates a productCategoryResponse from a productCategory
   * @param {ProductCategory.model} productCategory - productCategory
   * @returns {ProductCategoryResponse.model} - a productCategoryResponse
   * created with the productCategory
   */
  public static asProductCategoryResponse(productCategory: ProductCategory)
    : ProductCategoryResponse {
    return {
      id: productCategory.id,
      name: productCategory.name,
      createdAt: productCategory.createdAt.toISOString(),
      updatedAt: productCategory.updatedAt.toISOString(),
      parent: productCategory.parent ? this.asProductCategoryResponse(productCategory.parent) : undefined,
    };
  }

  /**
   * Query for getting the productCategories.
   */
  public static async getProductCategories(
    filters: ProductCategoryFilterParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedProductCategoryResponse> {
    const { take, skip } = pagination;

    const filterMapping: FilterMapping = {
      id: 'id',
      name: 'name',
    };
    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, filters),
      order: { id: 'ASC' },
    };

    const results = await Promise.all([
      ProductCategory.find({ ...options, take, skip, relations: { parent: true } }),
      ProductCategory.count(options),
    ]);

    const records = results[0].map(
      (productCategory) => (this.asProductCategoryResponse(productCategory)),
    );

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Saves a ProductCategory to the database.
   * @param request - The ProductCategoryRequest with values.
   */
  public static async postProductCategory(
    request: ProductCategoryRequest,
  ): Promise<ProductCategoryResponse> {
    const parentCategory = request.parentCategoryId
      ? await ProductCategory.findOne({ where: { id: request.parentCategoryId } })
      : undefined;

    const category = new ProductCategory();
    category.name = request.name;
    category.parent = parentCategory;
    return ProductCategory.save(category)
      .then(() => this.asProductCategoryResponse(category));
  }

  /**
   * Updates a ProductCategory in the database.
   * @param id - The id of the productCategory that needs to be updated.
   * @param request - The ProductCategoryRequest with updated values.
   */
  public static async patchProductCategory(
    id: number, request: ProductCategoryRequest,
  ): Promise<ProductCategoryResponse> {
    const category = await ProductCategory.findOne({ where: { id } });
    if (!category) return null;
    const productCategory = Object.assign(category, request);
    await ProductCategory.save(productCategory);
    return this.asProductCategoryResponse(productCategory);
  }

  /**
   * Deletes a ProductCategory from the database.
   * @param id - The id of the productCategory that needs to be deleted.
   */
  public static async deleteProductCategory(id: number): Promise<ProductCategoryResponse> {
    const productCategory = await ProductCategory.findOne({ where: { id }, relations: { children: true } });
    if (!productCategory || productCategory.children.length > 0) {
      return null;
    }
    return ProductCategory.delete(id).then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Verifies whether the productCategory request translates to a valid productCategory
   * @param {ProductCategoryRequest.model} request
   * - the productCategory request to verify
   * @returns {boolean} - whether productCategory is ok or not
   */
  public static async verifyProductCategory(request: ProductCategoryRequest):
  Promise<boolean> {
    return request.name != null && request.name !== ''
        && request.name.length <= 64
        && !(await ProductCategory.findOne({ where: { name: request.name } }));
  }
}
