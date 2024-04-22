/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
import Database from '../../src/database/database';
import { expect } from 'chai';
import { Connection } from 'typeorm';

describe('Database', (): void => {
  describe('#initialize', () => {
    it('should be able to synchronize schema', async () => {
      const connection = await Database.initialize();
      await connection.synchronize();
      await connection.close();
    });
  });
  describe('#generate', () => {
    let dataSource: Connection;

    before(async () => {
      dataSource = await Database.initialize();
    });

    after(async () => {
      await dataSource.destroy();
    });

    const typeMap: { [key: string]: string } = {
      'Number': 'integer',
      'String': 'varchar',
      'Boolean': 'boolean',
    };

    it('should match the database schema with entity definition after migrations', async () => {
      const entities = dataSource.entityMetadatas;

      await dataSource.runMigrations({ transaction: 'all', fake: true });
      await dataSource.undoLastMigration({ transaction: 'all' });
      await dataSource.runMigrations({ transaction: 'all' });

      for (const entity of entities) {
        const tableName = entity.tableName;
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();

        const table = await queryRunner.getTable(tableName);
        const databaseColumns = table.columns.map(column => column.name);
        const entityColumns = entity.columns.map(column => column.databaseName);

        expect(databaseColumns.sort()).to.deep.equalInAnyOrder(entityColumns.sort());

        entity.columns.forEach(column => {
          const matchedColumn = table.columns.find(dbColumn => dbColumn.name === column.databaseName);

          // Edge case for generated columns
          if ((column.type as Function).name) {
            const func = column.type as Function;
            expect(typeMap[func.name]).to.eq(matchedColumn.type);
          } else {
            expect(matchedColumn.type).to.eq(column.type);
          }
          expect(matchedColumn.isGenerated).to.eq(column.isGenerated);
          expect(matchedColumn.isArray).to.eq(column.isArray);
          expect(matchedColumn.isNullable).to.eq(column.isNullable);
          expect(matchedColumn.isPrimary).to.eq(column.isPrimary);
        });

        await queryRunner.release();
      }
    });
  });
});
