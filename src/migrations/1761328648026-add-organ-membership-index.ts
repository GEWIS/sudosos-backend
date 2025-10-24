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
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOrganMembershipIndex1761328648026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the column as nullable first to allow us to assign indices
    await queryRunner.addColumn('organ_membership', new TableColumn({
      name: 'index',
      type: 'int',
      isNullable: true,
    }));

    // Assign sequential indices to existing rows, grouped by organId
    // This ensures each organ's members get indices 0, 1, 2, etc.
    const existingMemberships = await queryRunner.query(
      'SELECT userId, organId FROM organ_membership ORDER BY organId, userId'
    );

    if (existingMemberships.length > 0) {
      // Group by organId and assign indices
      const organIndices: { [organId: number]: number } = {};
      
      for (const membership of existingMemberships) {
        const organId = membership.organId;
        
        if (!(organId in organIndices)) {
          organIndices[organId] = 0;
        }
        
        const index = organIndices[organId];
        organIndices[organId]++;
        
        await queryRunner.query(
          'UPDATE organ_membership SET `index` = ? WHERE userId = ? AND organId = ?',
          [index, membership.userId, organId]
        );
      }
    }

    // Now make the column non-nullable with default 0
    await queryRunner.changeColumn('organ_membership', 'index', new TableColumn({
      name: 'index',
      type: 'int',
      isNullable: false,
      default: 0,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('organ_membership', 'index');
  }
}

