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
  createConnection, Connection, getConnectionOptions,
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
import BorrelkaartGroup from '../entity/user/borrelkaart-group';
import LocalUser from '../entity/user/local-user';
import GewisUser from '../gewis/entity/gewis-user';
import UserBorrelkaartGroup from '../entity/user/user-borrelkaart-group';
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
import UpdatedProduct from '../entity/product/updated-product';
import UpdatedContainer from '../entity/container/updated-container';
import UpdatedPointOfSale from '../entity/point-of-sale/updated-point-of-sale';
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

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options: DataSourceOptions = {
      ...await getConnectionOptions(),
      extra: {
        authPlugins: {
          mysql_clear_password: () => () => Buffer.from(`${process.env.TYPEORM_PASSWORD}\0`),
        },
      },
      entities: [
        ProductCategory,
        VatGroup,
        Product,
        ProductRevision,
        UpdatedProduct,
        Container,
        ContainerRevision,
        UpdatedContainer,
        PointOfSale,
        PointOfSaleRevision,
        UpdatedPointOfSale,
        Transfer,
        StripeDeposit,
        StripeDepositStatus,
        PayoutRequest,
        PayoutRequestStatus,
        Transaction,
        SubTransaction,
        SubTransactionRow,
        FlaggedTransaction,
        BorrelkaartGroup,
        User,
        LocalUser,
        GewisUser,
        UserBorrelkaartGroup,
        EanAuthenticator,
        MemberAuthenticator,
        NfcAuthenticator,
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
        BaseFile,
        ProductImage,
        BannerImage,
        AssignedRole,
        ResetToken,
      ],
    };
    return createConnection(options);
  }
}
