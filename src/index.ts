/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

/**
 * This is the module page of the application.
 *
 * @module internal/application
 */

import 'reflect-metadata';
import * as http from 'http';
import * as util from 'util';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import { json } from 'body-parser';
import { SwaggerSpecification } from 'swagger-model-validator';
import dinero, { Currency } from 'dinero.js';
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
import AuthenticationQRController from './controller/authentication-qr-controller';
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
import MemberAuthenticationController from './controller/member-authentication-controller';
import MemberAuthenticationSecureController from './controller/member-authentication-secure-controller';
import DebtorController from './controller/debtor-controller';
import EventController from './controller/event-controller';
import EventShiftController from './controller/event-shift-controller';
import WriteOffController from './controller/write-off-controller';
import ServerSettingsStore from './server-settings/server-settings-store';
import SellerPayoutController from './controller/seller-payout-controller';
import { ISettings } from './entity/server-setting';
import ServerSettingsController from './controller/server-settings-controller';
import TransactionSummaryController from './controller/transaction-summary-controller';
import SyncController from './controller/sync-controller';
import getAppLogger from './helpers/logging';
import WebSocketService from './service/websocket-service';
import InactiveAdministrativeCostController from './controller/inactive-administrative-cost-controller';
import './notifications';
import UserNotificationController from './controller/user-notification-preference-controller';
import { startMailWorker } from './workers/mail-worker';
import { Worker } from 'bullmq';
import Mailer from './mailer';
import Redis from 'ioredis';
import TermsOfServiceController from './controller/terms-of-service-controller';
import Config from './config';
import { applyConfiguredLogLevel } from './helpers/logging';

export class Application {
  app: express.Express;

  specification: SwaggerSpecification;

  roleManager: RoleManager;

  server: http.Server;

  connection: DataSource;

  workers: Worker[];

  logger: Logger;

  tasks: cron.ScheduledTask[];

  webSocketService: WebSocketService;

  redisConnection: Redis | undefined;

  public async stop(): Promise<void> {
    this.logger.info('Stopping application instance...');
    await util.promisify(this.server.close).bind(this.server)();
    if (this.webSocketService) {
      await this.webSocketService.close();
    }
    this.tasks.forEach((task) => task.stop());
    this.workers.forEach((worker) => worker.close());
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }
    await this.connection.destroy();
    this.logger.info('Application stopped.');
  }
}

/**
 * Sets up the token handler to be used by the application.
 */
async function createTokenHandler(): Promise<TokenHandler> {
  const config = Config.get();
  // Import JWT key
  const jwtContent = await fs.readFile(config.auth.jwtKeyPath);
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
  const config = Config.get();
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
    config.gewis.gewiswebJwtSecret,
  );
  application.app.use('/v1/authentication', gewisController.getRouter());

  // Define member authentication controller and bind before middleware.
  const memberController = new MemberAuthenticationController(
    {
      specification: application.specification,
      roleManager: application.roleManager,
    },
    tokenHandler,
  );
  application.app.use('/v1/authentication', memberController.getRouter());

  // Define QR authentication controller and bind before middleware.
  const qrController = new AuthenticationQRController(
    {
      specification: application.specification,
      roleManager: application.roleManager,
    },
    tokenHandler,
  );
  application.app.use('/v1/authentication/qr', qrController.getRouter());

  // Define middleware to be used by any other route.
  const tokenMiddleware = new TokenMiddleware({ refreshFactor: 0.5, tokenHandler });
  application.app.use(tokenMiddleware.getMiddleware());
  return controller;
}

export default async function createApp(): Promise<Application> {
  const config = Config.get();
  const application = new Application();
  application.logger = getAppLogger();
  application.logger.info('Starting application instance...');

  // Create folders for disk storage
  initializeDiskStorage();

  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  applyConfiguredLogLevel(logger);
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  // Set up monetary value configuration.
  dinero.defaultCurrency = config.currency.code as Currency;
  dinero.defaultPrecision = config.currency.precision;

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
  if (config.app.isDevelopment) {
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
  
  // Initialize WebSocket service
  // Close existing instance's server if it exists (e.g., in tests)
  try {
    const existingInstance = WebSocketService.getInstance();
    if (existingInstance.server.listening) {
      application.logger.info('Closing existing WebSocket server before creating new instance');
      existingInstance.server.close(() => {
        application.logger.info('Existing WebSocket server closed');
      });
    }
  } catch {
    // No existing instance, continue
  }
  
  const webSocketService = new WebSocketService({
    tokenHandler,
    roleManager: application.roleManager,
  });
  application.webSocketService = webSocketService;

  // Try to connect to Redis. If it is unreachable (common in local dev
  // environments) we fall back to direct SMTP sending instead of crashing.
  // In production we always require Redis and re-throw to prevent silent
  // degradation of email delivery semantics.
  //
  // The connect timeout defaults to 100 ms in test environments (to avoid
  // slowing down suites that run without Redis) and 3 s otherwise.
  // Override via REDIS_CONNECT_TIMEOUT_MS if needed.
  let redisClient: Redis | undefined;
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
      // Give up quickly so startup is not delayed when Redis is absent.
      // We intentionally omit retryStrategy so that once the connection is
      // established, ioredis uses its default reconnection behaviour on drop.
      connectTimeout: config.redis.connectTimeoutMs,
    });

    // Wait for the connection to be established (or fail).
    // Named handlers are used so each one can remove the other, preventing
    // a stale listener from hiding subsequent errors or firing unexpectedly.
    await new Promise<void>((resolve, reject) => {
      // Declare first so each handler can reference the other without
      // triggering the no-use-before-define lint rule.
      let handleReady: () => void;
      let handleError: (err: Error) => void;

      handleReady = () => {
        redisClient.removeListener('error', handleError);
        resolve();
      };
      handleError = (err: Error) => {
        redisClient.removeListener('ready', handleReady);
        reject(err);
      };

      redisClient.once('ready', handleReady);
      redisClient.once('error', handleError);
    });

    // Attach a persistent error handler so any post-startup Redis errors are
    // logged rather than crashing the process with an unhandled error event.
    redisClient.on('error', (err: Error) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    application.redisConnection = redisClient;
    logger.info('Redis connection established.');
  } catch (err) {
    // Clean up any lingering sockets / timers on the failed client so the
    // event loop is not kept alive unnecessarily.
    if (redisClient) {
      redisClient.removeAllListeners();
      redisClient.disconnect();
    }
    application.redisConnection = undefined;

    if (config.app.isProduction) {
      // In production a Redis outage must be an explicit, loud failure rather
      // than a silent fallback that changes email delivery semantics.
      throw new Error(
        `Redis is required in production but could not be reached: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    logger.warn(
      `Could not connect to Redis (${err instanceof Error ? err.message : String(err)}). `
      + 'Email queueing will be disabled – emails will be sent directly via SMTP. '
      + 'Start Redis or set REDIS_HOST / REDIS_PORT to enable queued sending.',
    );
  }

  new Mailer(application.redisConnection);

  application.tasks = [];

  // REMOVE LATER
  application.app.use('/v1/rbac', new RbacController(options).getRouter());
  application.app.use('/v1/authentication', new AuthenticationSecureController(options, tokenHandler).getRouter());
  application.app.use('/v1/authentication', new MemberAuthenticationSecureController(options, tokenHandler).getRouter());
  application.app.use('/v1/balances', new BalanceController(options).getRouter());
  application.app.use('/v1/banners', new BannerController(options).getRouter());
  application.app.use('/v1/users', new UserController(options, tokenHandler).getRouter());
  application.app.use('/v1/events', new EventController(options).getRouter());
  application.app.use('/v1/eventshifts', new EventShiftController(options).getRouter());
  application.app.use('/v1/vatgroups', new VatGroupController(options).getRouter());
  application.app.use('/v1/products', new ProductController(options).getRouter());
  application.app.use('/v1/productcategories', new ProductCategoryController(options).getRouter());
  application.app.use('/v1/pointsofsale', new PointOfSaleController(options).getRouter());
  // Controller with more specific endpoints should go before generic controllers, otherwise
  // the specific endpoints all return 405 (somehow).
  application.app.use('/v1/transactions/summary', new TransactionSummaryController(options).getRouter());
  application.app.use('/v1/transactions', new TransactionController(options).getRouter());
  application.app.use('/v1/vouchergroups', new VoucherGroupController(options).getRouter());
  application.app.use('/v1/transfers', new TransferController(options).getRouter());
  application.app.use('/v1/inactive-administrative-costs', new InactiveAdministrativeCostController(options).getRouter());
  application.app.use('/v1/fines', new DebtorController(options).getRouter());
  application.app.use('/v1/stripe', new StripeController(options).getRouter());
  application.app.use('/v1/payoutrequests', new PayoutRequestController(options).getRouter());
  application.app.use('/v1/invoices', new InvoiceController(options).getRouter());
  application.app.use('/v1/containers', new ContainerController(options).getRouter());
  application.app.use('/v1/writeoffs', new WriteOffController(options).getRouter());
  application.app.use('/v1/user-notification-preferences', new UserNotificationController(options).getRouter());
  application.app.use('/v1/seller-payouts', new SellerPayoutController(options).getRouter());
  application.app.use('/v1/server-settings', new ServerSettingsController(options).getRouter());
  application.app.use('/v1/sync', new SyncController(options).getRouter());
  application.app.use('/v1/terms-of-service', new TermsOfServiceController(options).getRouter());
  if (config.app.isDevelopment) {
    application.app.use('/v1/files', new SimpleFileController(options).getRouter());
    application.app.use('/v1/test', new TestController(options).getRouter());
  }

  webSocketService.initiateWebSocket();

  application.workers = application.redisConnection
    ? [startMailWorker(application.redisConnection)]
    : [];

  // Start express application.
  logger.info(`Server listening on port ${config.app.httpPort}.`);
  application.server = application.app.listen(config.app.httpPort);
  application.logger.info('Application started.');
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createApp().catch((e) => {
    console.error(e);
    const logger = log4js.getLogger('index');
    applyConfiguredLogLevel(logger);
    logger.fatal(e);
  });
}
