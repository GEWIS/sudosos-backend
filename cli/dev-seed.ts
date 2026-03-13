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
 * Dev seed entry point.
 *
 * Creates a minimal but complete dataset for local development and manual testing.
 * Covers every major entity type so the frontend and POS can be used immediately.
 *
 * Default credentials after running this seed:
 *   - Admin:  admin@sudosos.nl  / admin  (LOCAL_ADMIN)
 *   - User:   user@sudosos.nl   / user   (LOCAL_USER)
 *   - Alice:  alice@gewis.nl    / PIN 1234 (MEMBER, member of GEWIS organ)
 *   - Bob:    bob@gewis.nl      / PIN 5678 (MEMBER, member of GEWIS organ)
 */

import { config } from 'dotenv';
import log4js from 'log4js';
import dinero, { Currency } from 'dinero.js';
import Database from '../src/database/database';
import { Application } from '../src';
import initializeDiskStorage from '../src/files/initialize';
import { truncateAllTables } from '../test/setup';
import DefaultRoles from '../src/rbac/default-roles';
import UserSeeder from '../test/seed/user-seeder';
import VatGroupSeeder from '../test/seed/catalogue/vat-group-seeder';
import ProductCategorySeeder from '../test/seed/catalogue/product-category-seeder';
import ProductSeeder from '../test/seed/catalogue/product-seeder';
import ContainerSeeder from '../test/seed/catalogue/container-seeder';
import PointOfSaleSeeder from '../test/seed/catalogue/point-of-sale-seeder';
import TransactionSeeder from '../test/seed/ledger/transaction-seeder';
import DepositSeeder from '../test/seed/ledger/deposit-seeder';
import PayoutRequestSeeder from '../test/seed/ledger/payout-request-seeder';
import FineSeeder from '../test/seed/ledger/fine-seeder';
import InactiveAdministrativeCostSeeder from '../test/seed/ledger/inactive-administrative-cost-seeder';
import SellerPayoutSeeder from '../test/seed/ledger/seller-payout-seeder';
import InvoiceSeeder from '../test/seed/ledger/invoice-seeder';
import WriteOffSeeder from '../test/seed/ledger/write-off-seeder';

export default async function devSeed() {
  // 1. Users
  const { admin, user: localUser, alice, bob, gewis, invoiceco } = await new UserSeeder().init();
  const logger = log4js.getLogger('DevSeed');
  logger.info('Users created: admin, user, alice, bob, gewis, invoiceco');

  // 2. Roles (assigns Super Admin to admin automatically)
  await DefaultRoles.synchronize();
  logger.info('Default roles synchronized');

  // 3. Catalogue
  const vatGroups = await new VatGroupSeeder().init();
  const categories = await new ProductCategorySeeder().init();
  const products = await new ProductSeeder().init(gewis, vatGroups, categories);
  const containers = await new ContainerSeeder().init(gewis, products);
  const { bar, barRevision } = await new PointOfSaleSeeder().init(gewis, containers);
  logger.info('Catalogue created: products, containers, Bar POS');

  // 4. Transactions - alice and bob buy from Bar
  await new TransactionSeeder().init([alice, bob], barRevision);
  logger.info('Transactions created: alice and bob purchasing from Bar');

  // 5. Stripe deposit - credits alice with EUR 50.00
  await new DepositSeeder().init(alice);
  logger.info('Stripe deposit created: alice +EUR 50.00');

  // 6. Payout request - alice requests EUR 10.00 back
  await new PayoutRequestSeeder().init(alice);
  logger.info('Payout request created: alice requests EUR 10.00');

  // 7. Fine - bob receives a EUR 5.00 fine
  await new FineSeeder().init(bob);
  logger.info('Fine created: bob fined EUR 5.00');

  // 8. Inactive administrative cost - bob charged EUR 0.05
  await new InactiveAdministrativeCostSeeder().init(bob);
  logger.info('Inactive administrative cost created: bob charged EUR 0.05');

  // 9. Seller payout - GEWIS withdraws EUR 5.00 in revenue
  await new SellerPayoutSeeder().init(gewis, dinero({ amount: 500 }));
  logger.info('Seller payout created: GEWIS withdraws EUR 5.00');

  // 10. Invoice - invoice for invoiceco
  await new InvoiceSeeder().init(invoiceco, admin);
  logger.info('Invoice created: invoiceco');

  // 11. Write-off - a closed user is written off
  const { user: closedUser } = await new WriteOffSeeder().init();
  logger.info(`Write-off created: user ${closedUser.id} written off`);
}

async function createApp() {
  const application = new Application();
  application.logger = log4js.getLogger('DevSeed');
  application.logger.level = process.env.LOG_LEVEL ?? 'info';
  application.logger.info('Starting dev seed...');

  application.connection = await Database.initialize();
  await truncateAllTables(application.connection);

  dinero.defaultCurrency = process.env.CURRENCY_CODE as Currency ?? 'EUR' as Currency;
  dinero.defaultPrecision = parseInt(process.env.CURRENCY_PRECISION ?? '2', 10);

  initializeDiskStorage();

  try {
    await devSeed();
    application.logger.info('Dev seed complete.');
  } catch (e) {
    application.logger.error('Dev seed failed', e);
    process.exit(1);
  }
}

if (require.main === module) {
  config();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  createApp();
}
