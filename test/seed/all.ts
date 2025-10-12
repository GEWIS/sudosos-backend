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
 *
 *  @license
 */

import User, { UserType } from '../../src/entity/user/user';
import Role from '../../src/entity/rbac/role';
import AssignedRole from '../../src/entity/rbac/assigned-role';
import ProductCategory from '../../src/entity/product/product-category';
import VatGroup from '../../src/entity/vat-group';
import Product from '../../src/entity/product/product';
import ProductRevision from '../../src/entity/product/product-revision';
import Event from '../../src/entity/event/event';
import EventShift from '../../src/entity/event/event-shift';
import EventShiftAnswer from '../../src/entity/event/event-shift-answer';
import Container from '../../src/entity/container/container';
import ContainerRevision from '../../src/entity/container/container-revision';
import PointOfSale from '../../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';
import Transaction from '../../src/entity/transactions/transaction';
import Transfer from '../../src/entity/transactions/transfer';
import Fine from '../../src/entity/fine/fine';
import UserFineGroup from '../../src/entity/fine/userFineGroup';
import PayoutRequest from '../../src/entity/transactions/payout/payout-request';
import StripeDeposit from '../../src/entity/stripe/stripe-deposit';
import Invoice from '../../src/entity/invoices/invoice';
import Banner from '../../src/entity/banner';
import GewisUser from '../../src/gewis/entity/gewis-user';
import PinAuthenticator from '../../src/entity/authenticator/pin-authenticator';
import LocalAuthenticator from '../../src/entity/authenticator/local-authenticator';
import WriteOff from '../../src/entity/transactions/write-off';
import {
  ContainerSeeder, DepositSeeder, EventSeeder, FineSeeder, InvoiceSeeder, PayoutRequestSeeder,
  PointOfSaleSeeder,
  ProductCategorySeeder,
  ProductSeeder, TransactionSeeder, TransferSeeder,
  UserSeeder,
  VatGroupSeeder, WriteOffSeeder,
} from './index';
import seedGEWISUsers from '../../src/gewis/database/seed';
import BannerSeeder from './banner-seeder';
import QRAuthenticatorSeeder from './qr-authenticator-seeder';
import QRAuthenticator from '../../src/entity/authenticator/qr-authenticator';

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
  qrAuthenticators: QRAuthenticator[],
}

export default async function seedDatabase(beginDate?: Date, endDate?: Date): Promise<DatabaseContent> {
  const users = await new UserSeeder().seed();
  await new UserSeeder().seedMemberAuthenticators(
    users.filter((u) => u.type !== UserType.ORGAN),
    [users.filter((u) => u.type === UserType.ORGAN)[0]],
  );
  const pinUsers = await new UserSeeder().seedHashAuthenticator(users, PinAuthenticator);
  const localUsers = await new UserSeeder().seedHashAuthenticator(users, LocalAuthenticator);
  const gewisUsers = await seedGEWISUsers(users);
  const categories = await new ProductCategorySeeder().seed();
  const vatGroups = await new VatGroupSeeder().seed();
  const {
    products, productRevisions,
  } = await new ProductSeeder().seed(users, categories, vatGroups);
  const { containers, containerRevisions } = await new ContainerSeeder().seed(
    users, productRevisions,
  );
  const { pointsOfSale, pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(
    users, containerRevisions,
  );
  const { roles, roleAssignments, events, eventShifts, eventShiftAnswers } = await new EventSeeder().seed(users);
  const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions, beginDate, endDate);
  const transfers = await new TransferSeeder().seed(users, beginDate, endDate);
  const { fines, fineTransfers, userFineGroups } = await new FineSeeder().seed(users, transactions, transfers);
  const { payoutRequests, payoutRequestTransfers } = await new PayoutRequestSeeder().seed(users);
  const { invoices, invoiceTransfers } = await new InvoiceSeeder().seed(users, transactions);
  const { stripeDeposits, stripeDepositTransfers } = await new DepositSeeder().seed(users);
  const writeOffs = await new WriteOffSeeder().seed();
  const { banners } = await new BannerSeeder().seed(users);
  const qrAuthenticators = await new QRAuthenticatorSeeder().seed(users);

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
    qrAuthenticators,
  };
}
