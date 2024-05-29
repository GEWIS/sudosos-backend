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
import { config } from 'dotenv';
import log4js from 'log4js';
import Database from '../../src/database/database';
import { Application } from '../../src';
import { QueryRunner } from 'typeorm';

// Use the TypeORM generate migrations function and extract the undo step
async function undoMigrations(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query('DROP INDEX `IDX_31aef0453df6db5015712eb2d2` ON `invoice`');
  await queryRunner.query('RENAME TABLE `invoice` TO `temporary_invoice`');
  await queryRunner.query('CREATE TABLE `invoice` (`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `version` int NOT NULL, `id` int NOT NULL AUTO_INCREMENT, `toId` int NOT NULL, `addressee` varchar(255) NOT NULL, `description` varchar(255) NOT NULL, `transferId` int NOT NULL, `pdfId` int, `reference` varchar(255) NOT NULL, `street` varchar(255) NOT NULL, `postalCode` varchar(255) NOT NULL, `city` varchar(255) NOT NULL, `country` varchar(255) NOT NULL, UNIQUE KEY `REL_f1af5bbf5baeb15ee911f2c54c` (`transferId`), UNIQUE KEY `UQ_2c2ba57e13ec85c2d886d898f38` (`pdfId`), PRIMARY KEY (`id`), CONSTRAINT `FK_f1af5bbf5baeb15ee911f2c54ca` FOREIGN KEY (`transferId`) REFERENCES `transfer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT `FK_a0c7a052a624e9a630272fe96c6` FOREIGN KEY (`toId`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION)');
  await queryRunner.query('INSERT INTO `invoice`(`createdAt`, `updatedAt`, `version`, `id`, `toId`, `addressee`, `description`, `transferId`, `pdfId`, `reference`, `street`, `postalCode`, `city`, `country`) SELECT `createdAt`, `updatedAt`, `version`, `id`, `toId`, `addressee`, `description`, `transferId`, `pdfId`, `reference`, `street`, `postalCode`, `city`, `country` FROM `temporary_invoice`');
  await queryRunner.query('DROP TABLE `temporary_invoice`');
  await queryRunner.query('CREATE INDEX `IDX_31aef0453df6db5015712eb2d2` ON `invoice` (`createdAt`)');

  await queryRunner.query('DROP INDEX `IDX_132548150462df9aceb57c5ef3` ON `invoice_pdf`');
  await queryRunner.query('RENAME TABLE `invoice_pdf` TO `temporary_invoice_pdf`');
  await queryRunner.query('CREATE TABLE `invoice_pdf` (`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `version` int NOT NULL, `id` int NOT NULL AUTO_INCREMENT, `downloadName` varchar(255) NOT NULL, `location` varchar(255) NOT NULL, `hash` varchar(255) NOT NULL, `createdById` int NOT NULL, PRIMARY KEY (`id`))');
  await queryRunner.query('INSERT INTO `invoice_pdf`(`createdAt`, `updatedAt`, `version`, `id`, `downloadName`, `location`, `hash`, `createdById`) SELECT `createdAt`, `updatedAt`, `version`, `id`, `downloadName`, `location`, `hash`, `createdById` FROM `temporary_invoice_pdf`');
  await queryRunner.query('DROP TABLE `temporary_invoice_pdf`');
  await queryRunner.query('CREATE INDEX `IDX_132548150462df9aceb57c5ef3` ON `invoice_pdf` (`createdAt`)');

  await queryRunner.query('DROP INDEX `IDX_83a955d71e12c919cc0cb0d53b` ON `product_revision`');
  await queryRunner.query('RENAME TABLE `product_revision` TO `temporary_product_revision`');
  await queryRunner.query('CREATE TABLE `product_revision` (`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `version` int NOT NULL, `productId` int NOT NULL, `revision` int NOT NULL DEFAULT 1, `name` varchar(64) NOT NULL, `priceInclVat` int NOT NULL, `alcoholPercentage` decimal(10,2) NOT NULL, `featured` tinyint(1) NOT NULL DEFAULT 0, `preferred` tinyint(1) NOT NULL DEFAULT 0, `priceList` tinyint(1) NOT NULL DEFAULT 0, `vatId` int NOT NULL, `categoryId` int NOT NULL, PRIMARY KEY (`productId`, `revision`), CONSTRAINT `FK_d0bf413994264a323d914f1c767` FOREIGN KEY (`productId`) REFERENCES `product` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT `FK_98524ea1462e06ea2e49f98fb41` FOREIGN KEY (`vatId`) REFERENCES `vat_group` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT `FK_4c2b27e9edcada5b7c32a1bba4f` FOREIGN KEY (`categoryId`) REFERENCES `product_category` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION)');
  await queryRunner.query('INSERT INTO `product_revision`(`createdAt`, `updatedAt`, `version`, `productId`, `revision`, `name`, `priceInclVat`, `alcoholPercentage`, `featured`, `preferred`, `priceList`, `vatId`, `categoryId`) SELECT `createdAt`, `updatedAt`, `version`, `productId`, `revision`, `name`, `priceInclVat`, `alcoholPercentage`, `featured`, `preferred`, `priceList`, `vatId`, `categoryId` FROM `temporary_product_revision`');
  await queryRunner.query('DROP TABLE `temporary_product_revision`');
  await queryRunner.query('CREATE INDEX `IDX_83a955d71e12c919cc0cb0d53b` ON `product_revision` (`createdAt`)');

  await queryRunner.query('DROP INDEX `IDX_1f527d9878bdf21e83a72dddd2` ON `invoice_user`');
  await queryRunner.query('RENAME TABLE `invoice_user` TO `temporary_invoice_user`');
  await queryRunner.query('CREATE TABLE `invoice_user` (`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `version` int NOT NULL, `userId` int NOT NULL, `automatic` tinyint(1) NOT NULL DEFAULT 0, PRIMARY KEY (`userId`), CONSTRAINT `FK_273e5b37f9b184fd56e7f2cb08a` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION)');
  await queryRunner.query('INSERT INTO `invoice_user`(`createdAt`, `updatedAt`, `version`, `userId`, `automatic`) SELECT `createdAt`, `updatedAt`, `version`, `userId`, `automatic` FROM `temporary_invoice_user`');
  await queryRunner.query('DROP TABLE `temporary_invoice_user`');
  await queryRunner.query('CREATE INDEX `IDX_1f527d9878bdf21e83a72dddd2` ON `invoice_user` (`createdAt`)');

  await queryRunner.query('DROP INDEX `IDX_31aef0453df6db5015712eb2d2` ON `invoice`');
  await queryRunner.query('RENAME TABLE `invoice` TO `temporary_invoice`');
  await queryRunner.query('CREATE TABLE `invoice` (`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `version` int NOT NULL, `id` int NOT NULL AUTO_INCREMENT, `toId` int NOT NULL, `addressee` varchar(255) NOT NULL, `description` varchar(255) NOT NULL, `transferId` int NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `REL_f1af5bbf5baeb15ee911f2c54c` (`transferId`), CONSTRAINT `FK_f1af5bbf5baeb15ee911f2c54ca` FOREIGN KEY (`transferId`) REFERENCES `transfer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT `FK_a0c7a052a624e9a630272fe96c6` FOREIGN KEY (`toId`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION)');
  await queryRunner.query('INSERT INTO `invoice`(`createdAt`, `updatedAt`, `version`, `id`, `toId`, `addressee`, `description`, `transferId`) SELECT `createdAt`, `updatedAt`, `version`, `id`, `toId`, `addressee`, `description`, `transferId` FROM `temporary_invoice`');
  await queryRunner.query('DROP TABLE `temporary_invoice`');
  await queryRunner.query('CREATE INDEX `IDX_31aef0453df6db5015712eb2d2` ON `invoice` (`createdAt`)');

  await queryRunner.query('DROP INDEX `IDX_132548150462df9aceb57c5ef3` ON `invoice_pdf`');
  await queryRunner.query('DROP TABLE `invoice_pdf`');
}

export default async function migrate() {
  console.error('HERE?');
  const application = new Application();
  application.logger = log4js.getLogger('Migration');
  application.logger.level = process.env.LOG_LEVEL;
  application.logger.info('Starting Migrator');
  console.error('HERE?');
  application.connection = await Database.initialize();

  // Silent in-dependency logs unless really wanted by the environment.
  const logger = log4js.getLogger('Console');
  logger.level = process.env.LOG_LEVEL;
  console.log = (message: any, ...additional: any[]) => logger.debug(message, ...additional);

  const runner = application.connection.createQueryRunner();

  try {
    application.logger.log('Starting synchronize + migrations.');
    await application.connection.synchronize();
    console.error('BEFORE');
    await runner.connect();
    await undoMigrations(runner).catch((e) => console.error(e));
    await runner.release();
    console.error('AFTER');
    await application.connection.runMigrations({ transaction: 'all' });
    await application.connection.close();
    application.logger.log('Finished synchronize + migrations.');
  } catch (e) {
    application.logger.error('Error migrating db', e);
  }
}

// Only allow in test environment, for production use CLI.
if (require.main === module || process.env.NODE_ENV === 'test') {
  // Only execute the application directly if this is the main execution file.
  config();
  if (process.env.TYPEORM_CONNECTION === 'sqlite') console.warn('Migrations in sqlite most likely have no effect.');
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  migrate();
  console.error('END');
}
