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
import { createQueryBuilder } from 'typeorm';
import { ProductResponse } from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';

/**
 * Define product filtering parameters used to filter query results.
 */
export interface ProductParameters {
  /**
   * Filter based on product id.
   */
  productId?: number;
  /**
   * Filter based on product owner.
   */
  ownerId?: number;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductService {
  /**
   * Helper function for the base mapping the raw getMany response product.
   * @param rawProduct - the raw response to parse.
   */
  public static getDefaultMapping(rawProduct: any) {
    return {
      id: rawProduct.product_id,
      alcoholPercentage: rawProduct.alcoholPercentage,
      category: {
        id: rawProduct.category_id,
        name: rawProduct.category_name,
      },
      createdAt: rawProduct.product_createdAt,
      owner: {
        id: rawProduct.owner_id,
        firstName: rawProduct.owner_firstName,
        lastName: rawProduct.owner_lastName,
      },
    };
  }

  /**
   * Query for getting all products based on user.
   * @param params
   */
  public static async getProducts(params?: ProductParameters)
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        ProductRevision,
        'productrevision',
        `product.id = productrevision.product
         AND product.currentRevision = productrevision.revision`,
      )
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .select([
        'product.id',
        'product.createdAt',
        'productrevision.updatedAt',
        'productrevision.revision',
        'productrevision.name',
        'productrevision.price',
        'owner.id',
        'owner.firstName',
        'owner.lastName',
        'category.id',
        'category.name',
        'productrevision.picture',
        'productrevision.alcoholpercentage',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
      ownerId: 'owner.id',
    };
    if (params) QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();

    const mapping = (rawProduct: any) => ({
      name: rawProduct.productrevision_name,
      picture: rawProduct.productrevision_picture,
      price: DineroTransformer.Instance.from(rawProduct.productrevision_price),
      revision: rawProduct.productrevision_revision,
      updatedAt: rawProduct.productrevision_updatedAt,
    });

    return rawProducts.map((rawProduct) => (
      ({ ...this.getDefaultMapping(rawProduct), ...mapping(rawProduct) } as ProductResponse)
    ));
  }

  /**
   * Query to return all updated products.
   * @param filterOptions
   */
  public static async getUpdatedProducts(params?: ProductParameters)
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      )
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('updatedproduct.category', 'category')
      .select([
        'product.id',
        'product.createdAt',
        'updatedproduct.updatedAt',
        'product.currentRevision',
        'updatedproduct.name',
        'updatedproduct.price',
        'owner.id',
        'owner.firstName',
        'owner.lastName',
        'category.id',
        'category.name',
        'updatedproduct.picture',
        'updatedproduct.alcoholpercentage',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
    };
    if (params) QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();

    const mapping = (rawProduct: any) => ({
      name: rawProduct.updatedproduct_name,
      picture: rawProduct.updatedproduct_picture,
      price: DineroTransformer.Instance.from(rawProduct.updatedproduct_price),
      revision: rawProduct.product_currentRevision,
      updatedAt: rawProduct.updatedproduct_updatedAt,
    });

    return rawProducts.map((rawProduct) => (
      ({ ...this.getDefaultMapping(rawProduct), ...mapping(rawProduct) } as ProductResponse)));
  }
}
