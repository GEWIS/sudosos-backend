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
import WithManager from '../../../src/database/with-manager';
import Product from '../../../src/entity/product/product';
import User, { UserType } from '../../../src/entity/user/user';
import ProductImage from '../../../src/entity/file/product-image';
import path from 'path';
import { PRODUCT_IMAGE_LOCATION } from '../../../src/files/storage';
import fs from 'fs';
import ProductCategory from '../../../src/entity/product/product-category';
import VatGroup from '../../../src/entity/vat-group';
import ProductRevision from '../../../src/entity/product/product-revision';
import dinero from 'dinero.js';
import ProductCategorySeeder from './product-category-seeder';
import VatGroupSeeder from './vat-group-seeder';

export default class ProductSeeder extends WithManager {
  /**
   * Defines a product image based on the parameters passed.
   * When not in a testing environment, actual images will be saved to disk.
   *
   * @param product - The product that this product image belongs to
   * @param createdBy - The user who uploaded this product image
   */
  private defineProductImage(product: Product, createdBy: User): ProductImage {
    const downloadName = `product-${product.id}.png`;

    let location;
    if (process.env.NODE_ENV !== 'test') {
      const source = path.join(__dirname, './static/product.png');
      location = path.join(__dirname, '../', PRODUCT_IMAGE_LOCATION, downloadName);
      fs.copyFileSync(source, location);
    } else {
      location = `fake/storage/${downloadName}`;
    }
    return Object.assign(new ProductImage(), {
      id: product.id,
      location,
      downloadName,
      createdBy,
    });
  }

  /**
   * Defines product objects based on the parameters passed.
   *
   * @param start - The number of products that already exist.
   * @param count - The number of products to generate.
   * @param user - The user that is owner of the products.
   */
  private defineProducts(
    start: number,
    count: number,
    user: User,
  ): Product[] {
    const products: Product[] = [];
    for (let nr = 1; nr <= count; nr += 1) {
      const product = Object.assign(new Product(), {
        id: start + nr,
        owner: user,
        deletedAt: (nr % 5 === 4) ? new Date() : undefined,
      }) as Product;

      products.push(product);
    }

    return products;
  }

  /**
   * Defines product revision objects based on the parameters passed.
   *
   * @param count - The number of product revisions to generate.
   * @param product - The product that the product revisions belong to.
   * @param category - The category generated product revisions will belong to.
   * @param vat - The VAT group these product revisions will belong to
   * @param priceMultiplier - Multiplier to apply to the product price
   */
  private defineProductRevisions(
    count: number,
    product: Product,
    category: ProductCategory,
    vat: VatGroup,
    priceMultiplier: number = 1,
  ): ProductRevision[] {
    const revisions: ProductRevision[] = [];

    for (let rev = 1; rev <= count; rev += 1) {
      revisions.push(Object.assign(new ProductRevision(), {
        product,
        revision: rev,
        name: `Product${product.id}-${rev}`,
        category,
        featured: rev % 2 > 0,
        preferred: rev % 3 > 0,
        priceList: product.id % 5 > 0,
        priceInclVat: dinero({
          amount: (69 + product.id + rev) * priceMultiplier,
        }),
        vat,
        alcoholPercentage: product.id / (rev + 1),
      }));
    }

    return revisions;
  }

  /**
   * Seeds a default dataset of product revisions,
   * based on the supplied user and product category dataset.
   * Every user of type local admin and organ will get products.
   *
   * @param users - The dataset of users to base the product dataset on.
   * @param categories - The dataset of product categories to base the product dataset on.
   * @param vatGroups - The dataset of VAT groups to base the product dataset on.
   * @param priceMultiplier - Multiplier to apply to the product price
   */
  public async seed(
    users: User[],
    categories?: ProductCategory[],
    vatGroups?: VatGroup[],
    priceMultiplier: number = 1,
  ): Promise<{
      products: Product[],
      productImages: ProductImage[],
      productRevisions: ProductRevision[],
    }> {
    const categories1 = categories ?? await new ProductCategorySeeder(this.manager).seed();
    const vatGroups1 = vatGroups ?? await new VatGroupSeeder(this.manager).seed();

    let products: Product[] = [];
    let productImages: ProductImage[] = [];
    let productRevisions: ProductRevision[] = [];

    const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN].includes(u.type));

    const promises: Promise<any>[] = [];
    for (let i = 0; i < sellers.length; i += 1) {
      const prod = this.defineProducts(
        products.length,
        8,
        sellers[i],
      );

      let img: ProductImage[] = [];
      for (let o = 0; o < prod.length; o += 1) {
        let image;
        if (o % 2 === 0) {
          image = this.defineProductImage(prod[o], sellers[i]);
          img = img.concat(image);
        }
        prod[o].image = image;
      }

      let rev: ProductRevision[] = [];
      for (let o = 0; o < prod.length; o += 1) {
        const category = categories1[o % categories1.length];
        const fVatGroups = vatGroups1.filter((group) => !group.deleted);
        const vatGroup = fVatGroups[o % fVatGroups.length];
        prod[o].currentRevision = (prod[o].id % 3) + 1;
        rev = rev.concat(this.defineProductRevisions(
          prod[o].currentRevision,
          prod[o],
          category,
          vatGroup,
          priceMultiplier,
        ));
      }

      // Products can only be saved AFTER the images have been saved.
      // Revisions can only be saved AFTER the products themselves.
      promises.push(this.manager.save(ProductImage, img)
        .then(() => this.manager.save(Product, prod)
          .then(() => this.manager.save(ProductRevision, rev))));

      products = products.concat(prod);
      productImages = productImages.concat(img);
      productRevisions = productRevisions.concat(rev);
    }
    await Promise.all(promises);

    return { products, productImages, productRevisions };
  }
}
