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

/**
 * This is the module page of the database.
 *
 * @module internal/database
 */

import {
  DataSource,
} from 'typeorm';
import fs from 'fs';
import User from '../entity/user/user';
import Product from '../entity/product/product';
import SubTransaction from '../entity/transactions/sub-transaction';
import Transaction from '../entity/transactions/transaction';
import ProductCategory from '../entity/product/product-category';
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import Container from '../entity/container/container';
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
import Invoice from '../entity/invoices/invoice';
import InvoiceStatus from '../entity/invoices/invoice-status';
import BaseFile from '../entity/file/base-file';
import ProductImage from '../entity/file/product-image';
import BannerImage from '../entity/file/banner-image';
import StripeDeposit from '../entity/stripe/stripe-deposit';
import StripePaymentIntentStatus from '../entity/stripe/stripe-payment-intent-status';
import PayoutRequest from '../entity/transactions/payout/payout-request';
import PayoutRequestStatus from '../entity/transactions/payout/payout-request-status';
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
import dotenv from 'dotenv';
import PayoutRequestPdf from '../entity/file/payout-request-pdf';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import RoleUserType from '../entity/rbac/role-user-type';
import WriteOff from '../entity/transactions/write-off';
import ServerSetting from '../entity/server-setting';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import SellerPayoutPdf from '../entity/file/seller-payout-pdf';
import { InitialSQLMigration1743601882766 } from '../migrations/1743601882766-initial-database';
import WriteOffPdf from '../entity/file/write-off-pdf';
import QRAuthenticator from '../entity/authenticator/qr-authenticator';
import { QrAuthenticator1743601882766 } from '../migrations/1743601882766-qr-authenticator';

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
  ...(process.env.TYPEORM_SSL_ENABLED === 'true' ? {
    ssl: {
      ca: fs.readFileSync(process.env.TYPEORM_SSL_CACERTS),
    },
  } : {}),
  synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  logging: process.env.TYPEORM_LOGGING === 'true',
  migrations: [
    InitialSQLMigration1743601882766,
    QrAuthenticator1743601882766,
  ],
  extra: {
    authPlugins: {
      mysql_clear_password: () => () => Buffer.from(`${process.env.TYPEORM_PASSWORD}\0`),
    },
  },
  poolSize: 4,
  entities: [
    ServerSetting,
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
    StripePaymentIntent,
    StripePaymentIntentStatus,
    PayoutRequest,
    PayoutRequestPdf,
    PayoutRequestStatus,
    SellerPayout,
    SellerPayoutPdf,
    Fine,
    FineHandoutEvent,
    UserFineGroup,
    Transaction,
    SubTransaction,
    SubTransactionRow,
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
    WriteOff,
    WriteOffPdf,
    QRAuthenticator,
  ],
  subscribers: [
    TransactionSubscriber,
    TransferSubscriber,
  ],
};

export let AppDataSource = new DataSource(options);

const Database = {
  initialize: async () => {
    if (AppDataSource.isInitialized) return AppDataSource;
    return AppDataSource.initialize();
  },
};

export default Database;

