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

import Database from '../../src/database/database';
import { DataSource, TableForeignKey } from 'typeorm';
import { expect } from 'chai';
import { finishTestDB } from '../helpers/test-helpers';

describe('Database', async (): Promise<void> => {
  describe('#initialize', () => {
    it('should be able to synchronize schema', async function () {
      if (process.env.TYPEORM_CONNECTION !== 'sqlite') this.skip();
      const connection = await Database.initialize();
      await connection.synchronize();
      await connection.destroy();
    });
  });
  describe('#generate', async () => {
    let dataSource: DataSource;

    before(async function () {
      dataSource = await Database.initialize();
    });

    after(async () => {
      await finishTestDB(dataSource);
    });

    function normalizeType(type: any): string[] {
      const typeMap: { [key: string]: string[] } = {
        'number': ['int', 'integer', 'smallint', 'mediumint', 'bigint'],
        'string': ['varchar', 'text', 'char', 'nchar'],
        'boolean': ['boolean', 'bit', 'tinyint'],
        'date': ['timestamp', 'datetime', 'date'],
        'double': ['double', 'float', 'double precision'],
        'bigint': ['bigint'],
        'float': ['real', 'float'],
        'integer': ['integer', 'int'],
      };

      if (typeof type === 'function') {
        return typeMap[type.name.toLowerCase()] || [type.name.toLowerCase()];
      } else if (typeof type === 'string') {
        return typeMap[type.toLowerCase()] || [type.toLowerCase()];
      }
      return [type];
    }

    it('should match the database schema with entity definition after migrations', async () => {

      const entities = dataSource.entityMetadatas;

      for (const entity of entities) {
        const tableName = entity.tableName;
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        const table = await queryRunner.getTable(tableName);
        const databaseColumns = table.columns.map(column => column.name);
        const entityColumns = entity.columns.map(column => column.databaseName);

        expect(databaseColumns.sort()).to.deep.equalInAnyOrder(entityColumns.sort());

        entity.columns.forEach(column => {
          const normalizedTypes = normalizeType(column.type);
          const matchedColumn = table.columns.find(dbColumn => dbColumn.name === column.databaseName);
          expect(matchedColumn, `expect column ${entity.name}.${column.propertyName} to not be undefined`).to.not.be.undefined;
          expect(normalizedTypes, `expect column ${entity.name}.${column.propertyName} type to match`).to.include(matchedColumn.type);

          expect(matchedColumn.isGenerated, `expect column ${entity.name}.${column.propertyName} to ${column.isGenerated ? '' : 'not '}be generated`).to.eq(column.isGenerated);
          expect(matchedColumn.isArray, `expect column ${entity.name}.${column.propertyName} to ${column.isArray ? '' : 'not '}be an array`).to.eq(column.isArray);
          expect(matchedColumn.isNullable, `expect column ${entity.name}.${column.propertyName} to ${column.isNullable ? '' : 'not '}be nullable`).to.eq(column.isNullable);
          expect(matchedColumn.isPrimary, `expect column ${entity.name}.${column.propertyName} to ${column.isPrimary ? '' : 'not '}be primary`).to.eq(column.isPrimary);
        });

        await queryRunner.release();
      }
    });

    it('should match the database relations with entity definition after migrations', async () => {
      const entities = dataSource.entityMetadatas;
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();

      for (const entity of entities) {
        const tableName = entity.tableName;

        // Skip junction tables, they are not actual entities but tables created by TypeORM for ManyToMany relationships
        if (tableName.includes('_') && (
          tableName.includes('_roles_role') ||
          tableName.includes('_products_product') ||
          tableName.includes('_containers_container') ||
          tableName.includes('_shifts_') ||
          tableName.includes('_del_') ||
          tableName.includes('_closure')
        )) {
          continue;
        }

        const table = await queryRunner.getTable(tableName);
        const tableFks: any[] = table.foreignKeys.map((relation: TableForeignKey) => {
          return {
            columnNames: relation.columnNames,
            referencedTableName: relation.referencedTableName,
            referencedColumnNames: relation.referencedColumnNames,
            onDelete: relation.onDelete,
            onUpdate: relation.onUpdate,
            // fkName: relation.name,
            tableName,
          };
        });

        const entityFks: any = [];

        entity.relations.forEach(relation => {
          // Skip ManyToMany relations as their foreign keys are in junction tables, not the main table
          if (relation.relationType === 'many-to-many') {
            return;
          }

          relation.foreignKeys.forEach(fk => {
            entityFks.push({
              columnNames: fk.columnNames,
              referencedTableName: fk.referencedTablePath,
              referencedColumnNames: fk.referencedColumnNames,
              onDelete: fk.onDelete,
              onUpdate: fk.onUpdate,
              // fkName: fk.name,
              tableName,
            });
          });
        });

        const names = table.foreignKeys.map(fk => fk.name);
        expect(tableFks).to.deep.equalInAnyOrder(entityFks, names.join(','));
      }

      await queryRunner.release();
    });

    it('should match junction table foreign keys for ManyToMany relationships', async () => {
      const entities = dataSource.entityMetadatas;
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();

      for (const entity of entities) {
        for (const relation of entity.relations) {
          // Only check ManyToMany relations
          if (relation.relationType !== 'many-to-many') {
            continue;
          }

          // Get the junction table name
          const junctionTableName = relation.joinTableName;
          if (!junctionTableName) {
            continue;
          }

          // Get the junction table from database
          const junctionTable = await queryRunner.getTable(junctionTableName);
          if (!junctionTable) {
            throw new Error(`Junction table ${junctionTableName} not found in database`);
          }

          // Get foreign keys from junction table
          const junctionTableFks = junctionTable.foreignKeys.map((fk: TableForeignKey) => ({
            columnNames: fk.columnNames,
            referencedTableName: fk.referencedTableName,
            referencedColumnNames: fk.referencedColumnNames,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
            // fkName: fk.name,
            tableName: junctionTableName,
          }));

          // Get expected foreign keys from entity relation
          const expectedFks = relation.foreignKeys.map(fk => ({
            columnNames: fk.columnNames,
            referencedTableName: fk.referencedTablePath,
            referencedColumnNames: fk.referencedColumnNames,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
            // fkName: fk.name,
            tableName: junctionTableName,
          }));

          const names = junctionTable.foreignKeys.map(fk => fk.name);
          expect(junctionTableFks).to.deep.equalInAnyOrder(expectedFks, names.join(','));
        }
      }

      await queryRunner.release();
    });
  });
});
