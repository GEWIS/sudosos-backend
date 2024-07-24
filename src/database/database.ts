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

import {
  createConnection, DataSource, getConnectionManager,
} from 'typeorm';
import User from '../entity/user/user';
import Product from '../entity/product/product';
import SubTransaction from '../entity/transactions/sub-transaction';
import Transaction from '../entity/transactions/transaction';
import ProductCategory from '../entity/product/product-category';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import Container from '../entity/container/container';
import FlaggedTransaction from '../entity/transactions/flagged-transaction';
import VoucherGroup from '../entity/user/voucher-group';
import LocalUser from '../entity/user/local-user';
import GewisUser from '../gewis/entity/gewis-user';
import UserVoucherGroup from '../entity/user/user-voucher-group';
import EanAuthenticator from '../entity/authenticator/ean-authenticator';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import NfcAuthenticator from '../entity/authenticator/nfc-authenticator';
import PinAuthenticator from '../entity/authenticator/pin-authenticator';
import Banner from '../entity/banner';
import Transfer from '../entity/transactions/transfer';
import ProductRevision from '../entity/product/product-revision';
import ContainerRevision from '../entity/container/container-revision';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import ProductOrdering from '../entity/point-of-sale/product-ordering';
import Balance from '../entity/transactions/balance';
import InvoiceUser from '../entity/user/invoice-user';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import Invoice from '../entity/invoices/invoice';
import InvoiceStatus from '../entity/invoices/invoice-status';
import BaseFile from '../entity/file/base-file';
import ProductImage from '../entity/file/product-image';
import BannerImage from '../entity/file/banner-image';
import StripeDeposit from '../entity/deposit/stripe-deposit';
import StripeDepositStatus from '../entity/deposit/stripe-deposit-status';
import PayoutRequest from '../entity/transactions/payout-request';
import PayoutRequestStatus from '../entity/transactions/payout-request-status';
import LDAPAuthenticator from '../entity/authenticator/ldap-authenticator';
import AssignedRole from '../entity/rbac/assigned-role';
import VatGroup from '../entity/vat-group';
import LocalAuthenticator from '../entity/authenticator/local-authenticator';
import ResetToken from '../entity/authenticator/reset-token';
import { DataSourceOptions } from 'typeorm/data-source/DataSourceOptions';
import KeyAuthenticator from '../entity/authenticator/key-authenticator';
import Fine from '../entity/fine/fine';
import FineHandoutEvent from '../entity/fine/fineHandoutEvent';
import UserFineGroup from '../entity/fine/userFineGroup';
import Event from '../entity/event/event';
import EventShiftAnswer from '../entity/event/event-shift-answer';
import EventShift from '../entity/event/event-shift';
import { TransactionSubscriber, TransferSubscriber } from '../subscriber';
import InvoicePdf from '../entity/file/invoice-pdf';
import { InvoiceRefactor1707251162194 } from '../migrations/1707251162194-invoice-refactor';
import dotenv from 'dotenv';
import { PERSISTENT_TEST_DATABASES } from '../helpers/database';
import PayoutRequestPdf from '../entity/file/payout-request-pdf';
import { PayoutRequestPdf1720610649657 } from '../migrations/1720610649657-payout-request-pdf';
import { SoftDeletes1720608140757 } from '../migrations/1720608140757-soft-deletes';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import { DatabaseRbac1720624912620 } from '../migrations/1720624912260-database-rbac';
import RoleUserType from '../entity/rbac/role-user-type';

// We need to load the dotenv to prevent the env from being undefined.
dotenv.config();

if (process.env.NODE_ENV === 'test') {
  console.log('TYPEORM_CONNECTION:', process.env.TYPEORM_CONNECTION);
}

const options: DataSourceOptions = {
  host: process.env.TYPEORM_HOST,
  port: parseInt(process.env.TYPEORM_PORT || '3001'),
  database: process.env.TYPEORM_DATABASE,
  type: process.env.TYPEORM_CONNECTION as 'postgres' | 'mariadb' | 'mysql',
  username: process.env.TYPEORM_USERNAME,
  password: process.env.TYPEORM_PASSWORD,
  synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  logging: process.env.TYPEORM_LOGGING === 'true',
  migrations: [
    InvoiceRefactor1707251162194,
    SoftDeletes1720608140757,
    PayoutRequestPdf1720610649657,
    DatabaseRbac1720624912620,
  ],
  extra: {
    authPlugins: {
      mysql_clear_password: () => () => Buffer.from(`${process.env.TYPEORM_PASSWORD}\0`),
    },
  },
  poolSize: 4,
  entities: [
    ProductCategory,
    VatGroup,
    Product,
    ProductRevision,
    Container,
    ContainerRevision,
    PointOfSale,
    PointOfSaleRevision,
    Transfer,
    StripeDeposit,
    StripeDepositStatus,
    PayoutRequest,
    PayoutRequestPdf,
    PayoutRequestStatus,
    Fine,
    FineHandoutEvent,
    UserFineGroup,
    Transaction,
    SubTransaction,
    SubTransactionRow,
    FlaggedTransaction,
    VoucherGroup,
    User,
    LocalUser,
    GewisUser,
    UserVoucherGroup,
    EanAuthenticator,
    MemberAuthenticator,
    NfcAuthenticator,
    KeyAuthenticator,
    PinAuthenticator,
    LocalAuthenticator,
    LDAPAuthenticator,
    Banner,
    ProductOrdering,
    Balance,
    InvoiceUser,
    InvoiceEntry,
    Invoice,
    InvoiceStatus,
    InvoicePdf,
    BaseFile,
    ProductImage,
    BannerImage,
    Role,
    RoleUserType,
    Permission,
    AssignedRole,
    ResetToken,
    Event,
    EventShift,
    EventShiftAnswer,
  ],
  subscribers: [
    TransactionSubscriber,
    TransferSubscriber,
  ],
};

export const AppDataSource = new DataSource(options);

function getDefaultConnection(connections: DataSource[]): DataSource | undefined {
  const defaultConnection = connections.find((c) => c.name === 'default');
  if (defaultConnection) {
    if (defaultConnection.isInitialized) return defaultConnection;
    else throw new Error('Default connection was closed or not initialized.');
  }
  return undefined;
}

// TODO: Migrate this to DataSource
const Database = {
  // This code was restructured such that we could perform a test suite on a persistent mysql/mariadb database.
  // In dev and production environment, nothing special happens and we simply return a new default connection.
  initialize: async () => {
    const connections = getConnectionManager().connections;

    const isPersist = PERSISTENT_TEST_DATABASES.has(process.env.TYPEORM_CONNECTION);

    // This means we are in a development or production environment, so we simply initialize the database.
    if (isPersist && process.env.NODE_ENV !== 'test') {
      return Promise.resolve(createConnection(options));
    }

    // If we are in a test environment we have the following cases.
    if (isPersist && process.env.NODE_ENV === 'test') {

      // We return the default connection if it exists
      const defConnection = getDefaultConnection(connections);
      if (defConnection) return defConnection;
      else return Promise.resolve(createConnection(options));

    } else if (process.env.TYPEORM_CONNECTION === 'sqlite') {
      // And for sqlite we always just create a new connection.
      return Promise.resolve(createConnection(options));
    } else {
      throw new Error(`Unsupported connection type ${process.env.TYPEORM_CONNECTION}`);
    }
  },
};
export default Database;

