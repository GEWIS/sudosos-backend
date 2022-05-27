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
import {
  PaginatedProductResponse,
  ProductResponse,
  UpdatedProductResponse,
} from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';
import UpdatedContainer from '../entity/container/updated-container';
import User from '../entity/user/user';
import CreateProductParams, { UpdateProductParams, UpdateProductRequest } from '../controller/request/product-request';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import { PaginationParameters } from '../helpers/pagination';
import { RequestWithToken } from '../middleware/token-middleware';
import { asBoolean, asDate, asNumber } from '../helpers/validators';
// eslint-disable-next-line import/no-cycle
import ContainerService from './container-service';
import { UpdateContainerParams } from '../controller/request/container-request';

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
   * Filter based on if the updated container should be used.
   */
  updatedContainer?: boolean;
  /**
   * Filter based on point of sale id.
   */
  pointOfSaleId?: number;
  /**
   * Filter based on a specific point of sale revision.
   */
  pointOfSaleRevision?: number;
  /**
   * Filter based on if the updated point of sale should be used.
   */
  updatedPointOfSale?: boolean;
  /**
   * If the query should return updated products.
   */
  updatedProducts?: boolean;
  /**
   * Filter based on the product category id.
   */
  categoryId?: number;
  // /**
  //  * Filter based on the product category name.
  //  */
  // categoryName?: string;
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
  price?: number;
  /**
   * Filter based on alcohol percentage.
   */
  alcoholPercentage?: number;
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
    updatedContainer: asBoolean(req.query.containerRevision),
    pointOfSaleId: asNumber(req.query.pointOfSaleId),
    pointOfSaleRevision: asNumber(req.query.pointOfSaleRevision),
    updatedProducts: asBoolean(req.query.updatedProducts),
    categoryId: asNumber(req.query.categoryId),
    // categoryName: asString(req.query.categoryName),
    createdAt: asDate(req.query.createdAt),
    updatedAt: asDate(req.query.updatedAt),
    // productName: asString(req.query.productName),
    price: asNumber(req.query.price),
    alcoholPercentage: asNumber(req.query.alcoholPercentage),
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
    return {
      id: rawProduct.id,
      revision: rawProduct.revision,
      alcoholPercentage: rawProduct.alcoholpercentage,
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
      image: rawProduct.image,
      name: rawProduct.name,
      price: DineroTransformer.Instance.from(rawProduct.price).toObject(),
    };
  }

  static getRelevantBuilder(params: ProductFilterParameters = {}): () => SelectQueryBuilder<any> {
    if (params.updatedProducts) return this.getUpdatedProducts;
    return this.getCurrentProducts;
  }

  public static async getProducts(filters: ProductFilterParameters = {},
    pagination: PaginationParameters = {}): Promise<PaginatedProductResponse> {
    const { take, skip } = pagination;
    const builder: SelectQueryBuilder<any> = this.getRelevantBuilder(filters).bind(this)(filters);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
      ownerId: 'owner.id',
      categoryId: 'category.id',
      categoryName: 'category.name',
      createdAt: 'product.createdAt',
      updatedAt: 'productrevision.updatedAt',
      productName: 'productrevision.name',
      price: 'productrevision.price',
      alcoholPercentage: 'productrevision.alcoholpercentage',
    };

    QueryFilter.applyFilter(builder, filterMapping, filters);

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
   * @param isUpdatedProduct - If we are getting updated products.
   * @param isUpdatedContainer - If the container is an updated container.
   * @param containerRevision - If we are getting a specific container revision.
   * @private
   */
  private static addContainerFilter(
    builder: SelectQueryBuilder<Product>,
    containerId?: number,
    isUpdatedProduct?: boolean,
    isUpdatedContainer?: boolean,
    containerRevision?: number,
  ): void {
    // Case distinction for the inner join condition.
    function condition() {
      if (isUpdatedProduct) return 'updatedproduct.product = containerproducts.productId';
      if (isUpdatedContainer) {
        return 'productrevision.product = containerproducts.productId';
      }
      return 'productrevision.product = containerproducts.productId AND productrevision.revision = containerproducts.productRevision';
    }

    // Case distinction for the inner join.
    function innerJoin() {
      if (isUpdatedContainer) return 'container.id = containeralias.containerId';
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
            isUpdatedContainer ? UpdatedContainer : ContainerRevision,
            'containeralias',
            innerJoin(),
          )
          .innerJoinAndSelect('containeralias.products', 'product')
          .select(isUpdatedContainer
            ? ['productId']
            : ['product.productId AS productId', 'product.revision as productRevision']);
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
      return (params.updatedContainer || (!params.containerId && !params.pointOfSaleId))
        ? `product.id = productrevision.product AND ${latest} = productrevision.revision`
        : 'product.id = productrevision.product';
    }

    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(ProductRevision, 'productrevision', condition());

    if (params.containerId) {
      this.addContainerFilter(builder, params.containerId, false,
        params.updatedContainer, params.containerRevision);
    }

    if (params.pointOfSaleId) {
      this.addPOSFilter(builder, params.pointOfSaleId, params.pointOfSaleRevision);
    }

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .leftJoinAndSelect('product.image', 'image')
      .select([
        'product.id AS id',
        'productrevision.revision as revision',
        'product.createdAt AS createdAt',
        'productrevision.updatedAt AS updatedAt',
        'productrevision.name AS name',
        'productrevision.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'productrevision.alcoholpercentage AS alcoholpercentage',
        'image.downloadName as image',
      ]);
    return builder;
  }

  /**
   * Query for getting all updated products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static getUpdatedProducts(params: ProductFilterParameters = {})
    : SelectQueryBuilder<any> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      );

    if (params.containerId || params.pointOfSaleId) {
      this.addContainerFilter(builder, params.containerId, true, params.updatedContainer);
    }

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('updatedproduct.category', 'category')
      .leftJoinAndSelect('product.image', 'image')
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
        'updatedproduct.alcoholpercentage AS alcoholpercentage',
        'image.downloadName as image',
      ]);

    return builder;
  }

  /**
   * Function that returns all the products based on parameters.
   * This is used for POS or containers which are not solely
   * the latest revision products.
   * @param params - The product parameters to adhere to.
   */
  public static async getAllProducts(params: ProductFilterParameters = {}) {
    // We get the products by first getting the updated products and then merge them with the
    // normal products.
    const updatedProducts: ProductResponse[] = (await this.getProducts(
      { ...params, updatedProducts: true },
    )).records;

    const updatedProductIds = updatedProducts.map((prod) => prod.id);

    // Get the remaining products.
    const products: ProductResponse[] = (await this.getProducts(params)).records;

    const filteredProducts = products.filter(
      (prod) => !updatedProductIds.includes(prod.id),
    );

    // Return the products.
    return filteredProducts.concat(updatedProducts);
  }

  /**
   * Creates a product update.
   * @param update - The product variables.
   */
  public static async updateProduct(update: UpdateProductParams)
    : Promise<ProductResponse> {
    // Get the base product.
    const base: Product = await Product.findOne(update.id);

    // return undefined if not found or request is invalid
    if (!base) {
      return undefined;
    }

    // Set base product, then the oldest settings and then the newest.
    const updatedProduct = Object.assign(new UpdatedProduct(), {
      product: base,
      ...update,
      price: DineroTransformer.Instance.from(update.price.amount),
    });

    // Save the product.
    await updatedProduct.save();

    // Pull the just created product from the database to fix the formatting.
    return (await this.getProducts({ updatedProducts: true, productId: update.id })).records[0];
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
  public static async createProduct(product: CreateProductParams, approve = false)
    : Promise<UpdatedProductResponse> {
    const owner = await User.findOne(product.ownerId);

    if (!owner) return undefined;

    const base = Object.assign(new Product(), {
      owner,
    });

    // Save the product.
    await base.save();

    const update: UpdateProductParams = {
      price: product.price,
      category: product.category,
      alcoholPercentage: product.alcoholPercentage,
      name: product.name,
      id: base.id,
    };

    let createdProduct: ProductResponse;
    if (approve) {
      createdProduct = await this.directProductUpdate(update);
    } else {
      createdProduct = await this.updateProduct(update);
    }

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
      price: DineroTransformer.Instance.from(update.price.amount),
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

  /**
   * Confirms a product update and creates a product revision.
   * @param productId - The product update to confirm.
   */
  public static async approveProductUpdate(productId: number)
    : Promise<ProductResponse> {
    const base: Product = await Product.findOne(productId);
    const rawUpdateProduct = await UpdatedProduct.findOne({ where: { product: { id: productId } }, relations: ['category'] });

    // return undefined if not found or request is invalid
    if (!base || !rawUpdateProduct) {
      return undefined;
    }

    const updateRequest = {
      price: {
        amount: rawUpdateProduct.price.getAmount(),
        currency: rawUpdateProduct.price.getCurrency(),
        precision: rawUpdateProduct.price.getPrecision(),
      },
      category: rawUpdateProduct.category.id,
      alcoholPercentage: rawUpdateProduct.alcoholPercentage,
      name: rawUpdateProduct.name,
    } as UpdateProductRequest;

    await this.applyProductUpdate(base, updateRequest);

    // Remove update after revision is created.
    await UpdatedProduct.delete(productId);

    // Return the new product.
    return (await this.getProducts({ productId })).records[0];
  }

  public static async directProductUpdate(updateRequest: UpdateProductParams)
    : Promise<ProductResponse> {
    const base: Product = await Product.findOne(updateRequest.id);
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
