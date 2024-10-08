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

import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class SoftDeletes1720608140757 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('product', new TableColumn({
      name: 'deletedAt',
      type: 'datetime(6)',
      isNullable: true,
    }));
    await queryRunner.addColumn('container', new TableColumn({
      name: 'deletedAt',
      type: 'datetime(6)',
      isNullable: true,
    }));
    await queryRunner.addColumn('point_of_sale', new TableColumn({
      name: 'deletedAt',
      type: 'datetime(6)',
      isNullable: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE product DROP COLUMN deletedAt');
    await queryRunner.query('ALTER TABLE container DROP COLUMN deletedAt');
    await queryRunner.query('ALTER TABLE point_of_sale DROP COLUMN deletedAt');
  }

}
