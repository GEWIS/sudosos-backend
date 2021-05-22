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
import ProductCategory from '../entity/product/product-category';
import { ProductCategoryResponse } from '../controller/response/product-category-response';
import ProductCategoryRequest from '../controller/request/product-category-request';

/**
 * Wrapper for all Product related logic.
 */
export default class ProductCategoryService {
  /**
   * Creates a productCategoryResponse from a productCategory
   * @param {ProductCategory.model} productCategory - productCategory
   * @returns {ProductCategoryResponse.model} - a productCategoryResponse
   * created with the productCategory
   */
  private static asProductCategoryResponse(productCategory: ProductCategory)
    : ProductCategoryResponse {
    return {
      id: productCategory.id,
      name: productCategory.name,
      createdAt: productCategory.createdAt,
      updatedAt: productCategory.updatedAt,
    };
  }

  /**
   * Query for getting the productCategory by id.
   * @param id - The id of the productCategory.
   */
  public static async getProductCategoryById(id: number): Promise<ProductCategoryResponse> {
    const productCategory = await ProductCategory.findOne(id);
    if (!productCategory) {
      return undefined;
    }
    return this.asProductCategoryResponse(productCategory);
  }

  /**
   * Query for getting the productCategories.
   */
  public static async getProductCategories(): Promise<ProductCategoryResponse[]> {
    const productCategories = await ProductCategory.find();
    return productCategories.map(
      (productCategory) => (this.asProductCategoryResponse(productCategory)),
    );
  }

  /**
   * Saves a ProductCategory to the database.
   * @param request - The ProductCategoryRequest with values.
   */
  public static async postProductCategory(request: ProductCategoryRequest)
    : Promise<ProductCategoryResponse> {
    const productCategory = Object.assign(new ProductCategory(), request);
    return ProductCategory.save(productCategory)
      .then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Updates a ProductCategory in the database.
   * @param id - The id of the productCategory that needs to be updated.
   * @param request - The ProductCategoryRequest with updated values.
   */
  public static async patchProductCategory(id: number, request: ProductCategoryRequest)
    : Promise<ProductCategoryResponse> {
    const productCategoryToUpdate = await ProductCategory.findOne(id);
    if (!productCategoryToUpdate) {
      return undefined;
    }
    const productCategory = Object.assign(productCategoryToUpdate, request);
    return ProductCategory.save(productCategory)
      .then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Deletes a ProductCategory from the database.
   * @param id - The id of the productCategory that needs to be deleted.
   */
  public static async deleteProductCategory(id: number): Promise<ProductCategoryResponse> {
    const productCategory = await ProductCategory.findOne(id);
    if (!productCategory) {
      return undefined;
    }
    return ProductCategory.delete(id).then(() => this.asProductCategoryResponse(productCategory));
  }
}
