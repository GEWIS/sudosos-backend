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
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import { ProductResponse } from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';

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
  /**
   * Filter based on container id.
   */
  containerId?: number;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductService {
  /**
   * Helper function for the base mapping the raw getMany response product.
   * @param rawProduct - the raw response to parse.
   */
  private static asProductResponse(rawProduct: any): ProductResponse {
    return {
      id: rawProduct.id,
      alcoholPercentage: rawProduct.alcoholPercentage,
      category: {
        id: rawProduct.category_id,
        name: rawProduct.category_name,
      },
      createdAt: rawProduct.createdAt,
      owner: {
        id: rawProduct.owner_id,
        firstName: rawProduct.owner_firstName,
        lastName: rawProduct.owner_lastName,
      },
      picture: rawProduct.picture,
      name: rawProduct.name,
      price: DineroTransformer.Instance.from(rawProduct.price),
    };
  }

  /**
   * Filter the products on container ID.
   * @param builder
   * @param containerId
   * @private
   */
  private static addContainerFilter(builder: SelectQueryBuilder<Product>,
    containerId: number): void {
    builder.andWhere((qb: SelectQueryBuilder<Product>) => {
      const subQuery = qb.subQuery()
        .from(Container, 'container')
        .innerJoinAndSelect(
          ContainerRevision,
          'containerrevision',
          `container.id = containerrevision.containerId
                AND container.currentRevision = containerrevision.revision`,
        )
        .innerJoinAndSelect('containerrevision.products', 'product')
        .where('container.id = :id', { id: containerId })
        .select('productId');
      return `product.id IN ${subQuery.getQuery()}`;
    });
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
      );

    if (params?.containerId) this.addContainerFilter(builder, params.containerId);

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .select([
        'product.id AS id',
        'product.createdAt AS createdAt',
        'productrevision.updatedAt AS updatedAt',
        'productrevision.name AS name',
        'productrevision.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'productrevision.picture AS picture',
        'productrevision.alcoholpercentage AS alcoholpercentage',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
      ownerId: 'owner.id',
    };
    if (params) QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();

    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Query to return all updated products.
   * @param params
   */
  public static async getUpdatedProducts(params?: ProductParameters)
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      );

    if (params?.containerId) this.addContainerFilter(builder, params.containerId);

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('updatedproduct.category', 'category')
      .select([
        'product.id AS id',
        'product.createdAt AS createdAt',
        'updatedproduct.updatedAt AS updatedAt',
        'updatedproduct.name AS name',
        'updatedproduct.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'updatedproduct.picture AS picture',
        'updatedproduct.alcoholpercentage AS alcoholpercentage',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
    };
    if (params) QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();

    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }
}
