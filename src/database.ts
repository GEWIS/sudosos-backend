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
import User from './entity/user/user';
import Product from './entity/product/product';
import SubTransaction from './entity/transactions/sub-transaction';
import Transaction from './entity/transactions/transaction';
import ProductCategory from './entity/product/product-category';
import SubTransactionRow from './entity/transactions/sub-transaction-row';
import PointOfSale from './entity/point-of-sale/point-of-sale';
import Container from './entity/container/container';
import FlaggedTransaction from './entity/transactions/flagged-transaction';
import BorrelkaartGroup from './entity/user/borrelkaart-group';
import LocalUser from './entity/user/local-user';
import GewisUser from './entity/user/gewis-user';
import UserBorrelkaartGroup from './entity/user/user-borrelkaart-group';
import EanAuthenticator from './entity/authenticators/ean-authenticator';
import MemberAuthenticator from './entity/authenticators/member-authenticator';
import NfcAuthenticator from './entity/authenticators/nfc-authenticator';
import PinAuthenticator from './entity/authenticators/pin-authenticator';
import Advertisement from './entity/advertisement';
import Transfer from './entity/transactions/transfer';

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options = {
      ...await getConnectionOptions(),
      entities: [
        ProductCategory,
        Product,
        Container,
        PointOfSale,
        Transfer,
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
        Advertisement,
      ],
    };
    return createConnection(options);
  }
}
