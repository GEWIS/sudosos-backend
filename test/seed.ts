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
import User, { TermsOfServiceStatus, UserType } from '../src/entity/user/user';
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
import Event, { EventType } from '../src/entity/event/event';
import EventShift from '../src/entity/event/event-shift';
import EventShiftAnswer, { Availability } from '../src/entity/event/event-shift-answer';
import seedGEWISUsers from '../src/gewis/database/seed';
import PinAuthenticator from '../src/entity/authenticator/pin-authenticator';
import VatGroup from '../src/entity/vat-group';
import { VatGroupRequest } from '../src/controller/request/vat-group-request';
import HashBasedAuthenticationMethod from '../src/entity/authenticator/hash-based-authentication-method';
import LocalAuthenticator from '../src/entity/authenticator/local-authenticator';
import UserFineGroup from '../src/entity/fine/userFineGroup';
import FineHandoutEvent from '../src/entity/fine/fineHandoutEvent';
import Fine from '../src/entity/fine/fine';
import { calculateBalance } from './helpers/balance';
import GewisUser from '../src/gewis/entity/gewis-user';
import AssignedRole from '../src/entity/roles/assigned-role';
import MemberAuthenticator from '../src/entity/authenticator/member-authenticator';

function getDate(startDate: Date, endDate: Date, i: number): Date {
  const diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) throw new Error('startDate should be before endDate');

  return new Date(startDate.getTime() + (startDate.getTime() * i ) % diff);
}

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
      nickname: nr % 4 === 0 ? `Nickname${start + nr}` : null,
      type,
      active,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    }) as User);
  }
  return users;
}

const BCRYPT_ROUNDS = 12;
async function hashPassword(password: string, callback: (encrypted: string) => any) {
  return bcrypt.hash(password, BCRYPT_ROUNDS).then(callback);
}

/**
 * Seeds a default set of pass users and stores them in the database.
 */
export async function seedHashAuthenticator<T extends HashBasedAuthenticationMethod>(users: User[],
  Type: { new(): T, save: (t: T) => Promise<T> }, count = 10): Promise<T[]> {
  const authUsers: T[] = [];

  const promises: Promise<any>[] = [];
  const toMap: User[] = count >= users.length ? users : users.slice(count);
  await Promise.all(toMap.map((user) => hashPassword(user.id.toString(), (encrypted: any) => {
    const authUser = Object.assign(new Type(), {
      user,
      hash: encrypted,
    });
    promises.push(Type.save(authUser).then((u) => authUsers.push(u)));
  })));

  await Promise.all(promises);
  return authUsers;
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

/**
 * Seed some roles, where every user has at most one role.
 * @param users
 */
export async function seedRoles(users: User[]): Promise<AssignedRole[]> {
  const roleStrings = ['BAC', 'BAC feut', 'BAC PM', 'Bestuur', 'Kasco'];
  return (await Promise.all(users.map(async (user, i) => {
    if (i % 3 === 0) return undefined;

    const role = Object.assign(new AssignedRole(), {
      user,
      role: roleStrings[i % 5],
    });
    return AssignedRole.save(role);
  }))).filter((r) => r != null);
}

/**
 * Seed some member authenticators
 * @param users Users that can authenticate as organs
 * @param authenticateAs
 */
export async function seedMemberAuthenticators(users: User[], authenticateAs: User[]): Promise<MemberAuthenticator[]> {
  const memberAuthenticators: MemberAuthenticator[] = [];
  await Promise.all(authenticateAs.map(async (as, i) => {
    return Promise.all(users.map(async (user, j) => {
      if ((i + j) % 7 > 1) return;
      const authenticator = Object.assign(new MemberAuthenticator(), {
        userId: user.id,
        authenticateAsId: as.id,
      } as MemberAuthenticator);
      await authenticator.save();
      memberAuthenticators.push(authenticator);
    }));
  }));
  return memberAuthenticators;
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

export async function seedInvoices(users: User[], transactions: Transaction[]): Promise<{
  invoices: Invoice[],
  invoiceTransfers: Transfer[],
}> {
  let invoices: Invoice[] = [];

  const invoiceUsers = users.filter((u) => u.type === UserType.INVOICE);
  let invoiceTransfers: Transfer[] = [];
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
    await Transfer.save(transfer);

    const invoice = Object.assign(new Invoice(), {
      id: i + 1,
      to,
      addressee: `Addressed to ${to.firstName}`,
      description: `Invoice #${i}`,
      transfer,
      invoiceEntries,
      invoiceStatus: [],
    });
    transfer.invoice = invoice;

    const status = Object.assign(new InvoiceStatus(), {
      id: i + 1,
      invoice,
      changedBy: users[i],
      state: InvoiceState.CREATED,
      dateChanged: addDays(new Date(2020, 0, 1), 2 - (i * 2)),
    });
    invoice.invoiceStatus.push(status);
    invoices = invoices.concat(invoice);
    invoiceTransfers = invoiceTransfers.concat(transfer);
  }

  await Invoice.save(invoices);
  await InvoiceEntry.save(invoiceEntry);

  return { invoices, invoiceTransfers };
}

/**
 * Seeds a default dataset of borrelSchemaShifts and stores them in the database
 */
export async function seedEventShifts() {
  const shifts: EventShift[] = [];
  shifts.push(Object.assign(new EventShift(), {
    name: 'Borrelen',
    roles: ['BAC', 'BAC feut'],
  }));
  shifts.push(Object.assign(new EventShift(), {
    name: 'Portier',
    roles: ['BAC', 'BAC feut'],
  }));
  shifts.push(Object.assign(new EventShift(), {
    name: 'Bier halen voor Job en Sjoerd',
    roles: ['BAC feut'],
  }));
  shifts.push(Object.assign(new EventShift(), {
    name: 'Roy slaan',
    roles: [],
  }));
  shifts.push(Object.assign(new EventShift(), {
    name: '900 euro kwijtraken',
    roles: ['BAC PM', 'BAC'],
  }));
  shifts.push(Object.assign(new EventShift(), {
    name: 'Wassen',
    roles: ['Bestuur'],
    deletedAt: new Date(),
  }));
  await EventShift.save(shifts);
  return shifts;
}

export async function createEventShiftAnswer(user: User, event: Event, shift: EventShift, type: number) {
  const availabilities = [Availability.YES, Availability.MAYBE, Availability.NO, Availability.LATER, Availability.NA, null];

  const answer: EventShiftAnswer = Object.assign(new EventShiftAnswer(), {
    user,
    availability: availabilities[type + 1 % availabilities.length],
    selected: false,
    eventId: event.id,
    shiftId: shift.id,
  });
  return EventShiftAnswer.save(answer);
}

export async function seedEvents(rolesWithUsers: AssignedRole[]) {
  const events: Event[] = [];
  const eventShifts = await seedEventShifts();
  const eventShiftAnswers: EventShiftAnswer[] = [];
  for (let i = 0; i < 5; i += 1) {
    // const startDate = getRandomDate(new Date(), new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365));
    const startDate = new Date(new Date().getTime() + ((i * 1000000) % (3600 * 24 * 365)) * 1000 + 60000);
    // Add 2,5 hours
    const endDate = new Date(startDate.getTime() + (1000 * 60 * 60 * 2.5));

    const event = Object.assign(new Event(), {
      name: `${i}-Testborrel-${i}`,
      createdBy: rolesWithUsers[i].user,
      startDate,
      endDate,
      type: EventType.BORREL,
      shifts: [],
      id: i,
    });
    await Event.save(event);

    const eventShifts1: EventShift[] = [];
    const eventShiftAnswers1: EventShiftAnswer[] = [];
    for (let j = 0; j < ((i + 1) * 243) % 4; j += 1) {
      const shift = eventShifts[((i + j) * 13) % (eventShifts.length)];
      const users = rolesWithUsers.filter((r) => shift.roles.includes(r.role));
      await Promise.all(users.map(async (r, k) => {
        const answer = await createEventShiftAnswer(r.user, event, shift, k);
        answer.event = event;
        answer.shift = shift;
        eventShifts1.push(shift);
        eventShiftAnswers.push(answer);
        eventShiftAnswers1.push(answer);
      }));
    }

    event.shifts = eventShifts1.filter((s, j, all) => j === all.findIndex((s2) => s.id === s2.id));
    await event.save();

    event.answers = eventShiftAnswers1;
    events.push(event);
  }

  return { events, eventShifts, eventShiftAnswers };
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
      6,
      sellers[i],
    );

    let img: ProductImage[] = [];
    for (let o = 0; o < prod.length; o += 1) {
      let image;
      if (o % 2 === 0) {
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
      useAuthentication: (pointOfSale.id + rev) % 2 === 0,
      containers: candidates.filter((c) => c.revision === rev),
      startDate,
      endDate,
    }));
  }
  return revisions;
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

  const sellers = users.filter((u) => [UserType.LOCAL_ADMIN, UserType.MEMBER, UserType.ORGAN].includes(u.type));

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

  const promises: Promise<any>[] = [];
  for (let i = 0; i < pointOfSaleRevisions.length; i += 1) {
    const pos = pointOfSaleRevisions[i];

    const from = users[(i + pos.pointOfSale.id * 5 + pos.revision * 7) % users.length];
    const createdBy = (i + pos.revision) % 3 !== 0
      ? from
      : users[(i * 5 + pos.pointOfSale.id * 7 + pos.revision) % users.length];
    let createdAt: Date;
    if (beginDate && endDate) createdAt = getDate(beginDate, endDate, i);
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
export async function seedStripeDeposits(users: User[]): Promise<{
  stripeDeposits: StripeDeposit[],
  stripeDepositTransfers: Transfer[],
}> {
  const stripeDeposits: StripeDeposit[] = [];
  const transfers: Transfer[] = [];

  const totalNrOfStatuses = 3;

  for (let i = 0; i < users.length * totalNrOfStatuses + 1; i += 1) {
    const to = users[Math.floor(i / 4)];
    const amount = DineroTransformer.Instance.from(3900);
    const newDeposit = Object.assign(new StripeDeposit(), {
      stripeId: `FakeStripeIDDoNotUsePleaseThankYou_${i + 1}`,
      to,
      amount,
      depositStatus: [],
    });
    // eslint-disable-next-line no-await-in-loop
    await newDeposit.save();

    const succeeded = Math.floor(((i % 8) + 1) / 4) !== 1;
    const states = [StripeDepositState.CREATED, StripeDepositState.PROCESSING,
      succeeded ? StripeDepositState.SUCCEEDED : StripeDepositState.FAILED].slice(0, i % 4);

    if (succeeded) {
      const transfer = Object.assign(new Transfer(), {
        from: null,
        to,
        amount,
        description: `Deposit transfer for ${amount}`,
      });
      await transfer.save();
      newDeposit.transfer = transfer;
      await newDeposit.save();
      transfer.deposit = newDeposit;
      transfers.push(transfer);
    }

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

  return {
    stripeDeposits,
    stripeDepositTransfers: transfers,
  };
}

/**
 * Handout fines for all eligible users on the given reference date. Reuse the given user fine groups if
 * @param users
 * @param transactions
 * @param transfers
 * @param userFineGroups
 * @param firstReferenceDate
 */
export async function seedSingleFines(users: User[], transactions: Transaction[], transfers: Transfer[], userFineGroups: UserFineGroup[] = [], firstReferenceDate: Date = new Date()) {
  const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
    .map((t) => t.subTransactions));
  // Get all users that are in debt and should get fined
  const debtors = users.filter((u) =>
    calculateBalance(u, transactions, subTransactions, transfers, firstReferenceDate).amount.getAmount() < 500);

  // Create a map from users to userFineGroups and initialize it with the existing userFineGroups
  const userFineGroupMap = new Map<User, UserFineGroup>();
  userFineGroups.forEach((g) => userFineGroupMap.set(g.user, g));

  let i = 0;

  const fineHandoutEvent = Object.assign(new FineHandoutEvent(), {
    referenceDate: firstReferenceDate,
  } as FineHandoutEvent);
  await fineHandoutEvent.save();

  const fineTransfers: Transfer[] = [];
  const fines = await Promise.all(debtors.map(async (u) => {
    i++;
    if (i % 2 === 0) return;

    let userFineGroup = userFineGroupMap.get(u);
    if (userFineGroup === undefined) {
      userFineGroup = Object.assign(new UserFineGroup(), {
        user: u,
        userId: u.id,
      } as UserFineGroup);
      await userFineGroup.save();
      userFineGroupMap.set(u, userFineGroup);
    }

    // Fine everyone 5 euros
    const amount = dinero({ amount: 500 });
    const transfer = Object.assign(new Transfer(), {
      from: u,
      fromId: u.id,
      amount,
      description: 'Seeded fine',
    } as Transfer);
    const fine = await transfer.save().then(async (t) => {
      const f = Object.assign(new Fine(), {
        fineHandoutEvent,
        userFineGroup,
        transfer: t,
        amount,
      } as Fine);
      return f.save();
    });
    transfer.fine = fine;
    fineTransfers.push(transfer);
    return fine;
  }));

  return {
    fines: fines.filter((f) => f !== undefined),
    fineTransfers,
    fineHandoutEvent,
    userFineGroups: Array.from(userFineGroupMap.values()),
  };
}

/**
 * Add two fineHandoutEvents to the database, one on 2021-01-01 and the other at the current time.
 * @param users
 * @param transactions
 * @param transfers
 * @param addCurrentFines
 */
export async function seedFines(users: User[], transactions: Transaction[], transfers: Transfer[], addCurrentFines = false) {
  // Make a copy of users, so we can update currentFines
  let newUsers = users;

  const {
    fines: fines1,
    fineTransfers: fineTransfers1,
    userFineGroups: userFineGroups1,
    fineHandoutEvent: fineHandoutEvent1,
  } = await seedSingleFines(users, transactions, transfers, [], new Date('2021-01-01'));

  const {
    fines: fines2,
    fineTransfers: fineTransfers2,
    userFineGroups: userFineGroups2,
    fineHandoutEvent: fineHandoutEvent2,
  } = await seedSingleFines(users, transactions, [...transfers, ...fineTransfers1], userFineGroups1);

  // Remove duplicates
  const userFineGroups = [...userFineGroups1, ...userFineGroups2]
    .filter((g, i, groups) => groups.findIndex((g2) => g2.id === g.id) === i);
  const fines = [...fines1, ...fines2];

  // Add also a reference to the fine in the UserFineGroup
  fines.forEach((f) => {
    const i = userFineGroups.findIndex((g) => g.id === f.userFineGroup.id);
    if (userFineGroups[i].fines === undefined) userFineGroups[i].fines = [];
    userFineGroups[i].fines.push(f);
  });

  if (addCurrentFines) {
    newUsers = await Promise.all(users.map(async (user) => {
      const userFineGroup = userFineGroups.find((g) => user.id === g.userId);
      if (userFineGroup) {
        user.currentFines = userFineGroup;
        await user.save();
      }
      return user;
    }));
  }

  return {
    fines,
    fineTransfers: [...fineTransfers1, ...fineTransfers2],
    userFineGroups,
    fineHandoutEvents: [fineHandoutEvent1, fineHandoutEvent2],
    users: newUsers,
  };
}

export async function seedPayoutRequests(users: User[]): Promise<{
  payoutRequests: PayoutRequest[], payoutRequestTransfers: Transfer[],
}> {
  const payoutRequests: Promise<PayoutRequest>[] = [];
  const transfers: Transfer[] = [];

  const admins = users.filter((u) => u.type === UserType.LOCAL_ADMIN);
  admins.push(undefined);

  const totalNrOfStatuses = 3;
  let finalState = 0;

  for (let i = 0; i < users.length * 3; i += 1) {
    const requestedBy = users[Math.floor(i / totalNrOfStatuses)];
    const amount = DineroTransformer.Instance.from(3900);
    const newPayoutReq = Object.assign(new PayoutRequest(), {
      requestedBy,
      amount,
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

    if (i % 5 === 0) {
      const transfer = Object.assign(new Transfer(), {
        from: requestedBy,
        to: null,
        amount,
        description: `Payout request for ${amount}`,
      });
      await transfer.save();
      transfer.payoutRequest = newPayoutReq;
      transfers.push(transfer);
      newPayoutReq.transfer = transfer;
    }

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

  return {
    payoutRequests: await Promise.all(payoutRequests),
    payoutRequestTransfers: transfers,
  };
}

export async function seedTransfers(users: User[],
  startDate?: Date, endDate?: Date) : Promise<Transfer[]> {
  const transfers: Transfer[] = [];
  const promises: Promise<any>[] = [];

  for (let i = 0; i < users.length; i += 1) {
    let date = new Date();
    if (startDate && endDate) {
      date = getDate(startDate, endDate, i);
    }
    let newTransfer = Object.assign(new Transfer(), {
      description: '',
      amount: dinero({ amount: 100 * (i + 1) }),
      from: undefined,
      to: users[i],
      createdAt: date,
    });
    transfers.push(newTransfer);
    promises.push(Transfer.save(newTransfer));

    newTransfer = Object.assign(new Transfer(), {
      description: '',
      amount: dinero({ amount: 50 * (i + 1) }),
      from: users[i],
      to: undefined,
      createdAt: date,
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
  roles: AssignedRole[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  products: Product[],
  productRevisions: ProductRevision[],
  events: Event[],
  eventShifts: EventShift[],
  eventShiftAnswers: EventShiftAnswer[],
  containers: Container[],
  containerRevisions: ContainerRevision[],
  pointsOfSale: PointOfSale[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  transactions: Transaction[],
  transfers: Transfer[],
  fines: Fine[],
  userFineGroups: UserFineGroup[],
  payoutRequests: PayoutRequest[],
  stripeDeposits: StripeDeposit[],
  invoices: Invoice[],
  banners: Banner[],
  gewisUsers: GewisUser[],
  pinUsers: PinAuthenticator[],
  localUsers: LocalAuthenticator[],
}

export default async function seedDatabase(): Promise<DatabaseContent> {
  const users = await seedUsers();
  await seedMemberAuthenticators(
    users.filter((u) => u.type !== UserType.ORGAN),
    [users.filter((u) => u.type === UserType.ORGAN)[0]],
  );
  const pinUsers = await seedHashAuthenticator(users, PinAuthenticator);
  const localUsers = await seedHashAuthenticator(users, LocalAuthenticator);
  const gewisUsers = await seedGEWISUsers(users);
  const categories = await seedProductCategories();
  const vatGroups = await seedVatGroups();
  const {
    products, productRevisions,
  } = await seedProducts(users, categories, vatGroups);
  const { containers, containerRevisions } = await seedContainers(
    users, productRevisions,
  );
  const { pointsOfSale, pointOfSaleRevisions } = await seedPointsOfSale(
    users, containerRevisions,
  );
  const roles = await seedRoles(users);
  const { events, eventShifts, eventShiftAnswers } = await seedEvents(roles);
  const { transactions } = await seedTransactions(users, pointOfSaleRevisions);
  const transfers = await seedTransfers(users);
  const { fines, fineTransfers, userFineGroups } = await seedFines(users, transactions, transfers);
  const { payoutRequests, payoutRequestTransfers } = await seedPayoutRequests(users);
  const { invoices, invoiceTransfers } = await seedInvoices(users, transactions);
  const { stripeDeposits, stripeDepositTransfers } = await seedStripeDeposits(users);
  const { banners } = await seedBanners(users);

  return {
    users,
    roles,
    categories,
    vatGroups,
    products,
    productRevisions,
    containers,
    containerRevisions,
    pointsOfSale,
    pointOfSaleRevisions,
    transactions,
    stripeDeposits,
    invoices,
    transfers: transfers.concat(fineTransfers).concat(payoutRequestTransfers).concat(invoiceTransfers).concat(stripeDepositTransfers),
    fines,
    userFineGroups,
    payoutRequests,
    banners,
    gewisUsers,
    pinUsers,
    localUsers,
    events,
    eventShifts,
    eventShiftAnswers,
  };
}
