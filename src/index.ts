import 'reflect-metadata';
import * as http from 'http';
import * as util from 'util';
import express from 'express';
import { Connection } from 'typeorm';
import Database from './database';
import Swagger from './swagger';

export class Application {
  app: express.Express;

  server: http.Server;

  connection: Connection;

  public async stop(): Promise<void> {
    await util.promisify(this.server.close).bind(this.server)();
    await this.connection.close();
  }
}

export default async function createApp(): Promise<Application> {
  const application = new Application();
  application.connection = await Database.initialize();

  application.app = express();
  application.app.set('swagger-spec', Swagger.initialize(application.app));
  application.server = application.app.listen(process.env.HTTP_PORT);
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createApp();
}
