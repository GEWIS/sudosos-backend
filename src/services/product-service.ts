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
import User from '../entity/user/user';
import { ProductResponse } from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';

/**
 * Wrapper for all Product related logic.
 */
export default class ProductService {


  /**
   * Function for mapping the raw getMany response product.
   * This is only the base, since the rest depends of if the innerJoin was on either UpdatedProducts or
   * ProductRevisions.
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
      }
    }
  }

  /**
   * Query for getting all products based on user.
   * @param owner - If specified only return products belonging to this owner.
   * @param productId - If specified only return the product with id productId.
   */
  public static async getProducts(owner: User = null, productId: number = null)
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(ProductRevision, 'productrevision',
        'product.id = productrevision.product '
            + 'AND product.currentRevision = productrevision.revision')
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .select([
        'product.id', 'product.createdAt', 'productrevision.updatedAt', 'productrevision.revision',
        'productrevision.name', 'productrevision.price', 'owner.id', 'owner.firstName', 'owner.lastName', 'category.id',
        'category.name', 'productrevision.picture', 'productrevision.alcoholpercentage',
      ]);

    if (owner !== null) {
      builder.andWhere('product.owner = :owner', { owner: owner.id });
    }
    if (productId !== null) {
      builder.andWhere('product.id = :productId', { productId });
    }

    const rawProducts = await builder.getRawMany();

    const mapping = (rawProduct: any) => {
      return {
        name: rawProduct.productrevision_name,
        picture: rawProduct.productrevision_picture,
        price: DineroTransformer.Instance.from(rawProduct.productrevision_price),
        revision: rawProduct.productrevision_revision,
        updatedAt: rawProduct.productrevision_updatedAt,
      }
    }

    return rawProducts.map((rawProduct) => { return { ...this.getDefaultMapping(rawProduct), ...mapping(rawProduct)} as ProductResponse});
  }

  /**
   * Query to return all updated products.
   * @param owner - If specified it will only return products who has the owner Owner.
   */
  public static async getUpdatedProducts(owner: User = null): Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
        .from(Product, 'product')
      .innerJoinAndSelect(UpdatedProduct, 'updatedproduct',
        'product.id = updatedproduct.product')
        .innerJoinAndSelect('product.owner', 'owner')
        .innerJoinAndSelect('updatedproduct.category', 'category')
      .select([
        'product.id', 'product.createdAt', 'updatedproduct.updatedAt', 'product.currentRevision',
        'updatedproduct.name', 'updatedproduct.price', 'owner.id', 'owner.firstName', 'owner.lastName', 'category.id',
        'category.name', 'updatedproduct.picture', 'updatedproduct.alcoholpercentage',
      ]);
    if (owner !== null) {
      builder.where('product.owner = :owner', { owner: owner.id });
    }

    const rawProducts = await builder.getRawMany();

    const mapping = (rawProduct: any) => {
      return {
        name: rawProduct.updatedproduct_name,
        picture: rawProduct.updatedproduct_picture,
        price: DineroTransformer.Instance.from(rawProduct.updatedproduct_price),
        revision: rawProduct.product_currentRevision,
        updatedAt: rawProduct.updatedproduct_updatedAt,
      }
    }

    return rawProducts.map((rawProduct) => { return { ...this.getDefaultMapping(rawProduct), ...mapping(rawProduct)} as ProductResponse});
  }
}
