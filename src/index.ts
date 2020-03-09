import 'reflect-metadata';
import * as http from 'http';
import * as util from 'util';
import express from 'express';
import Swagger from './swagger';

export class Application {
  app: express.Express;

  server: http.Server;

  public async stop(): Promise<void> {
    await util.promisify(this.server.close).bind(this.server)();
  }
}

export default async function createApp(): Promise<Application> {
  const application = new Application();
  application.app = express();
  application.app.set('swagger-spec', Swagger.initialize(application.app));
  application.server = application.app.listen(3000);
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createApp();
}
