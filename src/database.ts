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
import User from './entity/user';
import Product from './entity/product/product';
import SubTransaction from './entity/sub-transaction';
import Transaction from './entity/transaction';
import ProductCategory from './entity/product/product-category';
import SubTransactionRow from './entity/sub-transaction-row';
import PointOfSale from './entity/point-of-sale/point-of-sale';
import Container from './entity/container/container';
import FlaggedTransaction from './entity/flagged-transaction';
import BorrelkaartGroup from './entity/borrelkaart-group';

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options = {
      ...await getConnectionOptions(),
      entities: [
        ProductCategory,
        Product,
        Container,
        PointOfSale,
        Transaction,
        SubTransaction,
        SubTransactionRow,
        FlaggedTransaction,
        BorrelkaartGroup,
        User,
      ],
    };
    return createConnection(options);
  }
}
