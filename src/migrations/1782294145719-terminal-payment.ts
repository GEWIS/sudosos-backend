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

export class TerminalPayment1782294145719 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // tmp_transaction (concrete-table inheritance of transaction)
    await queryRunner.createTable(new Table({
      name: 'tmp_transaction',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
          isNullable: false,
        },
        {
          name: 'fromId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'createdById',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'pointOfSalePointOfSaleId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'pointOfSaleRevision',
          type: 'integer',
          isNullable: true,
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

    await queryRunner.createForeignKey('tmp_transaction', new TableForeignKey({
      columnNames: ['fromId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_transaction', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_transaction', new TableForeignKey({
      columnNames: ['pointOfSalePointOfSaleId', 'pointOfSaleRevision'],
      referencedColumnNames: ['pointOfSaleId', 'revision'],
      referencedTableName: 'point_of_sale_revision',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createIndex('tmp_transaction', new TableIndex({
      name: 'IDX_tmp_transaction_createdAt',
      columnNames: ['createdAt'],
    }));

    // tmp_sub_transaction (concrete-table inheritance of sub_transaction)
    await queryRunner.createTable(new Table({
      name: 'tmp_sub_transaction',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
          isNullable: false,
        },
        {
          name: 'toId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'containerContainerId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'containerRevision',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'transactionId',
          type: 'integer',
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

    await queryRunner.createForeignKey('tmp_sub_transaction', new TableForeignKey({
      columnNames: ['toId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_sub_transaction', new TableForeignKey({
      columnNames: ['containerContainerId', 'containerRevision'],
      referencedColumnNames: ['containerId', 'revision'],
      referencedTableName: 'container_revision',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_sub_transaction', new TableForeignKey({
      columnNames: ['transactionId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'tmp_transaction',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    }));

    await queryRunner.createIndex('tmp_sub_transaction', new TableIndex({
      name: 'IDX_tmp_sub_transaction_createdAt',
      columnNames: ['createdAt'],
    }));

    // tmp_sub_transaction_row (concrete-table inheritance of sub_transaction_row)
    await queryRunner.createTable(new Table({
      name: 'tmp_sub_transaction_row',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
          isNullable: false,
        },
        {
          name: 'amount',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'productProductId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'productRevision',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'invoiceId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'subTransactionId',
          type: 'integer',
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

    await queryRunner.createForeignKey('tmp_sub_transaction_row', new TableForeignKey({
      columnNames: ['productProductId', 'productRevision'],
      referencedColumnNames: ['productId', 'revision'],
      referencedTableName: 'product_revision',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_sub_transaction_row', new TableForeignKey({
      columnNames: ['invoiceId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'invoice',
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('tmp_sub_transaction_row', new TableForeignKey({
      columnNames: ['subTransactionId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'tmp_sub_transaction',
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createIndex('tmp_sub_transaction_row', new TableIndex({
      name: 'IDX_tmp_sub_transaction_row_createdAt',
      columnNames: ['createdAt'],
    }));

    // terminal_payment
    await queryRunner.createTable(new Table({
      name: 'terminal_payment',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
          isNullable: false,
        },
        {
          name: 'stripePaymentIntentId',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'transferId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'finalTransactionId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'temporaryTransactionId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'createdById',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'processedByTerminal',
          type: 'varchar',
          length: '255',
          isNullable: true,
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

    await queryRunner.createForeignKey('terminal_payment', new TableForeignKey({
      columnNames: ['stripePaymentIntentId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'stripe_payment_intent',
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('terminal_payment', new TableForeignKey({
      columnNames: ['transferId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'transfer',
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('terminal_payment', new TableForeignKey({
      columnNames: ['finalTransactionId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'transaction',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('terminal_payment', new TableForeignKey({
      columnNames: ['temporaryTransactionId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'tmp_transaction',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createForeignKey('terminal_payment', new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    // One-to-one relations: enforce uniqueness on the owning join columns
    await queryRunner.createIndex('terminal_payment', new TableIndex({
      name: 'IDX_terminal_payment_stripePaymentIntentId',
      columnNames: ['stripePaymentIntentId'],
      isUnique: true,
    }));

    await queryRunner.createIndex('terminal_payment', new TableIndex({
      name: 'IDX_terminal_payment_transferId',
      columnNames: ['transferId'],
      isUnique: true,
    }));

    await queryRunner.createIndex('terminal_payment', new TableIndex({
      name: 'IDX_terminal_payment_finalTransactionId',
      columnNames: ['finalTransactionId'],
      isUnique: true,
    }));

    await queryRunner.createIndex('terminal_payment', new TableIndex({
      name: 'IDX_terminal_payment_temporaryTransactionId',
      columnNames: ['temporaryTransactionId'],
      isUnique: true,
    }));

    await queryRunner.createIndex('terminal_payment', new TableIndex({
      name: 'IDX_terminal_payment_createdAt',
      columnNames: ['createdAt'],
    }));

    // stripe_payment_intent: track API-initiated cancellation
    await queryRunner.addColumn('stripe_payment_intent', new TableColumn({
      name: 'cancelledWithAPI',
      type: 'boolean',
      default: false,
      isNullable: false,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('stripe_payment_intent', 'cancelledWithAPI');

    // terminal_payment
    await queryRunner.dropIndex('terminal_payment', 'IDX_terminal_payment_createdAt');
    await queryRunner.dropIndex('terminal_payment', 'IDX_terminal_payment_temporaryTransactionId');
    await queryRunner.dropIndex('terminal_payment', 'IDX_terminal_payment_finalTransactionId');
    await queryRunner.dropIndex('terminal_payment', 'IDX_terminal_payment_transferId');
    await queryRunner.dropIndex('terminal_payment', 'IDX_terminal_payment_stripePaymentIntentId');

    const terminalPayment = await queryRunner.getTable('terminal_payment');
    if (terminalPayment) {
      const createdByFk = terminalPayment.foreignKeys.find(f => f.columnNames.indexOf('createdById') !== -1);
      if (createdByFk) await queryRunner.dropForeignKey('terminal_payment', createdByFk);
      const temporaryTransactionFk = terminalPayment.foreignKeys.find(f => f.columnNames.indexOf('temporaryTransactionId') !== -1);
      if (temporaryTransactionFk) await queryRunner.dropForeignKey('terminal_payment', temporaryTransactionFk);
      const finalTransactionFk = terminalPayment.foreignKeys.find(f => f.columnNames.indexOf('finalTransactionId') !== -1);
      if (finalTransactionFk) await queryRunner.dropForeignKey('terminal_payment', finalTransactionFk);
      const transferFk = terminalPayment.foreignKeys.find(f => f.columnNames.indexOf('transferId') !== -1);
      if (transferFk) await queryRunner.dropForeignKey('terminal_payment', transferFk);
      const stripePaymentIntentFk = terminalPayment.foreignKeys.find(f => f.columnNames.indexOf('stripePaymentIntentId') !== -1);
      if (stripePaymentIntentFk) await queryRunner.dropForeignKey('terminal_payment', stripePaymentIntentFk);
    }
    await queryRunner.dropTable('terminal_payment');

    // tmp_sub_transaction_row
    await queryRunner.dropIndex('tmp_sub_transaction_row', 'IDX_tmp_sub_transaction_row_createdAt');
    const tmpSubTransactionRow = await queryRunner.getTable('tmp_sub_transaction_row');
    if (tmpSubTransactionRow) {
      const subTransactionFk = tmpSubTransactionRow.foreignKeys.find(f => f.columnNames.indexOf('subTransactionId') !== -1);
      if (subTransactionFk) await queryRunner.dropForeignKey('tmp_sub_transaction_row', subTransactionFk);
      const invoiceFk = tmpSubTransactionRow.foreignKeys.find(f => f.columnNames.indexOf('invoiceId') !== -1);
      if (invoiceFk) await queryRunner.dropForeignKey('tmp_sub_transaction_row', invoiceFk);
      const productFk = tmpSubTransactionRow.foreignKeys.find(f => f.columnNames.indexOf('productProductId') !== -1);
      if (productFk) await queryRunner.dropForeignKey('tmp_sub_transaction_row', productFk);
    }
    await queryRunner.dropTable('tmp_sub_transaction_row');

    // tmp_sub_transaction
    await queryRunner.dropIndex('tmp_sub_transaction', 'IDX_tmp_sub_transaction_createdAt');
    const tmpSubTransaction = await queryRunner.getTable('tmp_sub_transaction');
    if (tmpSubTransaction) {
      const transactionFk = tmpSubTransaction.foreignKeys.find(f => f.columnNames.indexOf('transactionId') !== -1);
      if (transactionFk) await queryRunner.dropForeignKey('tmp_sub_transaction', transactionFk);
      const containerFk = tmpSubTransaction.foreignKeys.find(f => f.columnNames.indexOf('containerContainerId') !== -1);
      if (containerFk) await queryRunner.dropForeignKey('tmp_sub_transaction', containerFk);
      const toFk = tmpSubTransaction.foreignKeys.find(f => f.columnNames.indexOf('toId') !== -1);
      if (toFk) await queryRunner.dropForeignKey('tmp_sub_transaction', toFk);
    }
    await queryRunner.dropTable('tmp_sub_transaction');

    // tmp_transaction
    await queryRunner.dropIndex('tmp_transaction', 'IDX_tmp_transaction_createdAt');
    const tmpTransaction = await queryRunner.getTable('tmp_transaction');
    if (tmpTransaction) {
      const pointOfSaleFk = tmpTransaction.foreignKeys.find(f => f.columnNames.indexOf('pointOfSalePointOfSaleId') !== -1);
      if (pointOfSaleFk) await queryRunner.dropForeignKey('tmp_transaction', pointOfSaleFk);
      const createdByFk = tmpTransaction.foreignKeys.find(f => f.columnNames.indexOf('createdById') !== -1);
      if (createdByFk) await queryRunner.dropForeignKey('tmp_transaction', createdByFk);
      const fromFk = tmpTransaction.foreignKeys.find(f => f.columnNames.indexOf('fromId') !== -1);
      if (fromFk) await queryRunner.dropForeignKey('tmp_transaction', fromFk);
    }
    await queryRunner.dropTable('tmp_transaction');
  }

}
