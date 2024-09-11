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

import { DeepPartial, MigrationInterface, QueryRunner, Repository, Table, TableColumn, TableForeignKey } from 'typeorm';
import AssignedRole from '../entity/rbac/assigned-role';
import Role from '../entity/rbac/role';
import Permission from '../entity/rbac/permission';
import DefaultRoles from '../rbac/default-roles';
import EventShift from '../entity/event/event-shift';

const star = ['*'];

export function getAdminPermissions(role: Role, entity: string, relationOwn = true): DeepPartial<Permission>[] {
  const result = [
    { roleId: role.id, role, entity, action: 'get', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'update', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'create', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'delete', relation: 'all', attributes: star },
    { roleId: role.id, role, entity, action: 'approve', relation: 'all', attributes: star },
  ];
  if (!relationOwn) return result;
  return [
    ...result,
    { roleId: role.id, role, entity, action: 'get', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'update', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'create', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'delete', relation: 'own', attributes: star },
    { roleId: role.id, role, entity, action: 'approve', relation: 'own', attributes: star },
  ];
}

export class DatabaseRbac1720624912620 implements MigrationInterface {
  private ROLE_TABLE = 'role';

  private PERMISSION_TABLE = 'permission';

  private ASSIGNED_USER_TYPE_TABLE = 'role_user_type';

  private ASSIGNED_ROLE_TABLE = 'assigned_role';

  private EVENT_SHIFT_ROLE_TABLE = 'event_shift_roles_role';

  private async seedGEWISRoles(roleRepo: Repository<Role>, permissionRepo: Repository<Permission>): Promise<void> {
    await roleRepo.save({ name: 'SudoSOS - BAC' }).then(async (role): Promise<void> => {
      role.permissions = await permissionRepo.save([
        ...getAdminPermissions(role, 'Transaction'),
        ...getAdminPermissions(role, 'VoucherGroup', false),
        ...getAdminPermissions(role, 'ProductCategory', false),
        { role, entity: 'Balance', action: 'get', relation: 'all', attributes: star },
      ]);
    });

    await roleRepo.save({ name: 'SudoSOS - Board' }).then(async (role): Promise<void> => {
      role.permissions = await permissionRepo.save([
        ...getAdminPermissions(role, 'Banner'),
        ...getAdminPermissions(role, 'VoucherGroup'),
        ...getAdminPermissions(role, 'User'),
      ]);
    });

    await roleRepo.save({ name: 'SudoSOS - BAC PM' }).then(async (role): Promise<void> => {
      role.permissions = await permissionRepo.save([
        ...getAdminPermissions(role, 'Authenticator'),
        ...getAdminPermissions(role, 'Container'),
        ...getAdminPermissions(role, 'Invoice'),
        ...getAdminPermissions(role, 'PayoutRequest'),
        ...getAdminPermissions(role, 'PointOfSale'),
        ...getAdminPermissions(role, 'ProductCategory'),
        ...getAdminPermissions(role, 'Product'),
        ...getAdminPermissions(role, 'Transaction'),
        ...getAdminPermissions(role, 'Transfer'),
        ...getAdminPermissions(role, 'VatGroup'),
        ...getAdminPermissions(role, 'User'),
        ...getAdminPermissions(role, 'Fine'),
        { role, entity: 'Fine', action: 'notify', relation: 'all', attributes: star },
      ]);
    });

    await roleRepo.save({ name: 'SudoSOS - Audit' }).then(async (role): Promise<void> => {
      role.permissions = await permissionRepo.save([
        { roleId: role.id, role, entity: 'Invoice', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'Invoice', action: 'get', relation: 'own', attributes: star },
        { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'Transaction', action: 'get', relation: 'own', attributes: star },
        { roleId: role.id, role, entity: 'Transfer', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'Transfer', action: 'get', relation: 'own', attributes: star },
      ]);
    });

    await roleRepo.save({ name: 'SudoSOS - Narrowcasting' }).then(async (role): Promise<void> => {
      role.permissions = await permissionRepo.save([
        { roleId: role.id, role, entity: 'Balance', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'PointOfSale', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'Container', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'Product', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'User', action: 'get', relation: 'all', attributes: star },
        { roleId: role.id, role, entity: 'User', action: 'get', relation: 'organ', attributes: star },
      ]);
    });
  }

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
          type: 'varchar',
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

    /**
     * Create the roles
     */
    await DefaultRoles.synchronize();
    const roleRepo = queryRunner.manager.getRepository(Role);
    const permissionRepo = queryRunner.manager.getRepository(Permission);
    await this.seedGEWISRoles(roleRepo, permissionRepo);

    const assignedRoleNames: string[] = (await AssignedRole.getRepository().createQueryBuilder()
      .select('role')
      .groupBy('role')
      .getRawMany())
      .map(({ role }: { role: string }) => role);
    const eventShifts: { id: number, roles: string }[] = await queryRunner.manager.getRepository(EventShift)
      .createQueryBuilder()
      .withDeleted()
      .select(['id', 'roles'])
      .getRawMany();
    const eventShiftRoleNames: string[] = eventShifts
      .map(({ roles }): string[] => JSON.parse(roles))
      .flat();
    const roleNames = [...assignedRoleNames, ...eventShiftRoleNames]
      .filter((r1, index, all) => index === all.findIndex((r2) => r1 === r2));

    const roles = new Map<string, Role>();
    for (const role of roleNames) {
      const existingRole = await roleRepo.findOne({ where: { name: role } });
      if (existingRole) {
        roles.set(role, existingRole);
      } else {
        roles.set(role, await Role.save({ name: role }));
      }
    }

    /**
     * Migrate existing role assignments
     */
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
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
    }));
    await queryRunner.updatePrimaryKeys(this.ASSIGNED_ROLE_TABLE, [
      new TableColumn({
        name: 'roleId',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }),
      new TableColumn({
        name: 'userId',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }),
    ]);
    await queryRunner.dropColumn(this.ASSIGNED_ROLE_TABLE, 'role');
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');

    /**
     * Migrate event shifts
     */
    await queryRunner.createTable(new Table({
      name: this.EVENT_SHIFT_ROLE_TABLE,
      columns: [
        {
          name: 'eventShiftId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
        {
          name: 'roleId',
          type: 'integer',
          isPrimary: true,
          isNullable: false,
        },
      ],
    }));
    await queryRunner.createForeignKey(this.EVENT_SHIFT_ROLE_TABLE, new TableForeignKey({
      columnNames: ['eventShiftId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'event_shift',
      onDelete: 'CASCADE',
    }));
    await queryRunner.createForeignKey(this.EVENT_SHIFT_ROLE_TABLE, new TableForeignKey({
      columnNames: ['roleId'],
      referencedColumnNames: ['id'],
      referencedTableName: this.ROLE_TABLE,
      onDelete: 'CASCADE',
    }));
    await queryRunner.dropColumn('event_shift', 'roles');


    const eventShiftRepo = queryRunner.manager.getRepository(EventShift);
    await Promise.all(eventShifts.map(async ({ id, roles: jsonRoleNames }) => {
      const eventShift = await eventShiftRepo.findOne({ where: { id }, withDeleted: true });
      const eRoleNames: string[] = JSON.parse(jsonRoleNames);
      eventShift.roles = eRoleNames.map((r) => roles.get(r));
      await eventShiftRepo.save(eventShift);
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rawEventShiftRoles: { eventShiftId: number, roleId: number }[] = await queryRunner.query(`SELECT * FROM ${this.EVENT_SHIFT_ROLE_TABLE}`);
    await queryRunner.addColumn('event_shift', new TableColumn({
      name: 'roles',
      type: 'varchar(255)',
      isNullable: true,
    }));
    // Get a mapping from each shift ID to a list of roles
    const eventShiftRoles: Map<number, number[]> = rawEventShiftRoles.reduce((shifts, { eventShiftId, roleId }) => {
      if (shifts.has(eventShiftId)) {
        shifts.get(eventShiftId).push(roleId);
      } else {
        shifts.set(eventShiftId, [roleId]);
      }
      return shifts;
    }, new Map<number, number[]>());
    // Get all roles
    const roles = await queryRunner.manager.getRepository(Role).find({ withDeleted: true });
    const rolesMap = roles.reduce((map, role) => {
      map.set(role.id, role.name);
      return map;
    }, new Map<number, string>());
    for (let [eventShiftId, roleIds] of eventShiftRoles) {
      const roleNames = roleIds.map((id) => rolesMap.get(id));
      await queryRunner.query(`UPDATE event_shift SET roles = "${JSON.stringify(roleNames)}" WHERE id = ?`, [eventShiftId]);
    }
    await queryRunner.changeColumn('event_shift', 'roles', new TableColumn({
      name: 'roles',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.dropTable(this.EVENT_SHIFT_ROLE_TABLE);

    /**
     * Migrate assigned roles
     */
    await queryRunner.addColumn(this.ASSIGNED_ROLE_TABLE, new TableColumn({
      name: 'role',
      type: 'varchar(255)',
      isNullable: true,
    }));

    await queryRunner.query(`UPDATE ${this.ASSIGNED_ROLE_TABLE} AS a SET role = (SELECT name FROM ${this.ROLE_TABLE} WHERE ${this.ROLE_TABLE}.id = a.roleId)`);
    await queryRunner.query(`DELETE FROM ${this.ASSIGNED_ROLE_TABLE} WHERE role IS NULL`);

    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
    await queryRunner.changeColumn(this.ASSIGNED_ROLE_TABLE, 'role', new TableColumn({
      name: 'role',
      type: 'varchar(255)',
      isNullable: false,
    }));
    await queryRunner.updatePrimaryKeys(this.ASSIGNED_ROLE_TABLE, [
      new TableColumn({
        name: 'userId',
        type: 'integer',
        isNullable: false,
        isPrimary: true,
      }),
      new TableColumn({
        name: 'role',
        type: 'varchar(255)',
        isNullable: false,
        isPrimary: true,
      }),
    ]);

    const assignedRoleTable = await queryRunner.getTable(this.ASSIGNED_ROLE_TABLE);
    const roleForeignKey = assignedRoleTable.foreignKeys.find((fk => fk.columnNames.indexOf('roleId') !== -1));
    await queryRunner.dropForeignKey(this.ASSIGNED_ROLE_TABLE, roleForeignKey);
    await queryRunner.dropColumn(this.ASSIGNED_ROLE_TABLE, 'roleId');
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');

    await queryRunner.dropTable(this.PERMISSION_TABLE);
    await queryRunner.dropTable(this.ASSIGNED_USER_TYPE_TABLE);
    await queryRunner.dropTable(this.ROLE_TABLE);
  }

}
