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
import StripeDeposit from '../src/entity/stripe/stripe-deposit';
import PayoutRequest from '../src/entity/transactions/payout/payout-request';
import Invoice from '../src/entity/invoices/invoice';
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
  ContainerSeeder, DepositSeeder, EventSeeder, FineSeeder, InvoiceSeeder, PayoutRequestSeeder,
  PointOfSaleSeeder,
  ProductCategorySeeder,
  ProductSeeder, TransactionSeeder, TransferSeeder,
  UserSeeder,
  VatGroupSeeder, WriteOffSeeder,
} from './seed';
import BannerSeeder from './seed/banner';

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
  const { invoices, invoiceTransfers } = await new InvoiceSeeder().seedInvoices(users, transactions);
  const { stripeDeposits, stripeDepositTransfers } = await new DepositSeeder().seedStripeDeposits(users);
  const writeOffs = await new WriteOffSeeder().seedWriteOffs();
  const { banners } = await new BannerSeeder().seedBanners(users);

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
