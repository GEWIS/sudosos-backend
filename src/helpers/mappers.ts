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
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import User from '../entity/user/user';
import UpdatedProduct from '../entity/product/updated-product';
import { ProductResponse } from '../controller/response/product-response';
import DineroTransformer from '../entity/transformer/dinero-transformer';


export async function getProducts(owner: User = null, returnUpdated: boolean = true)
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
    builder.where('product.owner = :owner', { owner: owner.id });
  }
  if (!returnUpdated) {
    builder.where((qb) => {
      const subQuery = qb.subQuery()
        .select('updatedproduct.product')
        .from(UpdatedProduct, 'updatedproduct')
        .getQuery();
      return `product.id NOT IN (${subQuery})`;
    });
  }
  // return builder.getRawMany();

  const rawProducts = await builder.getRawMany();

  console.debug(rawProducts);
  return rawProducts.map((rawProduct) => {
    const product: ProductResponse = {
      id: rawProduct.product_id,
      alcoholPercentage: rawProduct.alcoholPercentage,
      category: {
        id: rawProduct.category_id,
        name: rawProduct.category_name,
      },
      createdAt: rawProduct.product_createdAt,
      name: rawProduct.productrevision_name,
      owner: {
        id: rawProduct.owner_id,
        firstName: rawProduct.owner_firstName,
        lastName: rawProduct.owner_lastName,
      },
      picture: rawProduct.productrevision_picture,
      price: DineroTransformer.Instance.from(rawProduct.productrevision_price),
      revision: rawProduct.productrevision_revision,
      updatedAt: rawProduct.productrevision_updatedAt,
    };
    return product;
  });
}

export async function getUpdatedProducts(owner: User = null): Promise<ProductResponse[]> {
  const builder = createQueryBuilder(Product)
    .innerJoin(UpdatedProduct, 'updatedproduct',
      'product.id = updatedproduct.product')
    .select([
      'product.id', 'product.createdAt', 'updatedproduct.updatedAt', 'updatedproduct.name',
      'updatedproduct.price', 'product.owner', 'updatedproduct.category',
      'updatedproduct.picture', 'updatedproduct.alcoholpercentage',
    ]);
  if (owner !== null) {
    builder.where('product.owner = :owner', { owner: owner.id });
  }
  return await builder.getRawMany() as ProductResponse[];
}

export async function getProductsWithUpdates(owner: User = null): Promise<ProductResponse[]> {
  const products = await this.getProducts(owner);
  const updatedProducts = await this.getUpdatedProducts(owner);

  return products.concat(updatedProducts) as ProductResponse[];
}
