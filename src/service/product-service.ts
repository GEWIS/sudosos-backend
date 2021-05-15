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
import QueryFilter, { FilterOption, FilterOptions } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';

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
   * Query for getting products.
   * @param filterOptions - The filters to use
   * <p>
   *   Example FilterOptions:
   *
   *   Returns the products owned by Owner.id = 0
   *   {variable: 'product.owner', argument: 0}
   *
   *   Returns the product with id 2
   *   {variable: 'product.id', argument: 2},
   *
   *   Returns the products in Container.id = 3
   *   {variable: 'containerId', argument: 3, meta: true}
   */
  public static async getProducts(filterOptions?: FilterOptions)
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        ProductRevision,
        'productrevision',
        `product.id = productrevision.product
         AND product.currentRevision = productrevision.revision`,
      )
      .andWhere((qb) => {
        const filter: FilterOption = QueryFilter.getFilter(filterOptions, 'containerId');
        if (filter) {
          const subQuery = qb.subQuery()
            .from(Container, 'container')
            .innerJoinAndSelect(
              ContainerRevision,
              'containerrevision',
              `container.id = containerrevision.containerId
                AND container.currentRevision = containerrevision.revision`,
            )
            .innerJoinAndSelect('containerrevision.products', 'product')
            .where('container.id = :id', { id: filter.argument })
            .select('productId');
          return `product.id IN ${subQuery.getQuery()}`;
        }
        return 'TRUE';
      })
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

    if (filterOptions) QueryFilter.applyFilter(builder, filterOptions);

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
   * Query for getting updated products.
   * @param filterOptions - The filters to use
   * <p>
   *   Example FilterOptions:
   *
   *   Returns the products owned by Owner.id = 0
   *   {variable: 'product.owner', argument: 0}
   *
   *   Returns the product with id 2
   *   {variable: 'product.id', argument: 2},
   *
   *   Returns the products in Container.id = 3
   *   {variable: 'containerId', argument: 3, meta: true}
   */
  public static async getUpdatedProducts(filterOptions?: FilterOptions):
  Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      )
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('updatedproduct.category', 'category')
      .andWhere((qb) => {
        const filter: FilterOption = QueryFilter.getFilter(filterOptions, 'containerId');
        if (filter) {
          const subQuery = qb.subQuery()
            .from(Container, 'container')
            .innerJoinAndSelect(
              ContainerRevision,
              'containerrevision',
              `container.id = containerrevision.containerId
                  AND container.currentRevision = containerrevision.revision`,
            )
            .innerJoinAndSelect('containerrevision.products', 'product')
            .where('container.id = :id', { id: filter.argument })
            .select('productId');
          return `product.id IN ${subQuery.getQuery()}`;
        }
        return '';
      })
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

    if (filterOptions) QueryFilter.applyFilter(builder, filterOptions);

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
