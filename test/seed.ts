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
import dinero from 'dinero.js';
import Container from '../src/entity/container/container';
import ContainerRevision from '../src/entity/container/container-revision';
import Product from '../src/entity/product/product';
import ProductCategory from '../src/entity/product/product-category';
import ProductRevision from '../src/entity/product/product-revision';
import User, { UserType } from '../src/entity/user/user';

/**
 * Defines user objects with the given parameters.
 *
 * @param users - The target array in which the objects are stored.
 * @param count - The number of objects to define.
 * @param type - The type of users to define.
 * @param active - Active state of the defined uers.
 */
function defineUsers(users: User[], count: number, type: UserType, active: boolean) {
  const start = users.length;
  for (let nr = 0; nr < count; nr += 1) {
    users.push(Object.assign(new User(), {
      firstName: `Firstname${start + nr}`,
      lastName: `Lastname${start + nr}`,
      type,
      active,
    }) as User);
  }
}

/**
 * Seeds a default dataset of users, and stores them in the database.
 */
async function seedUsers(): Promise<User[]> {
  const types: UserType[] = [
    UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN,
  ];
  const users: User[] = [];

  for (let i = 0; i < types.length; i += 1) {
    defineUsers(users, 4, types[i], true);
    defineUsers(users, 2, types[i], false);
  }

  return User.save(users);
}

/**
 * Seeds a default dataset of product categories, and stores them in the database.
 */
async function seedProductCategories(): Promise<ProductCategory[]> {
  const category = (data: object) => Object.assign(new ProductCategory(), data) as ProductCategory;

  return ProductCategory.save([
    category({
      name: 'Alcoholic',
    }),
    category({
      name: 'Non-alcoholic',
    }),
    category({
      name: 'Food',
    }),
  ]);
}

/**
 * Defines product objects with revisions based on the parameters passed.
 *
 * @param products - The target array in which the product objects are stored.
 * @param revisions - The target array in which the revision objects are stored.
 * @param count - The number of products to generate.
 * @param user - The user that is owner of the products.
 * @param category - The category generated products will belong to.
 */
function defineProducts(
  products: Product[],
  revisions: ProductRevision[],
  count: number,
  user: User,
  category: ProductCategory,
) {
  const start = products.length;
  for (let nr = 0; nr < count; nr += 1) {
    const product = Object.assign(new Product(), {
      owner: user,
    }) as Product;
    products.push(product);

    product.currentRevision = 1 + (nr % 3);
    for (let rev = 1; rev <= product.currentRevision; rev += 1) {
      revisions.push(Object.assign(new ProductRevision(), {
        product,
        revision: rev,
        name: `Product${start + nr}-${rev}`,
        category,
        price: dinero({
          amount: 69 + nr + rev,
        }),
        alcoholPercentage: nr / (rev + 1),
        picture: `https://sudosos/product${nr}-${rev}.png`,
      }));
    }
  }
}

/**
 * Seeds a default dataset of products, based on the supplied user and product category dataset.
 * Every user of type local andmin and organ will get products.
 *
 * @param users - The dataset of users to base the product dataset on.
 * @param categories - The dataset of product categories to base the product dataset on.
 */
async function seedProducts(
  users: User[],
  categories: ProductCategory[],
): Promise<{
    products: Product[],
    productRevisions: ProductRevision[]
  }> {
  const products: Product[] = [];
  const productRevisions: ProductRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));
  for (let i = 0; i < sellers.length; i += 1) {
    const category = categories[i % categories.length];
    defineProducts(products, productRevisions, 3, sellers[i], category);
  }

  await Product.save(products);
  await ProductRevision.save(productRevisions);

  return { products, productRevisions };
}

/**
 * Defines container objects with revisions based on the parameters passed.
 *
 * @param containers - The target array in which the container objects are stored.
 * @param revisions - The target array in which the revision objects are stored.
 * @param count - The number of containers to generate.
 * @param user - The user that is owner of the containers.
 * @param productRevisions - The product revisions which will be used in the containers.
 */
function defineContainers(
  containers: Container[],
  revisions: ContainerRevision[],
  count: number,
  user: User,
  productRevisions: ProductRevision[],
) {
  const start = containers.length;
  for (let nr = 0; nr < count; nr += 1) {
    const container = Object.assign(new Container(), {
      owner: user,
    }) as Container;
    containers.push(container);

    // Only allow products with same owner in container.
    const candidates = productRevisions.filter((p) => p.product.owner === user);

    container.currentRevision = 1 + (nr % 3);
    for (let rev = 1; rev <= container.currentRevision; rev += 1) {
      revisions.push(Object.assign(new ContainerRevision(), {
        name: `Container${start + nr}-${rev}`,
        products: candidates.filter((p) => p.revision === rev),
      }) as ContainerRevision);
    }
  }
}

/**
 * Seeds a default dataset of containers, based on the supplied user and product revision dataset.
 * Every user of type local andmin and organ will get containers.
 *
 * @param users - The dataset of users to base the product dataset on.
 * @param productRevisions - The dataset of product revisions to base the container dataset on.
 */
async function seedContainers(
  users: User[],
  productRevisions: ProductRevision[],
): Promise<{
    containers: Container[],
    containerRevisions: ContainerRevision[],
  }> {
  const containers: Container[] = [];
  const containerRevisions: ContainerRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));
  for (let i = 0; i < sellers.length; i += 1) {
    defineContainers(containers, containerRevisions, 3, sellers[i], productRevisions);
  }

  await Container.save(containers);
  await ContainerRevision.save(containerRevisions);

  return { containers, containerRevisions };
}

export interface DatabaseContent {
  users: User[],
  categories: ProductCategory[],
  products: Product[],
  productRevisions: ProductRevision[],
  containers: Container[],
  containerRevisions: ContainerRevision[],
}

export default async function seedDatabase(): Promise<DatabaseContent> {
  const users = await seedUsers();
  const categories = await seedProductCategories();
  const { products, productRevisions } = await seedProducts(users, categories);
  const { containers, containerRevisions } = await seedContainers(users, productRevisions);

  return {
    users,
    categories,
    products,
    productRevisions,
    containers,
    containerRevisions,
  };
}
