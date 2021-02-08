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
import PointOfSale from '../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../src/entity/point-of-sale/point-of-sale-revision';
import Product from '../src/entity/product/product';
import ProductCategory from '../src/entity/product/product-category';
import ProductRevision from '../src/entity/product/product-revision';
import SubTransaction from '../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../src/entity/transactions/sub-transaction-row';
import Transaction from '../src/entity/transactions/transaction';
import User, { UserType } from '../src/entity/user/user';

/**
 * Defines user objects with the given parameters.
 *
 * @param start - The number of users that already exist.
 * @param count - The number of objects to define.
 * @param type - The type of users to define.
 * @param active - Active state of the defined uers.
 */
function defineUsers(
  start: number,
  count: number,
  type: UserType,
  active: boolean,
): User[] {
  const users: User[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    users.push(Object.assign(new User(), {
      id: start + nr,
      firstName: `Firstname${start + nr}`,
      lastName: `Lastname${start + nr}`,
      type,
      active,
    }) as User);
  }
  return users;
}

/**
 * Seeds a default dataset of users, and stores them in the database.
 */
async function seedUsers(): Promise<User[]> {
  const types: UserType[] = [
    UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN,
  ];
  let users: User[] = [];

  const promises: Promise<any>[] = [];
  for (let i = 0; i < types.length; i += 1) {
    let u = defineUsers(users.length, 4, types[i], true);
    promises.push(User.save(u));
    users = users.concat(u);

    u = defineUsers(users.length, 2, types[i], false);
    promises.push(User.save(u));
    users = users.concat(u);
  }
  await Promise.all(promises);

  return users;
}

/**
 * Seeds a default dataset of product categories, and stores them in the database.
 */
async function seedProductCategories(): Promise<ProductCategory[]> {
  const category = (data: object) => Object.assign(new ProductCategory(), data) as ProductCategory;

  return ProductCategory.save([
    category({
      id: 1,
      name: 'Alcoholic',
    }),
    category({
      id: 2,
      name: 'Non-alcoholic',
    }),
    category({
      id: 3,
      name: 'Food',
    }),
  ]);
}

/**
 * Defines product objects with revisions based on the parameters passed.
 *
 * @param start - The number of products that already exist.
 * @param count - The number of products to generate.
 * @param user - The user that is owner of the products.
 * @param category - The category generated products will belong to.
 */
function defineProducts(
  start: number,
  count: number,
  user: User,
  category: ProductCategory,
): {
    products: Product[],
    revisions: ProductRevision[]
  } {
  const products: Product[] = [];
  const revisions: ProductRevision[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const product = Object.assign(new Product(), {
      id: start + nr,
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

  return { products, revisions };
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
  let products: Product[] = [];
  let productRevisions: ProductRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const category = categories[i % categories.length];
    const { products: prod, revisions: rev } = defineProducts(
      products.length,
      3,
      sellers[i],
      category,
    );

    // Revisions can only be saved AFTER the products themselves.
    promises.push(Product.save(prod).then(() => ProductRevision.save(rev)));

    products = products.concat(prod);
    productRevisions = productRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { products, productRevisions };
}

/**
 * Defines container objects with revisions based on the parameters passed.
 *
 * @param start - The number of containers that already exist.
 * @param count - The number of containers to generate.
 * @param user - The user that is owner of the containers.
 * @param productRevisions - The product revisions which will be used in the containers.
 */
function defineContainers(
  start: number,
  count: number,
  user: User,
  productRevisions: ProductRevision[],
): {
    containers: Container[],
    revisions: ContainerRevision[],
  } {
  const containers: Container[] = [];
  const revisions: ContainerRevision[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const container = Object.assign(new Container(), {
      id: start + nr,
      owner: user,
    }) as Container;
    containers.push(container);

    // Only allow products with same owner in container.
    const candidates = productRevisions.filter((p) => p.product.owner === user);

    container.currentRevision = 1 + (nr % 3);
    for (let rev = 1; rev <= container.currentRevision; rev += 1) {
      revisions.push(Object.assign(new ContainerRevision(), {
        container,
        revision: rev,
        name: `Container${start + nr}-${rev}`,
        products: candidates.filter((p) => p.revision === rev),
      }) as ContainerRevision);
    }
  }

  return { containers, revisions };
}

/**
 * Seeds a default dataset of containers, based on the supplied user and product revision dataset.
 * Every user of type local andmin and organ will get containers.
 *
 * @param users - The dataset of users to base the container dataset on.
 * @param productRevisions - The dataset of product revisions to base the container dataset on.
 */
async function seedContainers(
  users: User[],
  productRevisions: ProductRevision[],
): Promise<{
    containers: Container[],
    containerRevisions: ContainerRevision[],
  }> {
  let containers: Container[] = [];
  let containerRevisions: ContainerRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const { containers: con, revisions: rev } = defineContainers(
      containers.length,
      3,
      sellers[i],
      productRevisions,
    );

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(Container.save(con).then(() => ContainerRevision.save(rev)));

    containers = containers.concat(con);
    containerRevisions = containerRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { containers, containerRevisions };
}

/**
 * Defines point of sale objects with revisions based on the parameters passed.
 *
 * @param start - The number of points of sale that already exist.
 * @param count - The number of containers to generate.
 * @param user - The user that is owner of the containers.
 * @param containerRevisions - The container revisions which will be used in the points of sale.
 */
function definePointsOfSale(
  start: number,
  count: number,
  user: User,
  containerRevisions: ContainerRevision[],
): {
    pointsOfSale: PointOfSale[],
    revisions: PointOfSaleRevision[],
  } {
  const pointsOfSale: PointOfSale[] = [];
  const revisions: PointOfSaleRevision[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const pointOfSale = Object.assign(new PointOfSale(), {
      id: start + nr,
      owner: user,
    }) as PointOfSale;
    pointsOfSale.push(pointOfSale);

    pointOfSale.currentRevision = 1 + (nr % 3);
    for (let rev = 1; rev <= pointOfSale.currentRevision; rev += 1) {
      revisions.push(Object.assign(new PointOfSaleRevision(), {
        pointOfSale,
        revision: rev,
        name: `PointOfSale${start + nr}-${rev}`,
        containers: containerRevisions.filter((c) => c.revision === rev),
        startDate: new Date(),
        endDate: new Date(),
      }) as PointOfSaleRevision);
    }
  }

  return { pointsOfSale, revisions };
}

/**
 * Seeds a default dataset of points of sale, based on the supplied user and container
 * revision dataset. Every user of type local andmin and organ will get points of sale.
 *
 * @param users - The dataset of users to base the point of sale dataset on.
 * @param containerRevisions
 *  - The dataset of container revisions to base the point of sale dataset on.
 */
async function seedPointsOfSale(
  users: User[],
  containerRevisions: ContainerRevision[],
): Promise<{
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
  }> {
  let pointsOfSale: PointOfSale[] = [];
  let pointOfSaleRevisions: PointOfSaleRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const { pointsOfSale: pos, revisions: rev } = definePointsOfSale(
      pointsOfSale.length,
      3,
      sellers[i],
      containerRevisions,
    );

    // Revisions can only be saved AFTER the points of sale themselves.
    promises.push(PointOfSale.save(pos).then(() => PointOfSaleRevision.save(rev)));

    pointsOfSale = pointsOfSale.concat(pos);
    pointOfSaleRevisions = pointOfSaleRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { pointsOfSale, pointOfSaleRevisions };
}

/**
 * Defines transaction objects subtransactions and rows based on the parameters passed.
 * A deterministic subset of the containers and products will be used for every transaction.
 *
 * @param start - The number of transactions that already exist.
 * @param startSubTransaction - The number of subtransactions that already exist.
 * @param startRow - The number of subtransaction rows that already exist.
 * @param count - The number of transactions to generate.
 * @param pointOfSale - The point of sale for which to generate transactions.
 * @param from - The user that buys stuff from the point of sale.
 * @param createdBy - The user that has created the transaction for the 'from' user, or null.
 */
function defineTransactions(
  start: number,
  startSubTransaction: number,
  startRow: number,
  count: number,
  pointOfSale: PointOfSaleRevision,
  from: User,
  createdBy: User,
): Transaction[] {
  const transactions: Transaction[] = [];
  let subTransactionId = startSubTransaction;
  let rowId = startRow;

  for (let nr = 1; nr <= count; nr += 1) {
    const transaction = Object.assign(new Transaction(), {
      id: start + nr,
      from,
      createdBy,
      pointOfSale,
      subTransactions: [],
    }) as Transaction;
    transactions.push(transaction);

    for (let c = 0; c < pointOfSale.containers.length; c += 1) {
      const container = pointOfSale.containers[c];

      // Only define some of the containers.
      if ((start + 5 * c + 13 * nr) % 3 === 0) {
        subTransactionId += 1;
        const subTransaction = Object.assign(new SubTransaction(), {
          id: subTransactionId,
          to: pointOfSale.pointOfSale.owner,
          transaction,
          container,
          subTransactionRows: [],
        });
        transaction.subTransactions.push(subTransaction);

        for (let p = 0; p < container.products.length; p += 1) {
          // Only define some of the products.
          if ((3 * start + 7 * c + 17 * nr + p * 19) % 5 === 0) {
            rowId += 1;
            const row = Object.assign(new SubTransactionRow(), {
              id: rowId,
              subTransaction,
              product: container.products[p],
              amount: ((start + c + p + nr) % 3) + 1,
            });
            subTransaction.subTransactionRows.push(row);
          }
        }
      }
    }
  }

  return transactions;
}

/**
 * Seeds a default dataset of transactions, based on the supplied user and point of sale
 * revision dataset. Every point of sale revision will recevie transactions.
 *
 * @param users - The dataset of users to base the point of sale dataset on.
 * @param pointOfSaleRevisions
 *  - The dataset of point of sale revisions to base the transaction dataset on.
 */
async function seedTransactions(
  users: User[],
  pointOfSaleRevisions: PointOfSaleRevision[],
): Promise<{
    transactions: Transaction[],
  }> {
  let transactions: Transaction[] = [];
  let startSubTransaction = 0;
  let startRow = 0;

  const promises: Promise<any>[] = [];
  for (let i = 0; i < pointOfSaleRevisions.length; i += 1) {
    const pos = pointOfSaleRevisions[i];

    const from = users[(i + pos.pointOfSale.id * 5 + pos.revision * 7) % users.length];
    const createdBy = (i + pos.revision) % 3 !== 0
      ? undefined
      : users[(i * 5 + pos.pointOfSale.id * 7 + pos.revision) % users.length];
    const trans = defineTransactions(
      transactions.length,
      startSubTransaction,
      startRow,
      2,
      pos,
      from,
      createdBy,
    );

    // Update the start id counters.
    for (let a = 0; a < trans.length; a += 1) {
      const t = trans[a];
      startSubTransaction += t.subTransactions.length;
      for (let b = 0; b < t.subTransactions.length; b += 1) {
        const s = t.subTransactions[b];
        startRow += s.subTransactionRows.length;
      }
    }

    // First, save all transactions.
    const promise = Transaction.save(trans)
      .then(async () => {
        // Then, save all subtransactions for the transactions.
        const subPromises: Promise<any>[] = [];
        trans.forEach((t) => {
          subPromises.push(SubTransaction.save(t.subTransactions));
        });
        await Promise.all(subPromises);
      }).then(async () => {
        // Then, save all subtransactions rows for the subtransactions.
        const subPromises: Promise<any>[] = [];
        trans.forEach((t) => {
          t.subTransactions.forEach((s) => {
            subPromises.push(SubTransactionRow.save(s.subTransactionRows));
          });
        });
        await Promise.all(subPromises);
      });
    promises.push(promise);

    transactions = transactions.concat(trans);
  }
  await Promise.all(promises);

  return { transactions };
}

export interface DatabaseContent {
  users: User[],
  categories: ProductCategory[],
  products: Product[],
  productRevisions: ProductRevision[],
  containers: Container[],
  containerRevisions: ContainerRevision[],
  pointsOfSale: PointOfSale[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  transactions: Transaction[],
}

export default async function seedDatabase(): Promise<DatabaseContent> {
  const users = await seedUsers();
  const categories = await seedProductCategories();
  const { products, productRevisions } = await seedProducts(users, categories);
  const { containers, containerRevisions } = await seedContainers(users, productRevisions);
  const { pointsOfSale, pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
  const { transactions } = await seedTransactions(users, pointOfSaleRevisions);

  return {
    users,
    categories,
    products,
    productRevisions,
    containers,
    containerRevisions,
    pointsOfSale,
    pointOfSaleRevisions,
    transactions,
  };
}
