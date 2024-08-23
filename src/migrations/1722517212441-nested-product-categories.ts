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
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class NestedProductCategories1722517212441 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('product_category', new TableColumn({
      name: 'parentId',
      type: 'integer',
      isNullable: true,
    }));
    await queryRunner.createForeignKey('product_category', new TableForeignKey({
      columnNames: ['parentId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'product_category',
    }));
    await queryRunner.createTable(new Table({
      name: 'product_category_closure',
      columns: [{
        name: 'id_ancestor',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }, {
        name: 'id_descendant',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }],
    }));
    await queryRunner.createForeignKeys('product_category_closure', [
      new TableForeignKey({
        columnNames: ['id_ancestor'],
        referencedColumnNames: ['id'],
        referencedTableName: 'product_category',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['id_descendant'],
        referencedColumnNames: ['id'],
        referencedTableName: 'product_category',
        onDelete: 'CASCADE',
      }),
    ]);
    await queryRunner.query(`
      INSERT INTO product_category_closure (id_ancestor, id_descendant)
      SELECT id, id FROM product_category
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const categoryTable = await queryRunner.getTable('product_category');
    const parentForeignKeys = categoryTable.foreignKeys.filter((fk) => fk.columnNames.includes('parentId'));
    await queryRunner.dropForeignKeys(categoryTable, parentForeignKeys);
    await queryRunner.dropColumn(categoryTable, 'parentId');

    await queryRunner.dropTable('product_category_closure');
  }
}
