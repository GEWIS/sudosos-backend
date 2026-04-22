/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
import MemberUser from '../entity/user/member-user';
import UserVoucherGroup from '../entity/user/user-voucher-group';
import EanAuthenticator from '../entity/authenticator/ean-authenticator';
import OrganMembership from '../entity/organ/organ-membership';
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
import { MemberAuthenticator1761324427011 } from '../migrations/1761324427011-member-authenticator';
import { AddOrganMembershipIndex1761328648026 } from '../migrations/1761328648026-add-organ-membership-index';
import InactiveAdministrativeCost from '../entity/transactions/inactive-administrative-cost';
import {
  UserAdministrativeCost1761845457283,
} from '../migrations/1761845457283-user-administrative-cost';
import NotificationLog from '../entity/notifications/notification-log';
import UserNotificationPreference from '../entity/notifications/user-notification-preference';
import { RenameGewisToExternal1763399087409 } from '../migrations/1763399087409-rename-gewis-to-external';
import { UserNotificationPreference1764615514906 } from '../migrations/1764615514906-user-notification-preference';
import Wrapped from '../entity/wrapped';
import WrappedOrganMember from '../entity/wrapped/wrapped-organ-member';
import { AddWrappedTable1764842063654 } from '../migrations/1764842063654-add-wrapped-table';
import { AddWrappedOrganMember1765826596888 } from '../migrations/1765826596888-add-wrapped-organ-member';
import UserSetting from '../entity/user-setting';
import { UserSetting1768697568707 } from '../migrations/1768697568707-user-setting';
import {
  RemoveCreditTransferFromInactiveAdministrativeCost1769005123365,
} from '../migrations/1769005123365-remove-credit-transfer-from-inactive-administrative-cost';
import { AddLastSeenToUser1769000095806 } from '../migrations/1769000095806-add-last-seen-to-user';
import Config from '../config';
import { AddExpiryToUser1770391238004 } from '../migrations/1770391238004-add-expiry-to-user';

function getDataSourceOptions(): DataSourceOptions {
  const config = Config.get();

  if (config.app.isTest) {
    console.log('TYPEORM_CONNECTION:', config.database.connection);
  }

  const options = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    type: config.database.connection,
    username: config.database.username,
    password: config.database.password,
    ...(config.database.sslEnabled ? {
      ssl: {
        ca: fs.readFileSync(config.database.sslCaCertsPath),
      },
    } : {}),
    synchronize: config.database.synchronize,
    logging: config.database.logging,
    migrations: [
      InitialSQLMigration1743601882766,
      QrAuthenticator1743601882766,
      MemberAuthenticator1761324427011,
      AddOrganMembershipIndex1761328648026,
      UserAdministrativeCost1761845457283,
      RenameGewisToExternal1763399087409,
      UserNotificationPreference1764615514906,
      AddWrappedTable1764842063654,
      AddWrappedOrganMember1765826596888,
      UserSetting1768697568707,
      RemoveCreditTransferFromInactiveAdministrativeCost1769005123365,
      AddLastSeenToUser1769000095806,
      AddExpiryToUser1770391238004,
    ],
    extra: {
      authPlugins: {
        mysql_clear_password: () => () => Buffer.from(`${config.database.password ?? ''}\0`),
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
      InactiveAdministrativeCost,
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
      MemberUser,
      UserVoucherGroup,
      EanAuthenticator,
      OrganMembership,
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
      Wrapped,
      WrappedOrganMember,
      WriteOff,
      WriteOffPdf,
      QRAuthenticator,
      NotificationLog,
      UserNotificationPreference,
      UserSetting,
    ],
    subscribers: [
      TransactionSubscriber,
      TransferSubscriber,
    ],
  };

  return options as DataSourceOptions;
}

function getBootstrapDataSourceOptions(): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: true,
    logging: false,
    migrations: [],
    entities: [],
    subscribers: [],
  };
}

export let AppDataSource = new DataSource(getBootstrapDataSourceOptions());

const Database = {
  initialize: async () => {
    if (AppDataSource.isInitialized) return AppDataSource;
    AppDataSource = new DataSource(getDataSourceOptions());
    return AppDataSource.initialize();
  },
};

export default Database;
