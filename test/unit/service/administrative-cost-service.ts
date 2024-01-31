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

import { Connection } from 'typeorm';
import { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import User from '../../../src/entity/user/user';
import Transaction from '../../../src/entity/transactions/transaction';
import Balance from '../../../src/entity/transactions/balance';
import Database from '../../../src/database/database';
import { seedTransactions, seedUsers } from '../../seed';
import { Stripe } from 'stripe';
import Transfer = module;
import generate = module;
import generateBalance from '../../helpers/test-helpers';

describe('AdministrativeCostService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    transactions: Transaction[],

  };

  before(async => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const transactions = await seedTransactions();

    await generateBalance(1000, 7);

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(json());

  });
});