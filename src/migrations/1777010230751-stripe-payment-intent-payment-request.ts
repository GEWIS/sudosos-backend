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

import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class StripePaymentIntentPaymentRequest1777010230751 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('stripe_payment_intent', new TableColumn({
      name: 'paymentRequestId',
      type: 'varchar',
      length: '36',
      isNullable: true,
      default: null,
    }));

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('stripe_payment_intent', 'IDX_stripe_payment_intent_paymentRequestId');

    const table = await queryRunner.getTable('stripe_payment_intent');
    if (table) {
      const paymentRequestFk = table.foreignKeys.find(f => f.columnNames.indexOf('paymentRequestId') !== -1);
      if (paymentRequestFk) await queryRunner.dropForeignKey('stripe_payment_intent', paymentRequestFk);
    }

    await queryRunner.dropColumn('stripe_payment_intent', 'paymentRequestId');
  }

}
