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
import {
  createConnection, Connection,
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
import AssignedRole from '../entity/roles/assigned-role';
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

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options: DataSourceOptions = {
      host: process.env.TYPEORM_HOST,
      port: parseInt(process.env.TYPEORM_PORT || '3001'),
      database: process.env.TYPEORM_DATABASE,
      type: process.env.TYPEORM_CONNECTION as 'postgres' | 'mariadb' | 'mysql',
      username: process.env.TYPEORM_USERNAME,
      password: process.env.TYPEORM_PASSWORD,
      synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
      logging: process.env.TYPEORM_LOGGING === 'true',
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
    return createConnection(options);
  }
}
