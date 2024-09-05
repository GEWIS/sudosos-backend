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

import dinero from 'dinero.js';
import { addDays } from 'date-fns';
import * as fs from 'fs';
import path from 'path';
import Container from '../src/entity/container/container';
import ContainerRevision from '../src/entity/container/container-revision';
import PointOfSale from '../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../src/entity/point-of-sale/point-of-sale-revision';
import Product from '../src/entity/product/product';
import ProductCategory from '../src/entity/product/product-category';
import ProductRevision from '../src/entity/product/product-revision';
import Transaction from '../src/entity/transactions/transaction';
import User, { UserType } from '../src/entity/user/user';
import Transfer from '../src/entity/transactions/transfer';
import Banner from '../src/entity/banner';
import BannerImage from '../src/entity/file/banner-image';
import { BANNER_IMAGE_LOCATION } from '../src/files/storage';
import StripeDeposit from '../src/entity/stripe/stripe-deposit';
import PayoutRequest from '../src/entity/transactions/payout/payout-request';
import Invoice from '../src/entity/invoices/invoice';
import InvoiceEntry from '../src/entity/invoices/invoice-entry';
import InvoiceStatus, { InvoiceState } from '../src/entity/invoices/invoice-status';
import Event from '../src/entity/event/event';
import EventShift from '../src/entity/event/event-shift';
import EventShiftAnswer from '../src/entity/event/event-shift-answer';
import seedGEWISUsers from '../src/gewis/database/seed';
import PinAuthenticator from '../src/entity/authenticator/pin-authenticator';
import VatGroup from '../src/entity/vat-group';
import LocalAuthenticator from '../src/entity/authenticator/local-authenticator';
import UserFineGroup from '../src/entity/fine/userFineGroup';
import Fine from '../src/entity/fine/fine';
import GewisUser from '../src/gewis/entity/gewis-user';
import AssignedRole from '../src/entity/rbac/assigned-role';
import Role from '../src/entity/rbac/role';
import WriteOff from '../src/entity/transactions/write-off';
import {
  ContainerSeeder, DepositSeeder, EventSeeder, FineSeeder, PayoutRequestSeeder,
  PointOfSaleSeeder,
  ProductCategorySeeder,
  ProductSeeder, TransferSeeder,
  UserSeeder,
  VatGroupSeeder, WriteOffSeeder,
} from './seed';
import TransactionSeeder from './seed/ledger/transaction';


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
      amountInclVat: dinero({
        amount: cost,
      }),
      description: `Invoice Transfer for ${cost}`,
    });
    await Transfer.save(transfer);

    const invoice = Object.assign(new Invoice(), {
      id: i + 1,
      to,
      addressee: `Addressed to ${to.firstName}`,
      reference: `BAC-${i}`,
      city: `city-${i}`,
      country: `country-${i}`,
      postalCode: `postalCode-${i}`,
      street: `street-${i}`,
      description: `Invoice #${i}`,
      transfer,
      date: new Date(),
      invoiceEntries,
      invoiceStatus: [],
    });
    transfer.invoice = invoice;

    await Invoice.save(invoice);
    let status = Object.assign(new InvoiceStatus(), {
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

  for (let i = 0; i < invoices.length; i += 1) {
    if (i % 2 === 0) {
      const current = invoices[i].invoiceStatus[0].changedBy.id;
      const status = Object.assign(new InvoiceStatus(), {
        invoice: invoices[i],
        changedBy: current,
        state: InvoiceState.SENT,
        dateChanged: addDays(new Date(2020, 0, 1), 2 - (i * 2)),
      });
      invoices[i].invoiceStatus.push(status);
      await Invoice.save(invoices[i]);
    }
  }


  return { invoices, invoiceTransfers };
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
  roles: Role[],
  roleAssignments: AssignedRole[],
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
  writeOffs: WriteOff[],
}

export default async function seedDatabase(beginDate?: Date, endDate?: Date): Promise<DatabaseContent> {
  const users = await new UserSeeder().seedUsers();
  await new UserSeeder().seedMemberAuthenticators(
    users.filter((u) => u.type !== UserType.ORGAN),
    [users.filter((u) => u.type === UserType.ORGAN)[0]],
  );
  const pinUsers = await new UserSeeder().seedHashAuthenticator(users, PinAuthenticator);
  const localUsers = await new UserSeeder().seedHashAuthenticator(users, LocalAuthenticator);
  const gewisUsers = await seedGEWISUsers(users);
  const categories = await new ProductCategorySeeder().seedProductCategories();
  const vatGroups = await new VatGroupSeeder().seedVatGroups();
  const {
    products, productRevisions,
  } = await new ProductSeeder().seedProducts(users, categories, vatGroups);
  const { containers, containerRevisions } = await new ContainerSeeder().seedContainers(
    users, productRevisions,
  );
  const { pointsOfSale, pointOfSaleRevisions } = await new PointOfSaleSeeder().seedPointsOfSale(
    users, containerRevisions,
  );
  const { roles, roleAssignments, events, eventShifts, eventShiftAnswers } = await new EventSeeder().seedEvents(users);
  const { transactions } = await new TransactionSeeder().seedTransactions(users, pointOfSaleRevisions, beginDate, endDate);
  const transfers = await new TransferSeeder().seedTransfers(users, beginDate, endDate);
  const { fines, fineTransfers, userFineGroups } = await new FineSeeder().seedFines(users, transactions, transfers);
  const { payoutRequests, payoutRequestTransfers } = await new PayoutRequestSeeder().seedPayoutRequests(users);
  const { invoices, invoiceTransfers } = await seedInvoices(users, transactions);
  const { stripeDeposits, stripeDepositTransfers } = await new DepositSeeder().seedStripeDeposits(users);
  const writeOffs = await new WriteOffSeeder().seedWriteOffs();
  const { banners } = await seedBanners(users);

  return {
    users,
    roles,
    roleAssignments,
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
    writeOffs,
  };
}
