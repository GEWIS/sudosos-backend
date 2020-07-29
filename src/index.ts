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
import bodyParser from 'body-parser';
import { SwaggerSpecification } from 'swagger-model-validator';
import dinero, { Currency } from 'dinero.js';
import express from 'express';
import log4js from 'log4js';
import { Connection } from 'typeorm';
import Database from './database';
import Swagger from './swagger';

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

export default async function createApp(): Promise<Application> {
  const application = new Application();
  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any) => logger.debug(message);

  // Set up monetary value configuration
  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION, 10);

  application.app = express();
  application.specification = await Swagger.initialize(application.app);

  application.app.use(bodyParser.json());

  application.server = application.app.listen(process.env.HTTP_PORT);
  return application;
}

if (require.main === module) {
  // Only execute the application directly if this is the main execution file.
  createApp();
}
