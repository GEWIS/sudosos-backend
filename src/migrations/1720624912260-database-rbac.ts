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
import AssignedRole from '../entity/rbac/assigned-role';
import Role from '../entity/rbac/role';

export class DatabaseRbac1720624912620 implements MigrationInterface {
  private ROLE_TABLE = 'role';

  private PERMISSION_TABLE = 'permission';

  private ASSIGNED_USER_TYPE_TABLE = 'role_user_type';

  private ASSIGNED_ROLE_TABLE = 'assigned_role';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: this.ROLE_TABLE,
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
          name: 'name',
          type: 'varchar(255)',
          isNullable: false,
          isUnique: true,
        },
        {
          name: 'systemDefault',
          type: 'boolean',
          default: 0,
          isNullable: false,
          isUnique: false,
        },
      ],
    }));

    await queryRunner.createTable(new Table({
      name: this.PERMISSION_TABLE,
      columns: [
        {
          name: 'roleId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'action',
          type: 'varchar(255)',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'relation',
          type: 'varchar(255)',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'entity',
          type: 'varchar(255)',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'attributes',
          type: 'text',
          isNullable: false,
        },
      ],
    }));

    await queryRunner.createForeignKey(this.PERMISSION_TABLE, new TableForeignKey({
      columnNames: ['roleId'],
      referencedColumnNames: ['id'],
      referencedTableName: this.ROLE_TABLE,
      onDelete: 'CASCADE',
    }));

    await queryRunner.createTable(new Table({
      name: this.ASSIGNED_USER_TYPE_TABLE,
      columns: [
        {
          name: 'roleId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'userType',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
      ],
    }));

    await queryRunner.createForeignKey(this.ASSIGNED_USER_TYPE_TABLE, new TableForeignKey({
      columnNames: ['roleId'],
      referencedColumnNames: ['id'],
      referencedTableName: this.ROLE_TABLE,
      onDelete: 'CASCADE',
    }));

    const roleNames: { role: string }[] = await AssignedRole.getRepository().createQueryBuilder()
      .select('role')
      .groupBy('role')
      .getRawMany();

    const roles = new Map<string, Role>();
    for (const { role } of roleNames) {
      roles.set(role, await Role.save({ name: role }));
    }

    await queryRunner.addColumn(this.ASSIGNED_ROLE_TABLE, new TableColumn({
      name: 'roleId',
      type: 'integer',
      isNullable: true, // Temporarily nullable
    }));

    await Promise.all(Array.from(roles.values()).map((role) => {
      return queryRunner.query(`UPDATE ${this.ASSIGNED_ROLE_TABLE} SET roleId = ${role.id} WHERE role = '${role.name}'`);
    }));

    await queryRunner.changeColumn(this.ASSIGNED_ROLE_TABLE, 'roleId', new TableColumn({
      name: 'roleId',
      type: 'integer',
      isNullable: false,
      isPrimary: true,
    }));

    await queryRunner.dropColumn(this.ASSIGNED_ROLE_TABLE, 'role');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(this.ASSIGNED_ROLE_TABLE, new TableColumn({
      name: 'role',
      type: 'varchar(255)',
      isNullable: true,
    }));

    await queryRunner.query(`UPDATE ${this.ASSIGNED_ROLE_TABLE} AS a SET role = (SELECT name FROM ${this.ROLE_TABLE} WHERE ${this.ROLE_TABLE}.id = a.roleId)`);
    await queryRunner.query(`DELETE FROM ${this.ASSIGNED_ROLE_TABLE} WHERE role IS NULL`);

    await queryRunner.changeColumn(this.ASSIGNED_ROLE_TABLE, 'role', new TableColumn({
      name: 'role',
      type: 'varchar(255)',
      isNullable: false,
      isPrimary: true,
    }));
    await queryRunner.dropColumn(this.ASSIGNED_ROLE_TABLE, 'roleId');

    await queryRunner.dropTable(this.PERMISSION_TABLE);
    await queryRunner.dropTable(this.ASSIGNED_USER_TYPE_TABLE);
    await queryRunner.dropTable(this.ROLE_TABLE);
  }

}