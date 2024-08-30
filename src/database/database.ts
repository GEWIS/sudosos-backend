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
  createConnection, DataSource,
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
import { InvoiceRefactor1707251162194 } from '../migrations/1707251162194-invoice-refactor';
import dotenv from 'dotenv';
import PayoutRequestPdf from '../entity/file/payout-request-pdf';
import { PayoutRequestPdf1720610649657 } from '../migrations/1720610649657-payout-request-pdf';
import { SoftDeletes1720608140757 } from '../migrations/1720608140757-soft-deletes';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import { DatabaseRbac1720624912620 } from '../migrations/1720624912260-database-rbac';
import RoleUserType from '../entity/rbac/role-user-type';
import { TransfersVat1721916495084 } from '../migrations/1721916495084-transfers-vat';
import { PosCashiers1722022351000 } from '../migrations/1722022351000-pos-cashiers';
import WriteOff from '../entity/transactions/write-off';
import { WriteOffs1722004753128 } from '../migrations/1722004753128-write-offs';
import ServerSetting from '../entity/server-setting';
import { ServerSettings1722083254200 } from '../migrations/1722083254200-server-settings';
import { PosUsers1722084520361 } from '../migrations/1722084520361-pos-users';
import { InvoiceRework1622118077157 } from '../migrations/1722118077157-invoice-rework';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import { StripePaymentIntents1722869409448 } from '../migrations/1722869409448-stripe-payment-intents';
import { NestedProductCategories1722517212441 } from '../migrations/1722517212441-nested-product-categories';
import SellerPayout from '../entity/transactions/payout/seller-payout';
import { InvoiceAsTopups1724506999318 } from '../migrations/1724506999318-invoice-as-topups';
import { SellerPayouts1724855153990 } from '../migrations/1724855153990-seller-payouts';
import SellerPayoutPdf from '../entity/file/seller-payout-pdf';
import { UserTypeEnums1725196803203 } from '../migrations/1725196803203-user-type-enums';

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
    TransfersVat1721916495084,
    PosCashiers1722022351000,
    ServerSettings1722083254200,
    PosUsers1722084520361,
    WriteOffs1722004753128,
    InvoiceRework1622118077157,
    StripePaymentIntents1722869409448,
    NestedProductCategories1722517212441,
    InvoiceAsTopups1724506999318,
    SellerPayouts1724855153990,
    UserTypeEnums1725196803203,
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
  ],
  subscribers: [
    TransactionSubscriber,
    TransferSubscriber,
  ],
};

export let AppDataSource = new DataSource(options);

const Database = {
  initialize: async () => {
    if (AppDataSource && AppDataSource.isInitialized) return AppDataSource;
    AppDataSource = await createConnection(options);
    return AppDataSource;
  },
};
export default Database;

