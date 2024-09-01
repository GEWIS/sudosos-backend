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
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const UserTypeMapping: Record<string, number> = {
  MEMBER: 1,
  ORGAN: 2,
  VOUCHER: 3,
  LOCAL_USER: 4,
  LOCAL_ADMIN: 5,
  INVOICE: 6,
  POINT_OF_SALE: 7,
};

export class UserTypeEnums1725196803203 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.changeColumn('user', 'type', new TableColumn({
      name: 'type',
      type: 'varchar',
      length: '64',
      isNullable: false,
    }));
    await queryRunner.changeColumn('role_user_type', 'userType', new TableColumn({
      name: 'userType',
      type: 'varchar',
      length: '64',
      isNullable: false,
      isPrimary: true,
    }));

    const promises: Promise<void>[] = [];
    Object.entries(UserTypeMapping).forEach(([key, value]) => {
      promises.push(queryRunner.query('UPDATE user SET type = ? WHERE type = ?', [key, value]));
      promises.push(queryRunner.query('UPDATE role_user_type SET userType = ? WHERE userType = ?', [key, value]));
    });

    await Promise.all(promises);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const promises: Promise<void>[] = [];
    Object.entries(UserTypeMapping).forEach(([key, value]) => {
      promises.push(queryRunner.query('UPDATE user SET type = ? WHERE type = ?', [value, key]));
      promises.push(queryRunner.query('UPDATE role_user_type SET userType = ? WHERE userType = ?', [key, value]));
    });

    await Promise.all(promises);

    await queryRunner.changeColumn('user', 'type', new TableColumn({
      name: 'type',
      type: 'integer',
      isNullable: false,
    }));
    await queryRunner.changeColumn('role_user_type', 'userType', new TableColumn({
      name: 'userType',
      type: 'integer',
      isNullable: false,
      isPrimary: true,
    }));
  }

}
