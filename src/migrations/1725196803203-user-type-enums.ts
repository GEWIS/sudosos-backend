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

import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const UserTypeMapping: Record<string, string> = {
  MEMBER: '1',
  ORGAN: '2',
  VOUCHER: '3',
  LOCAL_USER: '4',
  LOCAL_ADMIN: '5',
  INVOICE: '6',
  POINT_OF_SALE: '7',
};

export class UserTypeEnums1725196803203 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.TYPEORM_CONNECTION === 'sqlite') {
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
    } else {
      // TypeORM completely deletes the column and adds it anew, which deletes all values
      // So a manual query it is! SQLite somehow does work with TypeORM
      await queryRunner.query('ALTER TABLE user MODIFY type varchar(64) NOT NULL');
      await queryRunner.query('ALTER TABLE role_user_type MODIFY userType varchar(64) NOT NULL');
    }

    for (let userTypeMappingKey in UserTypeMapping) {
      console.warn(`Updating user type ${userTypeMappingKey} to ${UserTypeMapping[userTypeMappingKey]}`);
      console.warn('UPDATE user SET type = ? WHERE type = ?', [userTypeMappingKey, UserTypeMapping[userTypeMappingKey]]);
      await queryRunner.query('UPDATE user SET type = ? WHERE type = ?', [userTypeMappingKey, UserTypeMapping[userTypeMappingKey]]);
      await queryRunner.query('UPDATE role_user_type SET userType = ? WHERE userType = ?', [userTypeMappingKey, UserTypeMapping[userTypeMappingKey]]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const promises: Promise<void>[] = [];
    Object.entries(UserTypeMapping).forEach(([key, value]) => {
      promises.push(queryRunner.query('UPDATE user SET type = ? WHERE type = ?', [value, key]));
      promises.push(queryRunner.query('UPDATE role_user_type SET userType = ? WHERE userType = ?', [value, key]));
    });

    await Promise.all(promises);

    // TypeORM completely deletes the column and adds it anew, which makes all values 0...
    // So a manual query it is! The migration:revert will now no longer work on SQLite though.
    await queryRunner.query('ALTER TABLE user MODIFY type integer NOT NULL');
    await queryRunner.query('ALTER TABLE role_user_type MODIFY userType integer NOT NULL');
  }

}
