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

import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import { DineroObject } from 'dinero.js';
import {
  PaginatedProductResponse,
  ProductResponse,
} from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';
import User from '../entity/user/user';
import CreateProductParams, { UpdateProductParams, UpdateProductRequest } from '../controller/request/product-request';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import { PaginationParameters } from '../helpers/pagination';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate, asNumber } from '../helpers/validators';
// eslint-disable-next-line import/no-cycle
import ContainerService from './container-service';
import { UpdateContainerParams } from '../controller/request/container-request';
import { BaseVatGroupResponse } from '../controller/response/vat-group-response';
import AuthenticationService from './authentication-service';

/**
 * Define product filtering parameters used to filter query results.
 */
export interface ProductFilterParameters {
  /**
   * Filter based on product id.
   */
  productId?: number;
  /**
   * Filter based on product revision.
   */
  productRevision?: number;
  /**
   * Filter based on product owner.
   */
  ownerId?: number;
  /**
   * Filter based on container id.
   */
  containerId?: number;
  /**
   * Filter based on a specific container revision.
   */
  containerRevision?: number;
  /**
   * Filter based on point of sale id.
   */
  pointOfSaleId?: number;
  /**
   * Filter based on a specific point of sale revision.
   */
  pointOfSaleRevision?: number;
  /**
   * Filter based on the product category id.
   */
  categoryId?: number;
  // /**
  //  * Filter based on the product category name.
  //  */
  // categoryName?: string;
  /**
   * Filter based on the VAT group id.
   */
  vatGroupId?: number;
  /**
   * Filter based on created at attribute.
   */
  createdAt?: Date;
  /**
   * Filter based on updated at attribute.
   */
  updatedAt?: Date;
  // /**
  //  * Filter based on product name.
  //  * TODO Maybe make this fuzzy? i.e, products like:
  //  */
  // productName?: string;
  /**
   * Filter based on product price.
   */
  priceInclVat?: number;
  /**
   * Filter based on alcohol percentage.
   */
  alcoholPercentage?: number;
  /**
   * Filter on featured products
   */
  featured?: boolean;
  /**
   * Filter on preferred products
   */
  preferred?: boolean;
  /**
   * Filter on shown on narrowcasting screens
   */
  priceList?: boolean;
}

export function parseGetProductFilters(req: RequestWithToken): ProductFilterParameters {
  if ((req.query.pointOfSaleRevision && !req.query.pointOfSaleId)
      || (req.query.containerRevision && !req.query.containerId)
      || (req.query.productRevision && !req.query.productId)) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  const filters: ProductFilterParameters = {
    productId: asNumber(req.query.productId),
    productRevision: asNumber(req.query.productRevision),
    ownerId: asNumber(req.query.fromId),
    containerId: asNumber(req.query.containerId),
    containerRevision: asNumber(req.query.containerRevision),
    pointOfSaleId: asNumber(req.query.pointOfSaleId),
    pointOfSaleRevision: asNumber(req.query.pointOfSaleRevision),
    categoryId: asNumber(req.query.categoryId),
    // categoryName: asString(req.query.categoryName),
    createdAt: asDate(req.query.createdAt),
    updatedAt: asDate(req.query.updatedAt),
    // productName: asString(req.query.productName),
    priceInclVat: asNumber(req.query.priceInclVat),
    alcoholPercentage: asNumber(req.query.alcoholPercentage),
    featured: Boolean(req.query.featured),
    preferred: Boolean(req.query.preferred),
    priceList: Boolean(req.query.priceList),
  };

  return filters;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductService {
  /**
   * Helper function for the base mapping the raw getMany response product.
   * @param rawProduct - the raw response to parse.
   */
  public static asProductResponse(rawProduct: any): ProductResponse {
    const priceInclVat = DineroTransformer.Instance.from(rawProduct.priceInclVat).toObject();
    const vatPercentage = rawProduct.vat_percentage as number; // percentage

    const priceExclVat: DineroObject = {
      ...priceInclVat,
      amount: Math.round(priceInclVat.amount / (1 + (vatPercentage / 100))),
    };
    const vat: BaseVatGroupResponse = {
      id: rawProduct.vat_id,
      percentage: rawProduct.vat_percentage,
      hidden: !!rawProduct.vat_hidden,
    };

    return {
      id: rawProduct.id,
      revision: rawProduct.revision,
      alcoholPercentage: typeof rawProduct.alcoholpercentage === 'string' ? parseFloat(rawProduct.alcoholpercentage) : rawProduct.alcoholpercentage,
      featured: !!rawProduct.featured,
      preferred: !!rawProduct.preferred,
      priceList: !!rawProduct.priceList,
      category: {
        id: rawProduct.category_id,
        name: rawProduct.category_name,
      },
      createdAt: rawProduct.createdAt instanceof Date ? rawProduct.createdAt.toISOString() : rawProduct.createdAt,
      updatedAt: rawProduct.updatedAt instanceof Date ? rawProduct.updatedAt.toISOString() : rawProduct.updatedAt,
      owner: {
        id: rawProduct.owner_id,
        firstName: rawProduct.owner_firstName,
        lastName: rawProduct.owner_lastName,
      },
      image: rawProduct.image,
      name: rawProduct.name,
      priceInclVat,
      priceExclVat,
      vat,
    };
  }

  public static async getProducts(filters: ProductFilterParameters = {},
    pagination: PaginationParameters = {}, user?: User): Promise<PaginatedProductResponse> {
    const { take, skip } = pagination;
    const builder: SelectQueryBuilder<any> = this.getCurrentProducts(filters);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
      ownerId: 'owner.id',
      categoryId: 'category.id',
      categoryName: 'category.name',
      vatGroupId: 'vatgroup.id',
      createdAt: 'product.createdAt',
      updatedAt: 'productrevision.updatedAt',
      productName: 'productrevision.name',
      priceInclVat: 'productrevision.priceInclVat',
      alcoholPercentage: 'productrevision.alcoholpercentage',
      featured: 'productrevision.featured',
      preferred: 'productrevision.preferred',
      priceList: 'productrevision.priceList',
    };

    QueryFilter.applyFilter(builder, filterMapping, filters);

    if (user) {
      const organIds = (await AuthenticationService.getMemberAuthenticators(user)).map((u) => u.id);
      builder.andWhere('owner.id IN (:...organIds)', { organIds });
    }

    const result = await Promise.all([
      builder.getCount(),
      builder.limit(take).offset(skip).getRawMany(),
    ]);

    const count = result[0];
    const records = result[1].map((rawProduct: any) => this.asProductResponse(rawProduct));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
  }

  /**
   * Filter the products on container ID.
   * @param builder - The query builder being used.
   * @param containerId - The ID of the container.
   * @param containerRevision - If we are getting a specific container revision.
   * @private
   */
  private static addContainerFilter(
    builder: SelectQueryBuilder<Product>,
    containerId?: number,
    containerRevision?: number,
  ): void {
    // Case distinction for the inner join condition.
    function condition() {
      return 'productrevision.product = containerproducts.productId AND productrevision.revision = containerproducts.productRevision';
    }

    // Case distinction for the inner join.
    function innerJoin() {
      if (containerRevision) {
        return `container.id = containeralias.containerId AND ${containerRevision} = containeralias.revision`;
      }
      return 'container.id = containeralias.containerId AND container.currentRevision = containeralias.revision';
    }

    // Filter on products in the container.
    builder
      .innerJoinAndSelect((qb) => {
        qb
          .from(Container, 'container')
          .innerJoinAndSelect(
            ContainerRevision,
            'containeralias',
            innerJoin(),
          )
          .innerJoinAndSelect('containeralias.products', 'product')
          .select(['product.productId AS productId', 'product.revision as productRevision']);
        if (containerId) qb.where('container.id = :id', { id: containerId });
        return qb;
      }, 'containerproducts', condition());
  }

  /**
   * Filter the products on point of sale ID.
   * @param builder - The query builder being used.
   * @param pointOfSaleId - The ID of the point of sale.
   * @param pointOfSaleRevision - The revision of the specific point of sale.
   * @private
   */
  private static addPOSFilter(builder: SelectQueryBuilder<any>,
    pointOfSaleId: number, pointOfSaleRevision?: number) {
    const revision = pointOfSaleRevision ?? 'pos.currentRevision';

    builder.innerJoinAndSelect((qb) => {
      const subquery = qb.subQuery()
        .select('products.productId, products.revision')
        .from(PointOfSale, 'pos')
        .innerJoinAndSelect(PointOfSaleRevision, 'posalias', `pos.id = posalias.pointOfSaleId AND pos.id = ${pointOfSaleId} AND posalias.revision = ${revision}`)
        .innerJoinAndSelect('posalias.containers', 'containers')
        .innerJoinAndSelect('containers.products', 'products')
        .groupBy('products.productId, products.revision');

      return subquery;
    }, 'posproducts', 'productrevision.product = posproducts.productId AND productrevision.revision = posproducts.revision');
  }

  /**
   * Query for getting all products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static getCurrentProducts(params: ProductFilterParameters = {})
    : SelectQueryBuilder<any> {
    function condition() {
      // No revision defaults to latest revision.
      const latest = params.productRevision ? params.productRevision : 'product.currentRevision';
      // If we are getting updatedContainers or products,
      // we only want the last revision, otherwise all revisions.
      // This is needed since containers or POS can contain older revisions,
      // Whilst updatedContainer contain the latest revisions.
      return (!params.containerId && !params.pointOfSaleId)
        ? `product.id = productrevision.product AND ${latest} = productrevision.revision`
        : 'product.id = productrevision.product';
    }

    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(ProductRevision, 'productrevision', condition());

    if (params.containerId) {
      this.addContainerFilter(builder, params.containerId, params.containerRevision);
    }

    if (params.pointOfSaleId) {
      this.addPOSFilter(builder, params.pointOfSaleId, params.pointOfSaleRevision);
    }

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .innerJoinAndSelect('productrevision.vat', 'vatgroup')
      .leftJoinAndSelect('product.image', 'image')
      .select([
        'product.id AS id',
        'productrevision.revision as revision',
        'product.createdAt AS createdAt',
        'productrevision.updatedAt AS updatedAt',
        'productrevision.name AS name',
        'productrevision.priceInclVat AS priceInclVat',
        'vatgroup.id AS vat_id',
        'vatgroup.percentage AS vat_percentage',
        'vatgroup.hidden AS vat_hidden',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'productrevision.alcoholpercentage AS alcoholpercentage',
        'image.downloadName as image',
        'productrevision.featured as featured',
        'productrevision.preferred as preferred',
        'productrevision.priceList as priceList',
      ])
      .orderBy({ 'productrevision.name': 'ASC' });

    return builder;
  }

  /**
   * Creates a new product.
   *
   * If approve is false, then the newly created product resides in the
   * Product table and has no revision, but it does have an updated product.
   * To confirm the product the updated product has to be confirmed and a revision will be created.
   *
   * @param product - The product to be created.
   */
  public static async createProduct(product: CreateProductParams)
    : Promise<ProductResponse> {
    const owner = await User.findOne({ where: { id: product.ownerId } });

    if (!owner) return undefined;

    const base = Object.assign(new Product(), {
      owner,
    });

    // Save the product.
    await base.save();

    const update: UpdateProductParams = {
      priceInclVat: product.priceInclVat,
      category: product.category,
      vat: product.vat,
      alcoholPercentage: product.alcoholPercentage,
      name: product.name,
      id: base.id,
      featured: product.featured,
      preferred: product.preferred,
      priceList: product.priceList,
    };

    let createdProduct: ProductResponse;
    createdProduct = await this.directProductUpdate(update);

    return createdProduct;
  }

  public static async applyProductUpdate(base: Product, update: UpdateProductRequest) {
    const product = { ...base };

    // Set base product, then the oldest settings and then the newest.
    const productRevision: ProductRevision = Object.assign(new ProductRevision(), {
      product,
      // Apply the update.
      ...update,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
      // Fix dinero
      priceInclVat: DineroTransformer.Instance.from(update.priceInclVat.amount),
    });

    // First save the revision.
    await ProductRevision.save(productRevision);

    // Increment current revision.
    // eslint-disable-next-line no-param-reassign
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    await this.propagateProductUpdate(base.id);
    return productRevision;
  }

  public static async directProductUpdate(updateRequest: UpdateProductParams)
    : Promise<ProductResponse> {
    const base: Product = await Product.findOne({ where: { id: updateRequest.id } });
    await this.applyProductUpdate(base, updateRequest);
    return (this.getProducts({ productId: base.id }).then((p) => p.records[0]));
  }

  /**
   * Propagates the product update to all parent containers
   *
   * All containers that contain the previous version of this product
   * will be revised to include the new revision.
   *
   * @param productId - The product to propagate
   */
  public static async propagateProductUpdate(productId: number) {
    const containers = (await ContainerService.getContainers({ productId })).records;
    // The async-for loop is intentional to prevent race-conditions.
    // To fix this the good way would be shortlived the structure of POS/Containers will be changed
    for (let i = 0; i < containers.length; i += 1) {
      const c = containers[i];
      // eslint-disable-next-line no-await-in-loop
      await ContainerRevision.findOne({ where: { container: { id: c.id }, revision: c.revision }, relations: ['products', 'products.product'] }).then(async (revision) => {
        const update: UpdateContainerParams = {
          products: revision.products.map((p) => p.product.id),
          public: c.public,
          name: revision.name,
          id: c.id,
        };
        await ContainerService.directContainerUpdate(update);
      });
    }
  }
}
