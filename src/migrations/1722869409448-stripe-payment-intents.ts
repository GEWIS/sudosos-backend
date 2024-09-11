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

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class StripePaymentIntents1722869409448 implements MigrationInterface {
  private DEPOSIT_TABLE_NAME = 'stripe_deposit';

  private PAYMENT_INTENT_TABLE_NAME = 'stripe_payment_intent';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameTable(this.DEPOSIT_TABLE_NAME, this.PAYMENT_INTENT_TABLE_NAME);
    await queryRunner.createTable(new Table({
      name: this.DEPOSIT_TABLE_NAME,
      columns: [
        {
          name: 'createdAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          onUpdate: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'version',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
        },
        {
          name: 'toId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'transferId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'stripePaymentIntentId',
          type: 'integer',
          isNullable: false,
        },
      ],
    }));

    await queryRunner.createForeignKeys(this.DEPOSIT_TABLE_NAME, [
      new TableForeignKey({
        columnNames: ['toId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['transferId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'transfer',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['stripePaymentIntentId'],
        referencedColumnNames: ['id'],
        referencedTableName: this.PAYMENT_INTENT_TABLE_NAME,
        onDelete: 'RESTRICT',
      }),
    ]);

    await queryRunner.query(`
INSERT INTO ${this.DEPOSIT_TABLE_NAME} (id, createdAt, updatedAt, version, toId, transferId, stripePaymentIntentId)
SELECT id, createdAt, updatedAt, version, toId, transferId, id FROM ${this.PAYMENT_INTENT_TABLE_NAME}
`);

    const table = await queryRunner.getTable(this.PAYMENT_INTENT_TABLE_NAME);
    const foreignKeys = table.foreignKeys.filter((fk) => fk.columnNames.some((n) => ['toId', 'transferId'].includes(n)));
    await queryRunner.dropForeignKeys(this.PAYMENT_INTENT_TABLE_NAME, foreignKeys);

    await queryRunner.dropColumns(this.PAYMENT_INTENT_TABLE_NAME, ['toId', 'transferId']);

    await queryRunner.renameTable('stripe_deposit_status', 'stripe_payment_intent_status');
    await queryRunner.renameColumn('stripe_payment_intent_status', 'depositId', 'stripePaymentIntentId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('stripe_payment_intent_status', 'stripePaymentIntentId', 'depositId');
    await queryRunner.renameTable('stripe_payment_intent_status', 'stripe_deposit_status');

    const depositTable = await queryRunner.getTable(this.DEPOSIT_TABLE_NAME);
    const foreignKeys = depositTable.foreignKeys.filter((fk) => fk.referencedTableName === this.PAYMENT_INTENT_TABLE_NAME);
    await queryRunner.dropForeignKeys(depositTable, foreignKeys);

    const paymentIntentTable = await queryRunner.getTable(this.PAYMENT_INTENT_TABLE_NAME);
    const paymentIntentStatusTable = await queryRunner.getTable('stripe_deposit_status');
    await queryRunner.dropForeignKeys(paymentIntentStatusTable, paymentIntentStatusTable.foreignKeys);
    await queryRunner.dropForeignKeys(paymentIntentTable, paymentIntentTable.foreignKeys);
    await queryRunner.addColumns(this.PAYMENT_INTENT_TABLE_NAME, [
      new TableColumn(
        {
          name: 'toId',
          type: 'integer',
          isNullable: true,
        }),
      new TableColumn({
        name: 'transferId',
        type: 'integer',
        isNullable: true,
      }),
    ]);
    await queryRunner.createForeignKeys(this.PAYMENT_INTENT_TABLE_NAME, [
      ...paymentIntentTable.foreignKeys,
      new TableForeignKey({
        columnNames: ['toId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['transferId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'transfer',
        onDelete: 'RESTRICT',
      }),
    ]);
    await queryRunner.createForeignKeys(paymentIntentStatusTable, paymentIntentStatusTable.foreignKeys);

    await queryRunner.query(`
UPDATE ${this.PAYMENT_INTENT_TABLE_NAME}
SET
  toId=(SELECT toId FROM ${this.DEPOSIT_TABLE_NAME} WHERE ${this.DEPOSIT_TABLE_NAME}.id = ${this.PAYMENT_INTENT_TABLE_NAME}.id),
  transferId=(SELECT transferId FROM ${this.DEPOSIT_TABLE_NAME} WHERE ${this.DEPOSIT_TABLE_NAME}.id = ${this.PAYMENT_INTENT_TABLE_NAME}.id)
`);

    await queryRunner.changeColumn(
      this.PAYMENT_INTENT_TABLE_NAME,
      'toId',
      new TableColumn(
        {
          name: 'toId',
          type: 'integer',
          isNullable: false,
        }),
    );
    await queryRunner.changeColumn(
      this.PAYMENT_INTENT_TABLE_NAME,
      'transferId',
      new TableColumn({
        name: 'transferId',
        type: 'integer',
        isNullable: true,
      }),
    );

    const table = await queryRunner.getTable(this.DEPOSIT_TABLE_NAME);
    await queryRunner.dropForeignKeys(this.DEPOSIT_TABLE_NAME, table.foreignKeys);
    await queryRunner.dropTable(this.DEPOSIT_TABLE_NAME);
    await queryRunner.renameTable(this.PAYMENT_INTENT_TABLE_NAME, this.DEPOSIT_TABLE_NAME);
  }
}
