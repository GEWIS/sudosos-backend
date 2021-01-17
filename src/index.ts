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
import 'reflect-metadata';
import * as http from 'http';
import * as util from 'util';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import bodyParser from 'body-parser';
import { SwaggerSpecification } from 'swagger-model-validator';
import dinero, { Currency } from 'dinero.js';
import express from 'express';
import log4js from 'log4js';
import { Connection } from 'typeorm';
import Database from './database';
import Swagger from './swagger';
import TokenHandler from './authentication/token-handler';
import TokenMiddleware from './middleware/token-middleware';
import AuthenticationController from './controller/authentication-controller';
import BannerController from './controller/banner-controller';

export class Application {
  app: express.Express;

  specification: SwaggerSpecification;

  server: http.Server;

  connection: Connection;

  public async stop(): Promise<void> {
    await util.promisify(this.server.close).bind(this.server)();
    await this.connection.close();
  }
}

/**
 * Sets up the token handling middleware and initializes the authentication
 * controllers of the application.
 * @param application - The application on which to bind the middleware
 *                      and controller.
 */
async function setupAuthentication(application: Application) {
  // Import JWT key
  const jwtPath = process.env.JWT_KEY_PATH;
  const jwtContent = await fs.readFile(jwtPath);
  const jwtPrivate = crypto.createPrivateKey(jwtContent);
  const jwtPublic = crypto.createPublicKey(jwtPrivate);

  // Define middleware
  const tokenHandler = new TokenHandler({
    algorithm: 'RS512',
    publicKey: jwtPublic.export({ type: 'spki', format: 'pem' }),
    privateKey: jwtPrivate.export({ type: 'pkcs8', format: 'pem' }),
    expiry: 3600,
  });

  // Define authentication controller and bind before middleware.
  const controller = new AuthenticationController(application.specification, tokenHandler);
  application.app.use('/v1/authentication', controller.getRouter());

  // Define middleware to be used by any other route.
  const tokenMiddleware = new TokenMiddleware({ refreshFactor: 0.5, tokenHandler });
  application.app.use(tokenMiddleware.getMiddleware());
}

export default async function createApp(): Promise<Application> {
  const application = new Application();
  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  // console.log = (message: any) => logger.debug(message);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  // Create express application.
  application.app = express();
  application.specification = await Swagger.initialize(application.app);
  application.app.use(bodyParser.json());

  // Setup token handler and authentication controller.
  await setupAuthentication(application);

  // REMOVE LATER, test for banner controller
  application.app.use('/v1/banners', new BannerController(application.specification).getRouter());

  // Start express application.
  application.server = application.app.listen(process.env.HTTP_PORT);
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createApp();
}
