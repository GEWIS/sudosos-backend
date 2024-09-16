/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
 *
 *  @license
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
import { DataSource } from 'typeorm';
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
import VoucherGroupController from './controller/voucher-group-controller';
import BalanceController from './controller/balance-controller';
import RbacController from './controller/rbac-controller';
import GewisAuthenticationController from './gewis/controller/gewis-authentication-controller';
import TransferController from './controller/transfer-controller';
import PointOfSaleController from './controller/point-of-sale-controller';
import ContainerController from './controller/container-controller';
import SimpleFileController from './controller/simple-file-controller';
import initializeDiskStorage from './files/initialize';
import StripeController from './controller/stripe-controller';
import StripeWebhookController from './controller/stripe-webhook-controller';
import { extractRawBody } from './helpers/raw-body';
import InvoiceController from './controller/invoice-controller';
import PayoutRequestController from './controller/payout-request-controller';
import RootController from './controller/root-controller';
import VatGroupController from './controller/vat-group-controller';
import TestController from './controller/test-controller';
import AuthenticationSecureController from './controller/authentication-secure-controller';
import DebtorController from './controller/debtor-controller';
import EventController from './controller/event-controller';
import EventShiftController from './controller/event-shift-controller';
import WriteOffController from './controller/write-off-controller';
import ServerSettingsStore from './server-settings/server-settings-store';
import SellerPayoutController from './controller/seller-payout-controller';
import { ISettings } from './entity/server-setting';
import ServerSettingsController from './controller/server-settings-controller';

export class Application {
  app: express.Express;

  specification: SwaggerSpecification;

  roleManager: RoleManager;

  server: http.Server;

  connection: DataSource;

  logger: Logger;

  tasks: cron.ScheduledTask[];

  public async stop(): Promise<void> {
    this.logger.info('Stopping application instance...');
    await util.promisify(this.server.close).bind(this.server)();
    this.tasks.forEach((task) => task.stop());
    await this.connection.destroy();
    this.logger.info('Application stopped.');
  }
}

/**
 * Sets up the token handler to be used by the application.
 */
async function createTokenHandler(): Promise<TokenHandler> {
  // Import JWT key
  const jwtPath = process.env.JWT_KEY_PATH;
  const jwtContent = await fs.readFile(jwtPath);
  const jwtPrivate = crypto.createPrivateKey(jwtContent);
  const jwtPublic = crypto.createPublicKey(jwtPrivate);

  // Define middleware
  return new TokenHandler({
    algorithm: 'RS512',
    publicKey: jwtPublic.export({ type: 'spki', format: 'pem' }),
    privateKey: jwtPrivate.export({ type: 'pkcs8', format: 'pem' }),
    expiry: ServerSettingsStore.getInstance().getSetting('jwtExpiryDefault') as ISettings['jwtExpiryDefault'],
  });
}

/**
 * Sets up the token handling middleware and initializes the authentication
 * controllers of the application.
 * @param tokenHandler - Reference to the token handler used by the application.
 * @param application - The application on which to bind the middleware
 *                      and controller.
 */
async function setupAuthentication(tokenHandler: TokenHandler, application: Application) {
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

  // INJECT GEWIS BINDINGS
  Gewis.overwriteBindings();

  // Define middleware to be used by any other route.
  const tokenMiddleware = new TokenMiddleware({ refreshFactor: 0.5, tokenHandler });
  application.app.use(tokenMiddleware.getMiddleware());
  return controller;
}

export default async function createApp(): Promise<Application> {
  const application = new Application();
  log4js.configure({
    pm2: true,
    appenders: {
      out: { type: 'stdout' },
    },
    disableClustering: true,
    categories: { default: { appenders: ['out'], level: 'all' } },
  });
  application.logger = log4js.getLogger('Application');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting application instance...');

  // Validate environment variables
  if (!process.env.NAME) throw new Error('NAME environment variable is not set.');

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

  // Initialize database-stored settings
  const store = ServerSettingsStore.getInstance();
  if (!store.initialized) await store.initialize();

  // Create express application.
  application.app = express();
  application.specification = await Swagger.initialize(application.app);
  application.app.use(json({
    verify: extractRawBody,
  }));
  application.app.use(fileUpload());

  application.app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  application.app.use('/v1', new RootController({
    specification: application.specification,
    roleManager: application.roleManager,
  }).getRouter());

  // Product images
  if (process.env.NODE_ENV === 'development') {
    application.app.use('/static/products', express.static('data/products'));
    application.app.use('/static/banners', express.static('data/banners'));
    application.app.use('/static/invoices', express.static('data/invoices'));
  }

  application.roleManager = await new RoleManager().initialize();

  const options: BaseControllerOptions = {
    specification: application.specification,
    roleManager: application.roleManager,
  };
  application.app.use('/v1/stripe', new StripeWebhookController(options).getRouter());

  const tokenHandler = await createTokenHandler();
  // Setup token handler and authentication controller.
  await setupAuthentication(tokenHandler, application);

  application.tasks = [];

  // REMOVE LATER
  application.app.use('/v1/rbac', new RbacController(options).getRouter());
  application.app.use('/v1/authentication', new AuthenticationSecureController(options, tokenHandler).getRouter());
  application.app.use('/v1/balances', new BalanceController(options).getRouter());
  application.app.use('/v1/banners', new BannerController(options).getRouter());
  application.app.use('/v1/users', new UserController(options, tokenHandler).getRouter());
  application.app.use('/v1/events', new EventController(options).getRouter());
  application.app.use('/v1/eventshifts', new EventShiftController(options).getRouter());
  application.app.use('/v1/vatgroups', new VatGroupController(options).getRouter());
  application.app.use('/v1/products', new ProductController(options).getRouter());
  application.app.use('/v1/productcategories', new ProductCategoryController(options).getRouter());
  application.app.use('/v1/pointsofsale', new PointOfSaleController(options).getRouter());
  application.app.use('/v1/transactions', new TransactionController(options).getRouter());
  application.app.use('/v1/vouchergroups', new VoucherGroupController(options).getRouter());
  application.app.use('/v1/transfers', new TransferController(options).getRouter());
  application.app.use('/v1/fines', new DebtorController(options).getRouter());
  application.app.use('/v1/stripe', new StripeController(options).getRouter());
  application.app.use('/v1/payoutrequests', new PayoutRequestController(options).getRouter());
  application.app.use('/v1/invoices', new InvoiceController(options).getRouter());
  application.app.use('/v1/containers', new ContainerController(options).getRouter());
  application.app.use('/v1/writeoffs', new WriteOffController(options).getRouter());
  application.app.use('/v1/seller-payouts', new SellerPayoutController(options).getRouter());
  application.app.use('/v1/server-settings', new ServerSettingsController(options).getRouter());
  if (process.env.NODE_ENV === 'development') {
    application.app.use('/v1/files', new SimpleFileController(options).getRouter());
    application.app.use('/v1/test', new TestController(options).getRouter());
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
    console.error(e);
    const logger = log4js.getLogger('index');
    logger.level = process.env.LOG_LEVEL;
    logger.fatal(e);
  });
}
