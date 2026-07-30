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
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class PaymentRequestAttempt1784877357000 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'payment_request_attempt',
      columns: [
        {
          name: 'paymentRequestUuid',
          type: 'varchar',
          length: '36',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'paymentIntentId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'createdAt',
          type: 'datetime',
          default: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'updatedAt',
          type: 'datetime',
          default: 'current_timestamp',
          onUpdate: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'version',
          type: 'integer',
          isNullable: false,
          default: 1,
        },
      ],
    }), true);

    await queryRunner.createForeignKey('payment_request_attempt', new TableForeignKey({
      columnNames: ['paymentRequestUuid'],
      referencedColumnNames: ['id'],
      referencedTableName: 'payment_request',
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('payment_request_attempt', new TableForeignKey({
      columnNames: ['paymentIntentId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'stripe_payment_intent',
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }));

    // Each StripePaymentIntent is a OneToOne on the PaymentRequestAttempt side,
    // so paymentIntentId must be unique on its own, not just as part of the
    // composite primary key.
    await queryRunner.createIndex('payment_request_attempt', new TableIndex({
      name: 'IDX_payment_request_attempt_paymentIntentId',
      columnNames: ['paymentIntentId'],
      isUnique: true,
    }));

    // Backfill: every existing direct link from stripe_payment_intent to
    // payment_request becomes an attempt row.
    await queryRunner.query(
      'INSERT INTO `payment_request_attempt` (`paymentRequestUuid`, `paymentIntentId`, `createdAt`, `updatedAt`, `version`) '
      + 'SELECT `paymentRequestId`, `id`, `createdAt`, `updatedAt`, 1 FROM `stripe_payment_intent` WHERE `paymentRequestId` IS NOT NULL',
    );

    // Drop the now-superseded direct reference on stripe_payment_intent.
    // The foreign key must go first: MariaDB refuses to drop an index that
    // still backs a foreign key constraint.
    const intentTable = await queryRunner.getTable('stripe_payment_intent');
    if (intentTable) {
      const paymentRequestFk = intentTable.foreignKeys.find(f => f.columnNames.indexOf('paymentRequestId') !== -1);
      if (paymentRequestFk) await queryRunner.dropForeignKey('stripe_payment_intent', paymentRequestFk);
    }

    await queryRunner.dropIndex('stripe_payment_intent', 'IDX_stripe_payment_intent_paymentRequestId');

    await queryRunner.dropColumn('stripe_payment_intent', 'paymentRequestId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the direct reference on stripe_payment_intent.
    await queryRunner.addColumn('stripe_payment_intent', new TableColumn({
      name: 'paymentRequestId',
      type: 'varchar',
      length: '36',
      isNullable: true,
    }));

    await queryRunner.query(
      'UPDATE `stripe_payment_intent` `spi` '
      + 'JOIN `payment_request_attempt` `pra` ON `pra`.`paymentIntentId` = `spi`.`id` '
      + 'SET `spi`.`paymentRequestId` = `pra`.`paymentRequestUuid`',
    );

    await queryRunner.createForeignKey('stripe_payment_intent', new TableForeignKey({
      columnNames: ['paymentRequestId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'payment_request',
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createIndex('stripe_payment_intent', new TableIndex({
      name: 'IDX_stripe_payment_intent_paymentRequestId',
      columnNames: ['paymentRequestId'],
    }));

    // Drop the join table.
    await queryRunner.dropIndex('payment_request_attempt', 'IDX_payment_request_attempt_paymentIntentId');

    const table = await queryRunner.getTable('payment_request_attempt');
    if (table) {
      const paymentIntentFk = table.foreignKeys.find(f => f.columnNames.indexOf('paymentIntentId') !== -1);
      if (paymentIntentFk) await queryRunner.dropForeignKey('payment_request_attempt', paymentIntentFk);
      const paymentRequestFk = table.foreignKeys.find(f => f.columnNames.indexOf('paymentRequestUuid') !== -1);
      if (paymentRequestFk) await queryRunner.dropForeignKey('payment_request_attempt', paymentRequestFk);
    }

    await queryRunner.dropTable('payment_request_attempt');
  }

}
