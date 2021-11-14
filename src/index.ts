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
import { json } from 'body-parser';
import { SwaggerSpecification } from 'swagger-model-validator';
import dinero, { Currency } from 'dinero.js';
import { config } from 'dotenv';
import express from 'express';
import log4js, { Logger } from 'log4js';
import { Connection } from 'typeorm';
import cron from 'node-cron';
import fileUpload from 'express-fileupload';
import Database from './database/database';
import Swagger from './start/swagger';
import TokenHandler from './authentication/token-handler';
import TokenMiddleware from './middleware/token-middleware';
import AuthenticationController from './controller/authentication-controller';
import RoleManager from './rbac/role-manager';
import Gewis from './gewis/gewis';
import BannerController from './controller/banner-controller';
import { BaseControllerOptions } from './controller/base-controller';
import UserController from './controller/user-controller';
import ProductController from './controller/product-controller';
import ProductCategoryController from './controller/product-category-controller';
import TransactionController from './controller/transaction-controller';
import BorrelkaartGroupController from './controller/borrelkaart-group-controller';
import BalanceService from './service/balance-service';
import BalanceController from './controller/balance-controller';
import RbacController from './controller/rbac-controller';
import GewisAuthenticationController from './gewis/controller/gewis-authentication-controller';
import ContainerController from './controller/container-controller';
import SimpleFileController from './controller/simple-file-controller';
import initializeDiskStorage from './files/initialize';

export class Application {
  app: express.Express;

  specification: SwaggerSpecification;

  roleManager: RoleManager;

  server: http.Server;

  connection: Connection;

  logger: Logger;

  tasks: cron.ScheduledTask[];

  public async stop(): Promise<void> {
    this.logger.info('Stopping application instance...');
    await util.promisify(this.server.close).bind(this.server)();
    this.tasks.forEach((task) => task.stop());
    await this.connection.close();
    this.logger.info('Application stopped.');
  }
}

/**
 * Sets up the rbac and initializes the rbac controllers of the application.
 * @param application - The application on which to bind the middleware
 *                      and controller.
 */
async function setupRbac(application: Application) {
  // Setup GEWIS-specific module.
  const gewis = new Gewis(application.roleManager);
  await gewis.registerRoles();

  // Define rbac controller and bind.
  const controller = new RbacController(
    {
      specification: application.specification,
      roleManager: application.roleManager,
    },
  );
  application.app.use('/v1/rbac', controller.getRouter());
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
  const controller = new AuthenticationController(
    {
      specification: application.specification,
      roleManager: application.roleManager,
    },
    tokenHandler,
  );
  application.app.use('/v1/authentication', controller.getRouter());

  // Define GEWIS authentication controller and bind before middleware.
  const gewisController = new GewisAuthenticationController(
    {
      specification: application.specification,
      roleManager: application.roleManager,
    },
    tokenHandler,
    process.env.GEWISWEB_JWT_SECRET,
  );
  application.app.use('/v1/authentication', gewisController.getRouter());

  // Define middleware to be used by any other route.
  const tokenMiddleware = new TokenMiddleware({ refreshFactor: 0.5, tokenHandler });
  application.app.use(tokenMiddleware.getMiddleware());
}

export default async function createApp(): Promise<Application> {
  const application = new Application();
  application.logger = log4js.getLogger('Application');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting application instance...');

  // Create folders for disk storage
  initializeDiskStorage();

  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  // Create express application.
  application.app = express();
  application.specification = await Swagger.initialize(application.app);
  application.app.use(json());
  application.app.use(fileUpload());

  // Setup RBAC.
  application.roleManager = new RoleManager();
  await setupRbac(application);

  // Setup token handler and authentication controller.
  await setupAuthentication(application);

  await BalanceService.updateBalances();
  const cronTask = cron.schedule('*/10 * * * *', () => {
    logger.debug('Syncing balances.');
    BalanceService.updateBalances();
    logger.debug('Synced balances.');
  });
  application.tasks = [cronTask];

  // REMOVE LATER
  const options: BaseControllerOptions = {
    specification: application.specification,
    roleManager: application.roleManager,
  };
  application.app.use('/v1/balances', new BalanceController(options).getRouter());
  application.app.use('/v1/banners', new BannerController(options).getRouter());
  application.app.use('/v1/users', new UserController(options).getRouter());
  application.app.use('/v1/products', new ProductController(options).getRouter());
  application.app.use('/v1/productcategories', new ProductCategoryController(options).getRouter());
  application.app.use('/v1/transactions', new TransactionController(options).getRouter());
  application.app.use('/v1/borrelkaartgroups', new BorrelkaartGroupController(options).getRouter());
  application.app.use('/v1/containers', new ContainerController(options).getRouter());
  if (process.env.NODE_ENV === 'development') {
    application.app.use('/v1/files', new SimpleFileController(options).getRouter());
  }

  // Start express application.
  logger.info(`Server listening on port ${process.env.HTTP_PORT}.`);
  application.server = application.app.listen(process.env.HTTP_PORT);
  application.logger.info('Application started.');
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  config();
  createApp().catch((e) => {
    const logger = log4js.getLogger('index');
    logger.level = process.env.LOG_LEVEL;
    logger.fatal(e);
  });
}
