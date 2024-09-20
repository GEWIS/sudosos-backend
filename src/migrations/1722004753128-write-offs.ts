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
 * @hidden
 */

import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import { getAdminPermissions } from './1720624912260-database-rbac';

export class WriteOffs1722004753128 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'write_off',
      columns: [
        {
          name: 'createdAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'current_timestamp',
          onUpdate: 'current_timestamp',
          isNullable: false,
        },
        {
          name: 'version',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'id',
          type: 'integer',
          isPrimary: true,
          isGenerated: true,
          generationStrategy: 'increment',
        },
        {
          name: 'transferId',
          type: 'integer',
          isNullable: true,
        },
        {
          name: 'amount',
          type: 'integer',
          isNullable: false,
        },
        {
          name: 'toId',
          type: 'integer',
          isNullable: false,
        },
      ],
    }), true);

    await queryRunner.createForeignKey('write_off', new TableForeignKey({
      name: 'FK_write_off_transferId',
      columnNames: ['transferId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'transfer',
      onDelete: 'CASCADE',
    }));

    await queryRunner.createForeignKey('write_off', new TableForeignKey({
      name: 'FK_write_off_toId',
      columnNames: ['toId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'CASCADE',
    }));

    const roleRepo = queryRunner.manager.getRepository(Role);
    const permissionRepo = queryRunner.manager.getRepository(Permission);

    await roleRepo.findOne({ where: { name: 'SudoSOS - BAC PM' }, relations: ['permissions'] }).then(async (role) => {
      if (!role) return;
      await permissionRepo.save(getAdminPermissions(role, 'WriteOff') );
    });

    await roleRepo.findOne({ where: { name: 'SudoSOS - Audit' }, relations: ['permissions'] }).then(async (role) => {
      if (!role) return;
      await permissionRepo.save([
        { roleId: role.id, role, entity: 'WriteOff', action: 'get', relation: 'all', attributes: ['*'] },
      ]);
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('write_off');
    const permissions = await queryRunner.manager.getRepository(Permission).find({ where: { entity: 'WriteOff' } });
    await queryRunner.manager.getRepository(Permission).remove(permissions);
  }
}
