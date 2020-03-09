import {
  createConnection, Connection, getConnectionOptions,
} from 'typeorm';
import User from './entity/user';

export default class Database {
  public static async initialize(): Promise<Connection> {
    const options = {
      ...await getConnectionOptions(),
      entities: [
        User,
      ],
    };
    return createConnection(options);
  }
}
