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
import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class AddWrappedOrganMember1765826596888 implements MigrationInterface {
  private WRAPPED_ORGAN_MEMBER_TABLE = 'wrapped_organ_member';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: this.WRAPPED_ORGAN_MEMBER_TABLE,
        columns: [
          {
            name: 'createdAt',
            type: 'datetime(6)',
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'datetime(6)',
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
          {
            name: 'version',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'int',
            isPrimary: true,
          },
          {
            name: 'organId',
            type: 'int',
            isPrimary: true,
          },
          {
            name: 'ordinalTransactionCreated',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'ordinalTurnoverCreated',
            type: 'int',
            isNullable: false,
            default: '0',
          },
        ],
        indices: [
          {
            name: 'IDX_wrapped_organ_member_createdAt',
            columnNames: ['createdAt'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      this.WRAPPED_ORGAN_MEMBER_TABLE,
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'wrapped',
        referencedColumnNames: ['userId'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
        name: 'FK_wrapped_organ_member_userId_wrapped',
      }),
    );

    await queryRunner.createForeignKey(
      this.WRAPPED_ORGAN_MEMBER_TABLE,
      new TableForeignKey({
        columnNames: ['organId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_wrapped_organ_member_organId_user',
      }),
    );

    await queryRunner.createForeignKey(
      this.WRAPPED_ORGAN_MEMBER_TABLE,
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_wrapped_organ_member_userId_user',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(this.WRAPPED_ORGAN_MEMBER_TABLE, 'FK_wrapped_organ_member_userId_wrapped');
    await queryRunner.dropForeignKey(this.WRAPPED_ORGAN_MEMBER_TABLE, 'FK_wrapped_organ_member_organId_user');
    await queryRunner.dropForeignKey(this.WRAPPED_ORGAN_MEMBER_TABLE, 'FK_wrapped_organ_member_userId_user');
    await queryRunner.dropTable(this.WRAPPED_ORGAN_MEMBER_TABLE, true);
  }
}

