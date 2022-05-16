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
import { addDays } from 'date-fns';
import * as fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
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
import UpdatedProduct from '../src/entity/product/updated-product';
import UpdatedContainer from '../src/entity/container/updated-container';
import UpdatedPointOfSale from '../src/entity/point-of-sale/updated-point-of-sale';
import Transfer from '../src/entity/transactions/transfer';
import ProductImage from '../src/entity/file/product-image';
import Banner from '../src/entity/banner';
import BannerImage from '../src/entity/file/banner-image';
import { BANNER_IMAGE_LOCATION, PRODUCT_IMAGE_LOCATION } from '../src/files/storage';
import StripeDeposit from '../src/entity/deposit/stripe-deposit';
import StripeDepositStatus, { StripeDepositState } from '../src/entity/deposit/stripe-deposit-status';
import DineroTransformer from '../src/entity/transformer/dinero-transformer';
import PayoutRequest from '../src/entity/transactions/payout-request';
import PayoutRequestStatus, { PayoutRequestState } from '../src/entity/transactions/payout-request-status';
import InvoiceUser from '../src/entity/user/invoice-user';
import Invoice from '../src/entity/invoices/invoice';
import InvoiceEntry from '../src/entity/invoices/invoice-entry';
import InvoiceStatus, { InvoiceState } from '../src/entity/invoices/invoice-status';
import GewisUser from '../src/entity/user/gewis-user';
import seedGEWISUsers from '../src/gewis/database/seed';
import PinAuthenticator from '../src/entity/authenticator/pin-authenticator';
import VatGroup from '../src/entity/vat-group';
import { VatGroupRequest } from '../src/controller/request/vat-group-request';

/**
 * Defines InvoiceUsers objects for the given Users
 * @param users - List of Invoice User type
 */
export function defineInvoiceUsers(users: User[]): InvoiceUser[] {
  const invoiceUsers: InvoiceUser[] = [];
  for (let nr = 0; nr < users.length; nr += 1) {
    invoiceUsers.push(Object.assign(new InvoiceUser(), {
      user: users[nr],
      automatic: nr % 2 > 0,
    }));
  }
  return invoiceUsers;
}

/**
 * Defines user objects with the given parameters.
 *
 * @param start - The number of users that already exist.
 * @param count - The number of objects to define.
 * @param type - The type of users to define.
 * @param active - Active state of the defined users.
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

const BCRYPT_ROUNDS = 12;
function hashPassword(password: string, callback: any) {
  bcrypt.genSalt(BCRYPT_ROUNDS, (error, salt) => {
    bcrypt.hash(password, salt, callback);
  });
}

/**
 * Seeds a default set of PIN users and stores them in the database.
 */
async function seedPinAuthenticators(users: User[]): Promise<PinAuthenticator[]> {
  const pinUsers: PinAuthenticator[] = [];

  const promises: Promise<any>[] = [];
  for (let i = 0; i < users.length; i += 1) {
    hashPassword(i.toString(), (error: any, encrypted: any) => {
      const pinUser = Object.assign(new PinAuthenticator(), {
        user: users[i],
        hashedPin: encrypted,
      });
      promises.push(PinAuthenticator.save(pinUser).then((u) => pinUsers.push(u)));
    });
  }

  await Promise.all(promises);
  return pinUsers;
}

/**
 * Seeds a default dataset of users, and stores them in the database.
 */
export async function seedUsers(): Promise<User[]> {
  const types: UserType[] = [
    UserType.LOCAL_USER, UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN, UserType.INVOICE,
  ];
  let users: User[] = [];
  let invoiceUsers: InvoiceUser[] = [];

  const promises: Promise<any>[] = [];
  for (let i = 0; i < types.length; i += 1) {
    const uActive = defineUsers(users.length, 4, types[i], true);
    promises.push(User.save(uActive));
    users = users.concat(uActive);

    const uInactive = defineUsers(users.length, 2, types[i], false);
    promises.push(User.save(uInactive));
    users = users.concat(uInactive);

    if (types[i] === UserType.INVOICE) {
      invoiceUsers = invoiceUsers.concat(defineInvoiceUsers(uActive.concat(uInactive)));
    }
  }

  await Promise.all(promises);
  await InvoiceUser.save(invoiceUsers);

  return users;
}

export function defineInvoiceEntries(invoiceId: number, startEntryId: number,
  transactions: Transaction[]): { invoiceEntries: InvoiceEntry[], cost: number } {
  const invoiceEntries: InvoiceEntry[] = [];
  let entryId = startEntryId;
  const subTransactions = (
    transactions.map((t) => t.subTransactions).reduce((acc, tSub) => acc.concat(tSub)));

  const subTransactionRows = (
    subTransactions.map(
      (tSub) => tSub.subTransactionRows,
    ).reduce((acc, tSubRow) => acc.concat(tSubRow)));

  let cost = 0;
  for (let i = 0; i < subTransactionRows.length; i += 1) {
    cost += subTransactionRows[i].amount * subTransactionRows[i].product.priceInclVat.getAmount();
    invoiceEntries.push(Object.assign(new InvoiceEntry(), {
      id: entryId,
      invoice: invoiceId,
      description: subTransactionRows[i].product.name,
      amount: subTransactionRows[i].amount,
      priceInclVat: subTransactionRows[i].product.priceInclVat,
      vatPercentage: subTransactionRows[i].product.vat.percentage,
    }));
    entryId += 1;
  }
  return { invoiceEntries, cost };
}

export async function seedInvoices(users: User[], transactions: Transaction[]): Promise<Invoice[]> {
  let invoices: Invoice[] = [];

  const invoiceUsers = users.filter((u) => u.type === UserType.INVOICE);
  let transfers: Transfer[] = [];
  let invoiceEntry: InvoiceEntry[] = [];

  for (let i = 0; i < invoiceUsers.length; i += 1) {
    const invoiceTransactions = transactions.filter((t) => t.from.id === invoiceUsers[i].id);
    const to: User = invoiceUsers[i];

    const { invoiceEntries, cost } = (
      defineInvoiceEntries(i + 1, 1 + invoiceEntry.length, invoiceTransactions));
    // Edgecase in the seeder
    if (cost === 0) {
      // eslint-disable-next-line no-continue
      continue;
    }

    invoiceEntry = invoiceEntry.concat(invoiceEntries);

    const transfer = Object.assign(new Transfer(), {
      from: null,
      to,
      amount: dinero({
        amount: cost,
      }),
      description: `Invoice Transfer for ${cost}`,
    });

    const invoice = Object.assign(new Invoice(), {
      id: i + 1,
      to,
      addressee: `Addressed to ${to.firstName}`,
      description: `Invoice #${i}`,
      transfer,
      invoiceEntries,
      invoiceStatus: [],
    });

    const status = Object.assign(new InvoiceStatus(), {
      id: i + 1,
      invoice,
      changedBy: users[i],
      state: InvoiceState.CREATED,
      dateChanged: addDays(new Date(2020, 0, 1), 2 - (i * 2)),
    });
    invoice.invoiceStatus.push(status);
    invoices = invoices.concat(invoice);
    transfers = transfers.concat(transfer);
  }
  await Transfer.save(transfers);
  await Invoice.save(invoices);
  await InvoiceEntry.save(invoiceEntry);

  return invoices;
}

/**
 * Seeds a default dataset of product categories, and stores them in the database.
 */
export async function seedProductCategories(): Promise<ProductCategory[]> {
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
 * Seed the (default) Dutch VAT groups (2022)
 */
export async function seedVatGroups(): Promise<VatGroup[]> {
  const vatGroup = (data: VatGroupRequest) => Object.assign(new VatGroup(), data) as VatGroup;

  return VatGroup.save([
    vatGroup({
      name: 'Hoog tarief',
      percentage: 21,
      deleted: false,
      hidden: false,
    }),
    vatGroup({
      name: 'Laag tarief',
      percentage: 9,
      deleted: false,
      hidden: false,
    }),
    vatGroup({
      name: 'BTW-vrij',
      percentage: 0,
      deleted: false,
      hidden: false,
    }),
    vatGroup({
      name: 'NoTaxesYaaaay',
      percentage: 0,
      deleted: false,
      hidden: true,
    }),
    vatGroup({
      name: 'Laag tarief (oud)',
      percentage: 6,
      deleted: true,
      hidden: false,
    }),
  ]);
}

/**
 * Defines a product image based on the parameters passed.
 * When not in a testing environment, actual images will be saved to disk.
 *
 * @param product - The product that this product image belongs to
 * @param createdBy - The user who uploaded this product image
 */
function defineProductImage(product: Product, createdBy: User): ProductImage {
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
function defineProducts(
  start: number,
  count: number,
  user: User,
): Product[] {
  const products: Product[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const product = Object.assign(new Product(), {
      id: start + nr,
      owner: user,
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
function defineProductRevisions(
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
 * Defines product revision objects based on the parameters passed.
 *
 * @param start - The number of product updates that already exist.
 * @param product - The product that the product updates belong to.
 * @param category - The category generated product updates will belong to.
 * @param vat - The VAT group these product revisions will belong to
 * @param priceMultiplier - Multiplier to apply to the product price
 */
function defineUpdatedProducts(
  start: number,
  product: Product,
  category: ProductCategory,
  vat: VatGroup,
  priceMultiplier: number = 1,
): UpdatedProduct[] {
  const updates: UpdatedProduct[] = [];

  updates.push(Object.assign(new UpdatedProduct(), {
    product,
    name: `Product${product.id}-update`,
    category,
    vat,
    priceInclVat: dinero({
      amount: (42 + product.id) * priceMultiplier,
    }),
    alcoholPercentage: product.id,
  }));

  return updates;
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
export async function seedProducts(
  users: User[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  priceMultiplier: number = 1,
): Promise<{
    products: Product[],
    productImages: ProductImage[],
    productRevisions: ProductRevision[],
  }> {
  let products: Product[] = [];
  let productImages: ProductImage[] = [];
  let productRevisions: ProductRevision[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const prod = defineProducts(
      products.length,
      3,
      sellers[i],
    );

    let img: ProductImage[] = [];
    for (let o = 0; o < prod.length; o += 1) {
      let image;
      if (i % 2 === 0) {
        image = defineProductImage(prod[o], sellers[i]);
        img = img.concat(image);
      }
      prod[o].image = image;
    }

    let rev: ProductRevision[] = [];
    for (let o = 0; o < prod.length; o += 1) {
      const category = categories[o % categories.length];
      const vatGroup = vatGroups[o % vatGroups.length];
      prod[o].currentRevision = (prod[o].id % 3) + 1;
      rev = rev.concat(defineProductRevisions(
        prod[o].currentRevision,
        prod[o],
        category,
        vatGroup,
        priceMultiplier,
      ));
    }

    // Products can only be saved AFTER the images have been saved.
    // Revisions can only be saved AFTER the products themselves.
    promises.push(ProductImage.save(img)
      .then(() => Product.save(prod)
        .then(() => ProductRevision.save(rev))));

    products = products.concat(prod);
    productImages = productImages.concat(img);
    productRevisions = productRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { products, productImages, productRevisions };
}

/**
 * Seeds a default dataset of updated products
 * based on the supplied user and product category dataset.
 * Every user of type local admin and organ will get products.
 *
 * @param users - The dataset of users to base the product dataset on.
 * @param categories - The dataset of product categories to base the product dataset on.
 * @param vatGroups - The dataset of VAT groups to base the product dataset on.
 * @param priceMultiplier - Multiplier to apply to the product price
 */
export async function seedUpdatedProducts(
  users: User[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  priceMultiplier: number = 1,
): Promise<{
    products: Product[],
    productRevisions: ProductRevision[],
    updatedProducts: UpdatedProduct[],
  }> {
  let products: Product[] = [];
  let productRevisions: ProductRevision[] = [];
  let updatedProducts: UpdatedProduct[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];

  for (let i = 0; i < sellers.length; i += 1) {
    const prod = defineProducts(
      products.length,
      3,
      sellers[i],
    );
    let rev: ProductRevision[] = [];
    let upd: UpdatedProduct[] = [];
    for (let o = 0; o < prod.length; o += 1) {
      const category = categories[o % categories.length];
      const vatGroup = vatGroups[o % vatGroups.length];
      const currentRevision = (prod[o].id % 3);
      if (currentRevision > 0) {
        prod[o].currentRevision = currentRevision;
        rev = rev.concat(defineProductRevisions(
          prod[o].currentRevision,
          prod[o],
          category,
          vatGroup,
          priceMultiplier,
        ));
      }
      upd = upd.concat(defineUpdatedProducts(
        updatedProducts.length,
        prod[o],
        category,
        vatGroup,
      ));
    }

    // Revisions can only be saved AFTER the products themselves.
    promises.push(Product.save(prod).then(() => ProductRevision.save(rev))
      .then(() => UpdatedProduct.save(upd)));

    products = products.concat(prod);
    productRevisions = productRevisions.concat(rev);
    updatedProducts = updatedProducts.concat(upd);
  }
  await Promise.all(promises);

  return { products, productRevisions, updatedProducts };
}

/**
 * Seeds a default dataset of product revisions and updated products,
 * based on the supplied user and product category dataset.
 * Every user of type local admin and organ will get products and UpdatedProducts.
 *
 * @param users - The dataset of users to base the product dataset on.
 * @param categories - The dataset of product categories to base the product dataset on.
 * @param vatGroups - The dataset of VAT groups to base the product dataset on.
 * @param priceMultiplier - Multiplier to apply to the product price
 */
export async function seedAllProducts(
  users: User[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  priceMultiplier: number = 1,
): Promise<{
    products: Product[],
    productImages: ProductImage[],
    productRevisions: ProductRevision[],
    updatedProducts: UpdatedProduct[],
  }> {
  let products: Product[] = [];
  let productImages: ProductImage[] = [];
  let productRevisions: ProductRevision[] = [];
  let updatedProducts: UpdatedProduct[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const prod = defineProducts(
      products.length,
      6,
      sellers[i],
    );

    let img: ProductImage[] = [];
    for (let o = 0; o < prod.length; o += 1) {
      let image;
      if (o % 2 === 0) {
        image = defineProductImage(prod[o], sellers[i]);
        img = img.concat(image);
        prod[o].image = image;
      } else {
        prod[o].image = undefined;
      }
    }

    let rev: ProductRevision[] = [];
    for (let o = 0; o < prod.length / 2; o += 1) {
      const category = categories[o % categories.length];
      const vatGroup = vatGroups[o % vatGroups.length];
      prod[o].currentRevision = (prod[o].id % 3) + 1;
      rev = rev.concat(defineProductRevisions(
        prod[o].currentRevision,
        prod[o],
        category,
        vatGroup,
        priceMultiplier,
      ));
    }

    let upd: UpdatedProduct[] = [];
    for (let o = prod.length / 2; o < prod.length; o += 1) {
      const category = categories[o % categories.length];
      const vatGroup = vatGroups[o % vatGroups.length];
      const currentRevision = (prod[o].id % 3);
      if (currentRevision > 0) {
        prod[o].currentRevision = currentRevision;
        rev = rev.concat(defineProductRevisions(
          prod[o].currentRevision,
          prod[o],
          category,
          vatGroup,
          priceMultiplier,
        ));
      }
      upd = upd.concat(defineUpdatedProducts(
        updatedProducts.length,
        prod[o],
        category,
        vatGroup,
        priceMultiplier,
      ));
    }

    // Revisions can only be saved AFTER the products themselves.
    promises.push(ProductImage.save(img)
      .then(() => Product.save(prod)
        .then(() => ProductRevision.save(rev))
        .then(() => UpdatedProduct.save(upd))));

    products = products.concat(prod);
    productImages = productImages.concat(img);
    productRevisions = productRevisions.concat(rev);
    updatedProducts = updatedProducts.concat(upd);
  }
  await Promise.all(promises);

  return {
    products, productImages, productRevisions, updatedProducts,
  };
}

/**
 * Defines container objects based on the parameters passed.
 *
 * @param start - The number of containers that already exist.
 * @param count - The number of containers to generate.
 * @param user - The user that is owner of the containers.
 */
function defineContainers(
  start: number,
  count: number,
  user: User,
): Container[] {
  const containers: Container[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const container = Object.assign(new Container(), {
      id: start + nr,
      owner: user,
      public: nr % 2 > 0,
    }) as Container;
    containers.push(container);
  }
  return containers;
}

/**
 * Defines container revisions based on the parameters passed.
 *
 * @param start - The number of container revisions that already exist.
 * @param count - The number of container revisions to generate.
 * @param container - The container that the container revisions belong to.
 * @param productRevisions - The product revisions that will be added to the container revisions.
 */
function defineContainerRevisions(
  start: number,
  count: number,
  container: Container,
  productRevisions: ProductRevision[],
): ContainerRevision[] {
  const revisions: ContainerRevision[] = [];
  // Only allow products with same owner in container.
  const candidates = productRevisions.filter((p) => p.product.owner === container.owner);

  for (let rev = 1; rev <= count; rev += 1) {
    revisions.push(Object.assign(new ContainerRevision(), {
      container,
      revision: rev,
      name: `Container${container.id}-${rev}`,
      products: candidates.filter((p) => p.revision === rev),
    }));
  }
  return revisions;
}

/**
 * Defines container revisions based on the parameters passed.
 *
 * @param start - The number of updated containers that already exist.
 * @param container - The container that the updated containers belong to.
 * @param products - The products that will be added to the updated containers.
 */
function defineUpdatedContainers(
  start: number,
  container: Container,
  products: Product[],
): UpdatedContainer[] {
  const updates: UpdatedContainer[] = [];
  const candidates = products.filter((p) => p.owner === container.owner);

  updates.push(Object.assign(new UpdatedContainer(), {
    container,
    name: `Container${container.id}-update`,
    products: candidates,
  }));

  return updates;
}

/**
 * Seeds a default dataset of container revisions,
 * based on the supplied user and product dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the container dataset on.
 * @param productRevisions - The dataset of product revisions to base the container dataset on.
 */
export async function seedContainers(
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
    const con = defineContainers(
      containers.length,
      3,
      sellers[i],
    );
    let rev: ContainerRevision[] = [];
    for (let o = 0; o < con.length; o += 1) {
      con[o].currentRevision = (con[o].id % 3) + 1;
      rev = rev.concat(defineContainerRevisions(
        containerRevisions.length,
        con[o].currentRevision,
        con[o],
        productRevisions,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(Container.save(con).then(() => ContainerRevision.save(rev)));

    containers = containers.concat(con);
    containerRevisions = containerRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { containers, containerRevisions };
}

/**
 * Seeds a default dataset of updated containers,
 * based on the supplied user and product dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the container dataset on.
 * @param productRevisions - The dataset of product revisions to base the container dataset on.
 * @param products - The dataset of products to base the container dataset on.
 */
export async function seedUpdatedContainers(
  users: User[],
  productRevisions: ProductRevision[],
  products: Product[],
): Promise<{
    containers: Container[],
    containerRevisions: ContainerRevision[],
    updatedContainers: UpdatedContainer[],
  }> {
  let containers: Container[] = [];
  let containerRevisions: ContainerRevision[] = [];
  let updatedContainers: UpdatedContainer[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const con = defineContainers(
      containers.length,
      3,
      sellers[i],
    );
    let rev: ContainerRevision[] = [];
    let upd: UpdatedContainer[] = [];
    for (let o = 0; o < con.length; o += 1) {
      const currentRevision = (con[o].id % 3);
      if (currentRevision > 1) {
        con[o].currentRevision = currentRevision;
        rev = rev.concat(defineContainerRevisions(
          containerRevisions.length,
          con[o].currentRevision,
          con[o],
          productRevisions,
        ));
      }
      upd = upd.concat(defineUpdatedContainers(
        updatedContainers.length,
        con[o],
        products,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(Container.save(con).then(() => ContainerRevision.save(rev))
      .then(() => UpdatedContainer.save(upd)));

    containers = containers.concat(con);
    containerRevisions = containerRevisions.concat(rev);
    updatedContainers = updatedContainers.concat(upd);
  }
  await Promise.all(promises);

  return { containers, containerRevisions, updatedContainers };
}

/**
 * Seeds a default dataset of container revisions and updated containers,
 * based on the supplied user and product dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the container dataset on.
 * @param productRevisions - The dataset of product revisions to base the container dataset on.
 * @param products - The dataset of products to base the container dataset on.
 */
export async function seedAllContainers(
  users: User[],
  productRevisions: ProductRevision[],
  products: Product[],
): Promise<{
    containers: Container[],
    containerRevisions: ContainerRevision[],
    updatedContainers: UpdatedContainer[],
  }> {
  let containers: Container[] = [];
  let containerRevisions: ContainerRevision[] = [];
  let updatedContainers: UpdatedContainer[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));
  const revision = products.filter((p) => p.currentRevision != null);

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const con = defineContainers(
      containers.length,
      6,
      sellers[i],
    );
    let rev: ContainerRevision[] = [];
    let upd: UpdatedContainer[] = [];
    for (let o = 0; o < con.length / 2; o += 1) {
      con[o].currentRevision = (con[o].id % 3) + 1;
      rev = rev.concat(defineContainerRevisions(
        containerRevisions.length,
        con[o].currentRevision,
        con[o],
        productRevisions,
      ));
    }
    for (let o = con.length / 2; o < con.length; o += 1) {
      const currentRevision = (con[o].id % 3);
      if (currentRevision > 1) {
        con[o].currentRevision = currentRevision;
        rev = rev.concat(defineContainerRevisions(
          containerRevisions.length,
          con[o].currentRevision,
          con[o],
          productRevisions,
        ));
      }
      upd = upd.concat(defineUpdatedContainers(
        updatedContainers.length,
        con[o],
        revision,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(Container.save(con).then(() => ContainerRevision.save(rev))
      .then(() => UpdatedContainer.save(upd)));

    containers = containers.concat(con);
    containerRevisions = containerRevisions.concat(rev);
    updatedContainers = updatedContainers.concat(upd);
  }
  await Promise.all(promises);

  return { containers, containerRevisions, updatedContainers };
}

/**
 * Defines pointsofsale objects based on the parameters passed.
 *
 * @param start - The number of pointsofsale that already exist.
 * @param count - The number of pointsofsale to generate.
 * @param user - The user that is owner of the pointsofsale.
 */
function definePointsOfSale(
  start: number,
  count: number,
  user: User,
): PointOfSale[] {
  const pointsOfSale: PointOfSale[] = [];
  for (let nr = 1; nr <= count; nr += 1) {
    const pointOfSale = Object.assign(new PointOfSale(), {
      id: start + nr,
      owner: user,
    });
    pointsOfSale.push(pointOfSale);
  }
  return pointsOfSale;
}

/**
 * Defines pointsofsale revisions based on the parameters passed.
 *
 * @param start - The number of pointsofsale revisions that already exist.
 * @param count - The number of pointsofsale revisions to generate.
 * @param dateOffset - The date offset from 2000-1-1, where 0 is before, 1 is during, 2 is after.
 * @param pointOfSale - The pointsofsale that the pointsofsale revisions belong to.
 * @param containerRevisions - The container revisions that will be added to
 * the pointsofsale revisions.
 */
function definePointOfSaleRevisions(
  start: number,
  count: number,
  dateOffset: number,
  pointOfSale: PointOfSale,
  containerRevisions: ContainerRevision[],
): PointOfSaleRevision[] {
  const revisions: PointOfSaleRevision[] = [];
  // Only allow products with same owner in container.
  const candidates = containerRevisions.filter((c) => c.container.owner === pointOfSale.owner);
  const startDate = addDays(new Date(2020, 0, 1), 2 - (dateOffset * 2));
  const endDate = addDays(new Date(2020, 0, 1), 3 - (dateOffset * 2));

  for (let rev = 1; rev <= count; rev += 1) {
    revisions.push(Object.assign(new PointOfSaleRevision(), {
      pointOfSale,
      revision: rev,
      name: `PointOfSale${pointOfSale.id}-${rev}`,
      containers: candidates.filter((c) => c.revision === rev),
      startDate,
      endDate,
    }));
  }
  return revisions;
}

/**
 * Defines updated pointsofsale based on the parameters passed.
 *
 * @param start - The number of updated pointsofsale that already exist.
 * @param dateOffset - The date offset from 2000-1-1, where 0 is before, 1 is during, 2 is after.
 * @param pointOfSale - The pointsofsale that the updated pointsofsale belong to.
 * @param containers - The containers that will be added to the updated pointsofsale.
 */
function defineUpdatedPointOfSale(
  start: number,
  dateOffset: number,
  pointOfSale: PointOfSale,
  containers: Container[],
): UpdatedPointOfSale[] {
  const updates: UpdatedPointOfSale[] = [];
  const candidates = containers.filter((c) => c.owner === pointOfSale.owner);
  const startDate = addDays(new Date(2000, 0, 1), 2 - (dateOffset * 2));
  const endDate = addDays(new Date(2000, 0, 1), 3 - (dateOffset * 2));

  updates.push(Object.assign(new UpdatedPointOfSale(), {
    pointOfSale,
    name: `PointOfSale${pointOfSale.id}-update`,
    containers: candidates,
    startDate,
    endDate,
  }));

  return updates;
}

/**
 * Seeds a default dataset of pointsofsale revisions,
 * based on the supplied user and container revision dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the pointsofsale dataset on.
 * @param containerRevisions - The dataset of container revisions to base
 * the pointsofsale dataset on.
 */
export async function seedPointsOfSale(
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
    const pos = definePointsOfSale(
      pointsOfSale.length,
      3,
      sellers[i],
    );
    let rev: PointOfSaleRevision[] = [];
    for (let o = 0; o < pos.length; o += 1) {
      pos[o].currentRevision = (pos[o].id % 3) + 1;
      rev = rev.concat(definePointOfSaleRevisions(
        pointOfSaleRevisions.length,
        pos[o].currentRevision,
        pos[o].currentRevision - 1,
        pos[o],
        containerRevisions,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(PointOfSale.save(pos).then(() => PointOfSaleRevision.save(rev)));

    pointsOfSale = pointsOfSale.concat(pos);
    pointOfSaleRevisions = pointOfSaleRevisions.concat(rev);
  }
  await Promise.all(promises);

  return { pointsOfSale, pointOfSaleRevisions };
}

/**
 * Seeds a default dataset of updated pointsofsale,
 * based on the supplied user and container revision dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the pointsofsale dataset on.
 * @param containerRevisions - The dataset of container revisions to base
 * the pointsofsale dataset on.
 * @param containers - The dataset of containers to base the pointsofsale dataset on.
 */
export async function seedUpdatedPointsOfSale(
  users: User[],
  containerRevisions: ContainerRevision[],
  containers: Container[],
): Promise<{
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    updatedPointsOfSale: UpdatedPointOfSale[],
  }> {
  let pointsOfSale: PointOfSale[] = [];
  let pointOfSaleRevisions: PointOfSaleRevision[] = [];
  let updatedPointsOfSale: UpdatedPointOfSale[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const pos = definePointsOfSale(
      pointsOfSale.length,
      3,
      sellers[i],
    );
    let rev: PointOfSaleRevision[] = [];
    let upd: UpdatedPointOfSale[] = [];
    for (let o = 0; o < pos.length; o += 1) {
      const currentRevision = (pos[o].id % 3);
      if (currentRevision > 1) {
        pos[o].currentRevision = currentRevision;
        rev = rev.concat(definePointOfSaleRevisions(
          pointOfSaleRevisions.length,
          pos[o].currentRevision,
          currentRevision,
          pos[o],
          containerRevisions,
        ));
      }
      upd = upd.concat(defineUpdatedPointOfSale(
        updatedPointsOfSale.length,
        currentRevision,
        pos[o],
        containers,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(PointOfSale.save(pos).then(() => PointOfSaleRevision.save(rev))
      .then(() => UpdatedPointOfSale.save(upd)));

    pointsOfSale = pointsOfSale.concat(pos);
    pointOfSaleRevisions = pointOfSaleRevisions.concat(rev);
    updatedPointsOfSale = updatedPointsOfSale.concat(upd);
  }
  await Promise.all(promises);

  return { pointsOfSale, pointOfSaleRevisions, updatedPointsOfSale };
}

/**
 * Seeds a default dataset of pointsofsale revisions and updated pointsofsale,
 * based on the supplied user and container dataset.
 * Every user of type local admin and organ will get containers.
 *
 * @param users - The dataset of users to base the pointsofsale dataset on.
 * @param containerRevisions - The dataset of container revisions to base
 * the pointsofsale dataset on.
 * @param containers - The dataset of containers to base the pointsofsale dataset on.
 */
export async function seedAllPointsOfSale(
  users: User[],
  containerRevisions: ContainerRevision[],
  containers: Container[],
): Promise<{
    pointsOfSale: PointOfSale[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    updatedPointsOfSale: UpdatedPointOfSale[],
  }> {
  let pointsOfSale: PointOfSale[] = [];
  let pointOfSaleRevisions: PointOfSaleRevision[] = [];
  let updatedPointsOfSale: UpdatedPointOfSale[] = [];

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER].includes(u.type));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < sellers.length; i += 1) {
    const pos = definePointsOfSale(
      pointsOfSale.length,
      6,
      sellers[i],
    );
    let rev: PointOfSaleRevision[] = [];
    let upd: UpdatedPointOfSale[] = [];
    for (let o = 0; o < pos.length / 2; o += 1) {
      pos[o].currentRevision = (pos[o].id % 3) + 1;
      rev = rev.concat(definePointOfSaleRevisions(
        pointOfSaleRevisions.length,
        pos[o].currentRevision,
        pos[o].currentRevision - 1,
        pos[o],
        containerRevisions,
      ));
    }
    for (let o = pos.length / 2; o < pos.length; o += 1) {
      const currentRevision = (pos[o].id % 3);
      if (currentRevision > 1) {
        pos[o].currentRevision = currentRevision;
        rev = rev.concat(definePointOfSaleRevisions(
          pointOfSaleRevisions.length,
          pos[o].currentRevision,
          currentRevision,
          pos[o],
          containerRevisions,
        ));
      }
      upd = upd.concat(defineUpdatedPointOfSale(
        updatedPointsOfSale.length,
        currentRevision,
        pos[o],
        containers,
      ));
    }

    // Revisions can only be saved AFTER the containers themselves.
    promises.push(PointOfSale.save(pos).then(() => PointOfSaleRevision.save(rev))
      .then(() => UpdatedPointOfSale.save(upd)));

    pointsOfSale = pointsOfSale.concat(pos);
    pointOfSaleRevisions = pointOfSaleRevisions.concat(rev);
    updatedPointsOfSale = updatedPointsOfSale.concat(upd);
  }
  await Promise.all(promises);

  return { pointsOfSale, pointOfSaleRevisions, updatedPointsOfSale };
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
 * @param createdAt - Date of transaction creation
 */
export function defineTransactions(
  start: number,
  startSubTransaction: number,
  startRow: number,
  count: number,
  pointOfSale: PointOfSaleRevision,
  from: User,
  createdBy: User,
  createdAt?: Date,
): Transaction[] {
  const transactions: Transaction[] = [];
  let subTransactionId = startSubTransaction;
  let rowId = startRow;

  for (let nr = 1; nr <= count; nr += 1) {
    const transaction = Object.assign(new Transaction(), {
      id: start + nr,
      createdAt,
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
          createdAt,
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
              createdAt,
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
 * @param beginDate - The lower bound for the range of transaction creation dates
 * @param endDate - The upper bound for the range of transaction creation dates
 * @param nrMultiplier - Multiplier for the number of transactions to create
 */
export async function seedTransactions(
  users: User[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  beginDate?: Date,
  endDate?: Date,
  nrMultiplier: number = 1,
): Promise<{
    transactions: Transaction[],
  }> {
  let transactions: Transaction[] = [];
  let startSubTransaction = 0;
  let startRow = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totalTransactions = pointOfSaleRevisions.length * Math.round(2 * nrMultiplier);
  let diff: number;
  if (beginDate && endDate) {
    diff = endDate.getTime() - beginDate.getTime();
  }

  const promises: Promise<any>[] = [];
  for (let i = 0; i < pointOfSaleRevisions.length; i += 1) {
    const pos = pointOfSaleRevisions[i];

    const from = users[(i + pos.pointOfSale.id * 5 + pos.revision * 7) % users.length];
    const createdBy = (i + pos.revision) % 3 !== 0
      ? from
      : users[(i * 5 + pos.pointOfSale.id * 7 + pos.revision) % users.length];
    let createdAt: Date;
    if (diff) createdAt = new Date(beginDate.getTime() + Math.round(Math.random() * diff));
    const trans = defineTransactions(
      transactions.length,
      startSubTransaction,
      startRow,
      Math.round(2 * nrMultiplier),
      pos,
      from,
      createdBy,
      createdAt,
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

/**
 * Create mock stripe deposits objects. Note that the stripe IDs are fake, so you cannot use
 * these entries to make actual API calls to Stripe.
 * @param users
 */
// TODO: Increase speed with correct awaits/then/Promise.all()
export async function seedStripeDeposits(users: User[]): Promise<StripeDeposit[]> {
  const stripeDeposits: StripeDeposit[] = [];

  const totalNrOfStatuses = 3;

  for (let i = 0; i < users.length * totalNrOfStatuses + 1; i += 1) {
    const newDeposit = Object.assign(new StripeDeposit(), {
      stripeId: `FakeStripeIDDoNotUsePleaseThankYou_${i + 1}`,
      to: users[Math.floor(i / 4)],
      amount: DineroTransformer.Instance.from(3900),
      depositStatus: [],
    });
    // eslint-disable-next-line no-await-in-loop
    await newDeposit.save();

    const succeeded = Math.floor(((i % 8) + 1) / 4) !== 1;
    const states = [StripeDepositState.CREATED, StripeDepositState.PROCESSING,
      succeeded ? StripeDepositState.SUCCEEDED : StripeDepositState.FAILED].slice(0, i % 4);

    const statePromises: Promise<any>[] = [];
    states.forEach((state) => {
      const newState = Object.assign(new StripeDepositStatus(), {
        state,
        deposit: newDeposit,
      });
      statePromises.push(newState.save());
      newDeposit.depositStatus.push(newState);
    });

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(statePromises);
    stripeDeposits.push(newDeposit);
  }

  return stripeDeposits;
}

export async function seedPayoutRequests(users: User[]): Promise<PayoutRequest[]> {
  const payoutRequests: Promise<PayoutRequest>[] = [];

  const admins = users.filter((u) => u.type === UserType.LOCAL_ADMIN);
  admins.push(undefined);

  const totalNrOfStatuses = 3;
  let finalState = 0;

  for (let i = 0; i < users.length * 3; i += 1) {
    const requestedBy = users[Math.floor(i / totalNrOfStatuses)];
    const newPayoutReq = Object.assign(new PayoutRequest(), {
      requestedBy,
      amount: DineroTransformer.Instance.from(3900),
      bankAccountNumber: 'NL69GEWI0420042069',
      bankAccountName: `${requestedBy.firstName} ${requestedBy.lastName}`,
    });

    const option = Math.floor(finalState % 3);
    let lastOption;
    switch (option) {
      case 0: lastOption = PayoutRequestState.APPROVED; break;
      case 1: lastOption = PayoutRequestState.DENIED; break;
      default: lastOption = PayoutRequestState.CANCELLED; break;
    }
    const states = [PayoutRequestState.CREATED, lastOption].slice(0, i % totalNrOfStatuses);
    if (states.length === 2) finalState += 1;

    const statusses: PayoutRequestStatus[] = [];
    states.forEach((state, index) => {
      statusses.push(Object.assign(new PayoutRequestStatus(), {
        state,
        createdAt: new Date((new Date()).getTime() + 1000 * 60 * index),
        updatedAt: new Date((new Date()).getTime() + 1000 * 60 * index),
      }));
      if (state === PayoutRequestState.APPROVED) {
        newPayoutReq.approvedBy = admins[i % admins.length];
      }
    });

    payoutRequests.push(newPayoutReq.save().then(async (payoutRequest) => {
      await Promise.all(statusses.map((s) => {
        // eslint-disable-next-line no-param-reassign
        s.payoutRequest = payoutRequest;
        return s.save();
      }));
      // eslint-disable-next-line no-param-reassign
      payoutRequest.payoutRequestStatus = statusses;
      return payoutRequest;
    }));
  }

  return Promise.all(payoutRequests);
}

export async function seedTransfers(users: User[]) : Promise<Transfer[]> {
  const transfers: Transfer[] = [];
  const promises: Promise<any>[] = [];

  for (let i = 0; i < users.length; i += 1) {
    let newTransfer = Object.assign(new Transfer(), {
      description: '',
      amount: dinero({ amount: 100 * (i + 1) }),
      from: undefined,
      to: users[i],
    });
    transfers.push(newTransfer);
    promises.push(Transfer.save(newTransfer));

    newTransfer = Object.assign(new Transfer(), {
      description: '',
      amount: dinero({ amount: 50 * (i + 1) }),
      from: users[i],
      to: undefined,
    });
    transfers.push(newTransfer);
    promises.push(Transfer.save(newTransfer));
  }

  await Promise.all(promises);

  return transfers;
}

/**
 * Create a BannerImage object. When not in a testing environment, a banner image
 * will also be saved on disk.
 *
 * @param banner
 * @param createdBy
 */
function defineBannerImage(banner: Banner, createdBy: User): BannerImage {
  const downloadName = `banner-${banner.id}.png`;

  let location;
  if (process.env.NODE_ENV !== 'test') {
    const source = path.join(__dirname, './static/banner.png');
    location = path.join(__dirname, '../', BANNER_IMAGE_LOCATION, downloadName);
    fs.copyFileSync(source, location);
  } else {
    location = `fake/storage/${downloadName}`;
  }

  return Object.assign(new BannerImage(), {
    id: banner.id,
    location,
    downloadName,
    createdBy,
  });
}

/**
 * Seeds a default dataset of banners based on the given users.
 * When not in a testing environment, actual images will also be saved to disk.
 * @param users
 */
export async function seedBanners(users: User[]): Promise<{
  banners: Banner[],
  bannerImages: BannerImage[],
}> {
  const banners: Banner[] = [];
  const bannerImages: BannerImage[] = [];

  const creators = users.filter((u) => [UserType.LOCAL_ADMIN].includes(u.type));

  for (let i = 0; i < creators.length * 4; i += 1) {
    const banner = Object.assign(new Banner(), {
      id: i + 1,
      name: `Banner-${i + 1}`,
      duration: Math.floor(Math.random() * (300 - 60) + 60),
      active: i % 2 === 0,
      startDate: new Date(),
      endDate: new Date(),
    });

    if (i % 4 !== 0) {
      banner.image = defineBannerImage(banner, creators[i % creators.length]);
      bannerImages.push(banner.image);
    }

    banners.push(banner);
  }

  await Promise.all(bannerImages.map((image) => BannerImage.save(image)));
  await Promise.all(banners.map((banner) => Banner.save(banner)));

  return { banners, bannerImages };
}

export interface DatabaseContent {
  users: User[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  products: Product[],
  productRevisions: ProductRevision[],
  updatedProducts: UpdatedProduct[],
  containers: Container[],
  containerRevisions: ContainerRevision[],
  updatedContainers: UpdatedContainer[],
  pointsOfSale: PointOfSale[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  updatedPointsOfSale: UpdatedPointOfSale[],
  transactions: Transaction[],
  transfers: Transfer[],
  payoutRequests: PayoutRequest[],
  invoices: Invoice[],
  banners: Banner[],
  gewisUsers: GewisUser[],
  pinUsers: PinAuthenticator[],
}

export default async function seedDatabase(): Promise<DatabaseContent> {
  const users = await seedUsers();
  const pinUsers = await seedPinAuthenticators(users);
  const gewisUsers = await seedGEWISUsers(users);
  const categories = await seedProductCategories();
  const vatGroups = await seedVatGroups();
  const {
    products, productRevisions, updatedProducts,
  } = await seedAllProducts(users, categories, vatGroups);
  const { containers, containerRevisions, updatedContainers } = await seedAllContainers(
    users, productRevisions, products,
  );
  const { pointsOfSale, pointOfSaleRevisions, updatedPointsOfSale } = await seedAllPointsOfSale(
    users, containerRevisions, containers,
  );
  const { transactions } = await seedTransactions(users, pointOfSaleRevisions);
  const transfers = await seedTransfers(users);
  const payoutRequests = await seedPayoutRequests(users);
  const invoices = await seedInvoices(users, transactions);
  const { banners } = await seedBanners(users);

  return {
    users,
    categories,
    vatGroups,
    products,
    productRevisions,
    updatedProducts,
    containers,
    containerRevisions,
    updatedContainers,
    pointsOfSale,
    pointOfSaleRevisions,
    updatedPointsOfSale,
    transactions,
    invoices,
    transfers,
    payoutRequests,
    banners,
    gewisUsers,
    pinUsers,
  };
}
