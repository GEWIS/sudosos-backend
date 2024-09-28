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

/**
 * @module
 * @hidden
 */

import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class PosCashiers1722022351000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'point_of_sale_cashier_roles_role',
      columns: [new TableColumn({
        name: 'pointOfSaleId',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }), new TableColumn({
        name: 'roleId',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      })],
    }));
    await queryRunner.createForeignKey('point_of_sale_cashier_roles_role', new TableForeignKey({
      columnNames: ['pointOfSaleId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'point_of_sale',
      onDelete: 'CASCADE',
    }));
    await queryRunner.createForeignKey('point_of_sale_cashier_roles_role', new TableForeignKey({
      columnNames: ['roleId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'role',
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('point_of_sale_cashier_roles_role');
  }
}
