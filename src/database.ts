import {
  createConnection, Connection, getConnectionOptions,
} from 'typeorm';
import User from './entity/user';
import Product from './entity/product';
import Subtransaction from './entity/subtransaction';
import Transaction from './entity/transaction';

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options = {
      ...await getConnectionOptions(),
      entities: [
        Product,
        Subtransaction,
        Transaction,
        User,
      ],
    };
    return createConnection(options);
  }
}
