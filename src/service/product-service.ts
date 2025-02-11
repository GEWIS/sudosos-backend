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
 * This is the module page of the product-service.
 *
 * @module catalogue/products
 */

import {
  FindManyOptions,
  FindOptionsRelations,
  FindOptionsWhere, In, IsNull,
  Raw,

} from 'typeorm';
import { DineroObject } from 'dinero.js';
import {
  BaseProductResponse,
  PaginatedProductResponse,
  ProductResponse,
} from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import User from '../entity/user/user';
import CreateProductParams, { UpdateProductParams } from '../controller/request/product-request';
import { PaginationParameters } from '../helpers/pagination';
import { RequestWithToken } from '../middleware/token-middleware';
import { asDate, asNumber } from '../helpers/validators';
// eslint-disable-next-line import/no-cycle
import ContainerService from './container-service';
import { UpdateContainerParams } from '../controller/request/container-request';
import AuthenticationService from './authentication-service';
import ContainerRevision from '../entity/container/container-revision';

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

  returnContainers?: boolean;
}

// TODO Add filtering to get products query
export function parseGetProductFilters(req: RequestWithToken): ProductFilterParameters {
  if (req.query.productRevision && !req.query.productId) {
    throw new Error('Cannot filter on a revision, when there is no id given');
  }

  const filters: ProductFilterParameters = {
    productId: asNumber(req.query.productId),
    productRevision: asNumber(req.query.productRevision),
    ownerId: asNumber(req.query.fromId),
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

  public static revisionToBaseResponse(revision: ProductRevision): BaseProductResponse {
    return {
      id: revision.productId,
      name: revision.name,
      priceInclVat: revision.priceInclVat.toObject(),
      vat: {
        id: revision.vat.id,
        percentage: revision.vat.percentage,
        hidden: revision.vat.hidden,
      },
    };
  }

  public static revisionToResponse(revision: ProductRevision): ProductResponse {
    const priceInclVat = revision.priceInclVat.toObject();
    const priceExclVat: DineroObject = {
      ...revision.priceInclVat.toObject(),
      amount: Math.round(priceInclVat.amount / (1 + (revision.vat.percentage / 100))),
    };

    const image = revision.product?.image ? revision.product.image.downloadName : null;

    return {
      id: revision.product.id,
      revision: revision.revision,
      alcoholPercentage: parseFloat(String(revision.alcoholPercentage)),
      featured: revision.featured,
      preferred: revision.preferred,
      priceList: revision.priceList,
      category: {
        id: revision.category.id,
        name: revision.category.name,
      },
      createdAt: revision.product.createdAt.toISOString(),
      updatedAt: revision.product.updatedAt.toISOString(),
      owner: {
        id: revision.product.owner.id,
        firstName: revision.product.owner.firstName,
        lastName: revision.product.owner.lastName,
      },
      image,
      name: revision.name,
      priceInclVat,
      priceExclVat,
      vat: {
        id: revision.vat.id,
        percentage: revision.vat.percentage,
        hidden: revision.vat.hidden,
      },
    };
  }

  private static revisionSubQuery(revision?: number): string {
    if (revision) return `${revision}`;
    return Product
      .getRepository()
      .createQueryBuilder('product')
      .select('product.currentRevision')
      .where('product.id = ProductRevision.productId').getSql();
  }

  public static async getProducts(filters: ProductFilterParameters = {},
    pagination: PaginationParameters = {}, user?: User): Promise<PaginatedProductResponse> {
    const { take, skip } = pagination;

    const options = await this.getOptions(filters, user);

    const [data, count] = await ProductRevision.findAndCount({ ...options, take, skip });
    const records = data.map((revision: ProductRevision) => this.revisionToResponse(revision));

    return {
      _pagination: {
        take, skip, count,
      },
      records,
    };
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
    createdProduct = await this.updateProduct(update);

    return createdProduct;
  }

  public static async updateProduct(update: UpdateProductParams) {
    const base = await Product.findOne({ where: { id: update.id } });
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

    const options = await this.getOptions({ productId: base.id });
    return (this.revisionToResponse(await ProductRevision.findOne({ ...options })));
  }

  /**
   * Given a set of containers, update those containers
   * (for example when one of their products are updated/deleted)
   * @private
   */
  private static async executePropagation(containers: ContainerRevision[]) {
    // Deleted containers might still be given, so we filter these manually to prevent unnecessary updates
    const cont = containers.filter((c) => c.container && c.container.deletedAt == null);
    for (const c of cont) {
      const update: UpdateContainerParams = {
        products: c.products.map((p) => p.productId),
        public: c.container.public,
        name: c.name,
        id: c.containerId,
      };
      await ContainerService.updateContainer(update);
    }
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
    let options = await this.getOptions({ productId, returnContainers: true });
    // Get previous revision of container.
    (options.where as FindOptionsWhere<ContainerRevision>).revision = Raw(alias => `${alias}  = (${this.revisionSubQuery()}) - 1`);
    const productRevision = await ProductRevision.findOne(options);

    if (productRevision == null) return;

    const containers = productRevision.containers
      .filter((c) => c.container.deletedAt == null && c.revision === c.container.currentRevision)
      .filter((c, index, self) => (
        index === self.findIndex((c2) => c.container.id === c2.container.id)));

    return this.executePropagation(containers);
  }

  /**
   * (Soft) delete a product
   * @param productId
   */
  public static async deleteProduct(productId: number): Promise<void> {
    const options = await this.getOptions({ productId, returnContainers: true });
    const productRevision = await ProductRevision.findOne(options);
    if (productRevision == null) {
      throw new Error('Product not found!');
    }

    const { containers } = productRevision;
    containers.forEach((c => c.products = c.products.filter((p) => p.productId !== productId)));
    // Make sure to filter out deleted and non-current containers
    const current = containers
      .filter((c) => c.container.deletedAt == null && c.revision === c.container.currentRevision)
      .filter((c, index, self) => (
        index === self.findIndex((c2) => c.container.id === c2.container.id)));
    await this.executePropagation(current);

    await Product.softRemove(productRevision.product);
  }

  /**
   * Returns a FindManyOptions based on the given parameters
   * @param params - The parameters to filter on
   * @param user - The user to filter on
   */
  public static async getOptions(params: ProductFilterParameters, user?: User): Promise<FindManyOptions<ProductRevision>> {
    const filterMapping: FilterMapping = {
      productId: 'productId',
      categoryId: 'category.id',
      categoryName: 'category.name',
      vatGroupId: 'vat.id',
      createdAt: 'product.createdAt',
      updatedAt: 'productrevision.updatedAt',
      productName: 'productrevision.name',
      priceInclVat: 'productrevision.priceInclVat',
      alcoholPercentage: 'productrevision.alcoholpercentage',
      featured: 'featured',
      preferred: 'preferred',
      priceList: 'priceList',
    };

    const relations: FindOptionsRelations<ProductRevision> = {
      product: {
        owner: true,
        image: true,
      },
      vat: true,
      category: true,
    };

    if (params.returnContainers) relations.containers = {
      container: true,
      products: true,
    };

    let owner: FindOptionsWhere<User> = {};
    if (user) {
      const organIds = (await new AuthenticationService().getMemberAuthenticators(user)).map((u) => u.id);
      owner = { id: In(organIds) };
    } else if (params.ownerId) {
      owner = { id: params.ownerId };
    }

    let revisionFilter: any = {};
    // Do not filter on revision if we are getting a specific POS
    revisionFilter.revision = Raw(alias => `${alias} = (${this.revisionSubQuery(params.productRevision)})`);

    let where: FindOptionsWhere<ProductRevision> = {
      ...QueryFilter.createFilterWhereClause(filterMapping, params),
      ...revisionFilter,
      product: {
        deletedAt: IsNull(),
        owner,
      },
    };

    const options: FindManyOptions<ProductRevision> = {
      where,
      order: { name: 'ASC' },
      withDeleted: true,
    };

    return { ...options, relations };
  }
}
