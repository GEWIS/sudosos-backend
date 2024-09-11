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
 */
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class SellerPayoutPdf1726066600389 implements MigrationInterface {

  private SELLER_PAYOUT_PDF_TABLE = 'seller_payout_pdf';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns(this.SELLER_PAYOUT_PDF_TABLE, [
      new TableColumn({
        name: 'createdAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        isNullable: false,
      }),
      new TableColumn({
        name: 'updatedAt',
        type: 'datetime(6)',
        default: 'current_timestamp',
        onUpdate: 'current_timestamp',
        isNullable: false,
      }),
      new TableColumn({
        name: 'version',
        type: 'integer',
        isNullable: false,
      }),
      new TableColumn({
        name: 'createdById',
        type: 'integer',
        isNullable: false,
      })]);

    await queryRunner.createForeignKey(this.SELLER_PAYOUT_PDF_TABLE, new TableForeignKey({
      columnNames: ['createdById'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const payoutRequestPdfTable = await queryRunner.getTable(this.SELLER_PAYOUT_PDF_TABLE);
    const createdByForeignKey = payoutRequestPdfTable.foreignKeys.find(fk => fk.columnNames.indexOf('createdById') !== -1);
    await queryRunner.dropForeignKey(this.SELLER_PAYOUT_PDF_TABLE, createdByForeignKey);

    await queryRunner.dropColumn(this.SELLER_PAYOUT_PDF_TABLE, 'createdById');
    await queryRunner.dropColumn(this.SELLER_PAYOUT_PDF_TABLE, 'createdAt');
    await queryRunner.dropColumn(this.SELLER_PAYOUT_PDF_TABLE, 'updatedAt');
    await queryRunner.dropColumn(this.SELLER_PAYOUT_PDF_TABLE, 'version');
  }
}
