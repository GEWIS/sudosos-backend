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

import Database from '../../src/database/database';
import { DataSource } from 'typeorm';
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
      for (const entity of entities) {
        const tableName = entity.tableName;
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        const table = await queryRunner.getTable(tableName);
        const tableFks: any[] = table.foreignKeys.map(relation => {
          return {
            columnNames: relation.columnNames,
            referencedTableName: relation.referencedTableName,
            referencedColumnNames: relation.referencedColumnNames,
            onDelete: relation.onDelete,
            onUpdate: relation.onUpdate,
          };
        });

        const entityFks: any = [];

        entity.relations.forEach(relation => {
          relation.foreignKeys.forEach(fk => {
            entityFks.push({
              columnNames: fk.columnNames,
              referencedTableName: fk.referencedTablePath,
              referencedColumnNames: fk.referencedColumnNames,
              onDelete: fk.onDelete,
              onUpdate: fk.onUpdate,
            });
          });
        });

        expect(tableFks, `Matching entity ${entity.name} foreign keys`).to.deep.equalInAnyOrder(entityFks);
      }
    });
  });
});
