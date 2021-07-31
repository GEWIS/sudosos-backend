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
import dinero from 'dinero.js';
import { ProductResponse } from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';
import UpdatedContainer from '../entity/container/updated-container';
import BaseProduct from '../entity/product/base-product';
import User from '../entity/user/user';
import ProductRequest, {ProductUpdateRequest} from '../controller/request/product-request';
import ProductCategory from '../entity/product/product-category';

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
  /**
   * Filter based on a specific container revision.
   */
  containerRevision?: number;
  /**
   * Filter based on if the updated container should be used.
   */
  updatedContainer?: boolean;
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
      picture: rawProduct.picture,
      name: rawProduct.name,
      price: DineroTransformer.Instance.from(rawProduct.price),
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
  private static addContainerFilter(builder: SelectQueryBuilder<Product>,
    containerId: number, isUpdatedProduct: boolean, isUpdatedContainer: boolean, containerRevision: number | string = 'currentRevision'): void {
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
      if (containerRevision === 'currentRevision') {
        return 'container.id = containeralias.containerId AND container.currentRevision = containeralias.revision';
      }
      return `container.id = containeralias.containerId AND ${containerRevision} = containeralias.revision`;
    }

    // Filter on products in the container.
    builder
      .innerJoinAndSelect((qb) => qb
        .from(Container, 'container')
        .innerJoinAndSelect(
          isUpdatedContainer ? UpdatedContainer : ContainerRevision,
          'containeralias',
          innerJoin(),
        )
        .innerJoinAndSelect('containeralias.products', 'product')
        .where('container.id = :id', { id: containerId })
        .select(isUpdatedContainer
          ? ['productId']
          : ['product.productId AS productId', 'product.revision as productRevision']),
      'containerproducts', condition());
  }

  /**
   * Query for getting all products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static async getProducts(params: ProductParameters = {})
    : Promise<ProductResponse[]> {
    const filter = params.containerId;
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        ProductRevision,
        'productrevision',
        // If we are getting updatedContainers or products,
        // we only want the last revision, otherwise all revisions.
        // This is needed since containers can contain older revisions,
        // Whilst updatedContainer contain the oldest revisions.
        params.updatedContainer || !params.containerId
          ? 'product.id = productrevision.product AND product.currentRevision = productrevision.revision'
          : 'product.id = productrevision.product',
      );

    if (filter) {
      this.addContainerFilter(builder, filter, false,
        params.updatedContainer, params.containerRevision);
    }

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

    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();
    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Query for getting all updated products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static async getUpdatedProducts(params: ProductParameters = {})
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      );

    if (params.containerId) {
      this.addContainerFilter(builder, params.containerId, true, params.updatedContainer);
    }

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

    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();

    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Function that returns all the products in an updated container,
   * @param containerId - The ID of the updated container to use.
   */
  public static async getUpdatedContainer(containerId: number) {
    // We get the products by
    // first getting the updated products and then merge them with the normal products.
    const updatedProducts: ProductResponse[] = await this.getUpdatedProducts({
      containerId,
      updatedContainer: true,
    });

    // Keep track of which IDs belong to updated products.
    const updatedId: { [key:string]: any } = {};
    updatedProducts.forEach((product) => {
      updatedId[product.id] = true;
    });

    // Get the remaining products.
    const products: ProductResponse[] = (await this.getProducts({
      containerId,
      updatedContainer: true,
    }));

    // Store the results.
    const containerProducts: ProductResponse[] = [];

    // Only add the remaining product if there is no updated counterpart.
    products.forEach((product) => {
      if (updatedId[product.id] === undefined) {
        containerProducts.push(product);
      }
    });

    // Return the products.
    return containerProducts.concat(updatedProducts);
  }

  /**
   * Creates a product update.
   * @param productId - The ID of the product to update.
   * @param update - The variables to update.
   *  If undefined it uses the params from the latest revision.
   */
  public static async updateProduct(productId: number, update: ProductUpdateRequest)
    : Promise<ProductResponse> {
    // Get the base product.
    const base: Product = await Product.findOne(productId);

    // return undefined if not found or request is invalid
    if (!base) {
      return undefined;
    }

    // Get the latest available of this product.
    const latest: ProductResponse = (await this.getProducts({ productId }))[0];

    // Create the product.
    const updatedProduct: UpdatedProduct = UpdatedProduct.create();

    // Set base product, then the oldest settings and then the newest.
    Object.assign(updatedProduct, {
      product: base,
      ...latest,
      ...update,
      // Price number into dinero.
      price: dinero({
        amount: update.price,
      }),
    });

    // Save the product.
    await updatedProduct.save();

    // Pull the just created product from the database to fix the formatting.
    return (await this.getUpdatedProducts({ productId }))[0];
  }

  /**
   * Creates a new product.
   *
   * The newly created product resides in the Product table and has no revision,
   * but it does have an updated product.
   * To confirm the product the updated product has to be confirmed and a revision will be created.
   *
   * @param owner - The user that created the product.
   * @param product - The product to be created.
   */
  public static async createProduct(owner: User, product: ProductRequest)
    : Promise<ProductResponse> {
    const base: Product = Product.create();

    Object.assign(base, {
      owner,
    });

    // Save the product.
    await base.save();

    // Create the product.
    const updatedProduct: UpdatedProduct = UpdatedProduct.create();

    // Set base product, then the oldest settings and then the newest.
    Object.assign(updatedProduct, {
      product: await Product.findOne(base.id),
      ...product,
      // Price number into dinero.
      price: dinero({
        amount: product.price,
      }),
    });

    await updatedProduct.save();

    return (await this.getUpdatedProducts({ productId: base.id }))[0];
  }

  /**
   * Confirms an product update and creates a product revision.
   * @param productId - The product update to confirm.
   */
  public static async confirmProductUpdate(productId: number)
    : Promise<ProductResponse> {
    const base: Product = await Product.findOne(productId);

    // return undefined if not found or request is invalid
    if (!base) {
      return undefined;
    }

    // Set base product, then the oldest settings and then the newest.
    const productRevision: ProductRevision = Object.assign(new ProductRevision(), {
      product: base,
      // Apply the update.
      ...(await this.getUpdatedProducts({ productId }))[0],
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save the revision.
    await ProductRevision.save(productRevision);
    // Increment current revision.
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    // Return the new product.
    return (await this.getProducts({ productId }))[0];
  }

  /**
   * Verifies whether the product request translates to a valid product
   * @param {ProductRequest.model} productRequest - the product request to verify
   * @returns {boolean} - whether product is ok or not
   */
  public static async verifyProduct(productRequest: ProductRequest): Promise<boolean> {
    return productRequest.price >= 0
        && productRequest.name !== ''
        && await ProductCategory.findOne(productRequest.category)
        && productRequest.picture !== ''
        && productRequest.alcoholPercentage >= 0;
  }

  /**
   * Verifies whether the product request translates to a valid product
   * @param {ProductRequest.model} productRequest - the product request to verify
   * @returns {boolean} - whether product is ok or not
   */
  public static async verifyUpdate(productRequest: ProductUpdateRequest): Promise<boolean> {
    if (productRequest.price) {
      if (productRequest.price < 0) return false;
    }
    if (productRequest.name) {
      if (productRequest.name === '') return false;
    }
    if (productRequest.category) {
      if (!await ProductCategory.findOne(productRequest.category)) return false;
    }
    if (productRequest.picture) {
      if (productRequest.picture === '') return false;
    }
    if (productRequest.alcoholPercentage) {
      if (productRequest.alcoholPercentage < 0) return false;
    }
    return true;
  }
}
