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
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';

export class PosUsers1722084520361 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('point_of_sale', new TableColumn({
      name: 'userId',
      type: 'integer',
      isNullable: true, // Temporary for migration
      isUnique: true,
    }));
    await queryRunner.createForeignKey('point_of_sale', new TableForeignKey({
      columnNames: ['userId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'user',
      onDelete: 'RESTRICT',
    }));

    const pointsOfSale = await queryRunner.manager.getRepository(PointOfSale).find({ withDeleted: true, relations: { user: true } });
    await Promise.all(pointsOfSale.map(async (pointOfSale): Promise<User> => {
      const user = await queryRunner.manager.getRepository(User)
        .save({
          firstName: `Point of Sale ${pointOfSale.id}`,
          type: UserType.POINT_OF_SALE,
          active: true,
          acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
        });
      pointOfSale.user = user;
      await queryRunner.manager.getRepository(PointOfSale).save(pointOfSale);
      return user;
    }));

    await queryRunner.changeColumn('point_of_sale', 'userId', new TableColumn({
      name: 'userId',
      type: 'integer',
      isNullable: false,
      isUnique: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const posTable = await queryRunner.getTable('point_of_sale');
    const userForeignKey = posTable.foreignKeys.find((fk) => fk.columnNames.indexOf('userId') !== -1);

    await queryRunner.dropForeignKey('point_of_sale', userForeignKey);
    await queryRunner.dropColumn('point_of_sale', 'userId');

    await queryRunner.manager.getRepository(User).delete({
      type: UserType.POINT_OF_SALE,
    });
  }
}
