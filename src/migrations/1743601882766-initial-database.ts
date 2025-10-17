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
 * @module
 * @hidden
 */

import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,

} from 'typeorm';

export class InitialSQLMigration1743601882766 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    //
    // Section A. Core RBAC, Users, VAT, Categories
    //
    await queryRunner.createTable(new Table({
      name: 'user',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'firstName', type: 'varchar', length: '64', isNullable: false },
        { name: 'lastName', type: 'varchar', length: '64', default: "''", isNullable: false },
        { name: 'active', type: 'tinyint', default: 0, isNullable: false },
        { name: 'ofAge', type: 'tinyint', default: 0, isNullable: false },
        { name: 'email', type: 'varchar', length: '64', default: "''", isNullable: false },
        { name: 'deleted', type: 'tinyint', default: 0, isNullable: false },
        { name: 'type', type: 'varchar', length: '64', isNullable: false },
        { name: 'acceptedToS', type: 'varchar', length: '255', default: "'NOT_ACCEPTED'", isNullable: false },
        { name: 'extensiveDataProcessing', type: 'tinyint', default: 0, isNullable: false },
        { name: 'nickname', type: 'varchar', length: '64', isNullable: true },
        { name: 'currentFinesId', type: 'int', isNullable: true },
        { name: 'canGoIntoDebt', type: 'tinyint', default: 0, isNullable: false },
      ],
      indices: [
        { name: 'IDX_e11e649824a45d8ed01d597fd9', columnNames: ['createdAt'] },
        { name: 'IDX_b42ca95830a90a240d46c70572', columnNames: ['currentFinesId'] },
      ],
    }), true);

    await queryRunner.createTable(new Table({
      name: 'role',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '255', isNullable: false },
        { name: 'systemDefault', type: 'tinyint', default: 0, isNullable: false },
      ],
      uniques: [{ name: 'UQ_ae4578dcaed5adff96595e61660', columnNames: ['name'] }],
    }), true);

    await queryRunner.createTable(new Table({
      name: 'permission',
      engine: 'InnoDB',
      columns: [
        { name: 'roleId', type: 'int', isPrimary: true },
        { name: 'action', type: 'varchar', length: '255', isPrimary: true },
        { name: 'relation', type: 'varchar', length: '255', isPrimary: true },
        { name: 'entity', type: 'varchar', length: '255', isPrimary: true },
        { name: 'attributes', type: 'varchar', length: '255', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('permission', new TableForeignKey({
      name: 'FK_cdb4db95384a1cf7a837c4c683e',
      columnNames: ['roleId'],
      referencedTableName: 'role',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'assigned_role',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'roleId', type: 'int', isPrimary: true },
      ],
      indices: [
        { name: 'IDX_f51f7a75fd982f5f757dc76a24', columnNames: ['createdAt'] },
        { name: 'FK_f498caac8c930b8cd0532cca7c0', columnNames: ['roleId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('assigned_role', [
      new TableForeignKey({
        name: 'FK_32eef7ed7f4c9e41ce2df201a8c',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
      new TableForeignKey({
        name: 'FK_f498caac8c930b8cd0532cca7c0',
        columnNames: ['roleId'],
        referencedTableName: 'role',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'role_user_type',
      engine: 'InnoDB',
      columns: [
        { name: 'roleId', type: 'int', isPrimary: true },
        { name: 'userType', type: 'varchar', length: '64', isPrimary: true },
      ],
    }), true);
    await queryRunner.createForeignKey('role_user_type', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_618acabb65230c8f4f1dc431523',
      columnNames: ['roleId'],
      referencedTableName: 'role',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'vat_group',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '255', isNullable: false },
        { name: 'percentage', type: 'double', isNullable: false },
        { name: 'deleted', type: 'tinyint', default: 0, isNullable: false },
        { name: 'hidden', type: 'tinyint', default: 0, isNullable: false },
      ],
      indices: [{ name: 'IDX_9b50121f931a09b932f6d1382f', columnNames: ['createdAt'] }],
    }), true);

    await queryRunner.createTable(new Table({
      name: 'product_category',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'parentId', type: 'int', isNullable: true },
      ],
      indices: [{ name: 'IDX_f0495180538f78a4b0c975e405', columnNames: ['createdAt'] }],
      uniques: [{ name: 'IDX_96152d453aaea425b5afde3ae9', columnNames: ['name'] }],
    }), true);
    await queryRunner.createForeignKey('product_category', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_569b30aa4b0a1ad42bcd30916aa',
      columnNames: ['parentId'],
      referencedTableName: 'product_category',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'product_category_closure',
      engine: 'InnoDB',
      columns: [
        { name: 'id_ancestor', type: 'int', isPrimary: true },
        { name: 'id_descendant', type: 'int', isPrimary: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('product_category_closure', [
      new TableForeignKey({
        name: 'FK_da967ccb3697d66f43122eec2f0',
        columnNames: ['id_ancestor'],
        referencedTableName: 'product_category',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_cb4a5e74ae032bac3f614096ebd',
        columnNames: ['id_descendant'],
        referencedTableName: 'product_category',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    //
    // Section B. Files and Products
    //
    await queryRunner.createTable(new Table({
      name: 'product_image',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_d7de3082fc3416e669e5032738', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('product_image', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_b184df3290d5052115eb3e9e3dc',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'product',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'currentRevision', type: 'int', isNullable: true },
        { name: 'ownerId', type: 'int', isNullable: false },
        { name: 'imageId', type: 'int', isNullable: true },
        { name: 'deletedAt', type: 'datetime(6)', isNullable: true },
      ],
      indices: [
        { name: 'IDX_6b71c587b0fd3855fa23b759ca', columnNames: ['createdAt'] },
        { name: 'FK_cbb5d890de1519efa20c42bcd52', columnNames: ['ownerId'] },
      ],
      uniques: [{ name: 'REL_b1b332c0f436897f21a960f26c', columnNames: ['imageId'] }],
    }), true);
    await queryRunner.createForeignKeys('product', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_cbb5d890de1519efa20c42bcd52',
        columnNames: ['ownerId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        name: 'FK_b1b332c0f436897f21a960f26c7',
        columnNames: ['imageId'],
        referencedTableName: 'product_image',
        referencedColumnNames: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'product_revision',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'priceInclVat', type: 'int', isNullable: false },
        { name: 'alcoholPercentage', type: 'decimal', precision: 5, scale: 2, isNullable: false },
        { name: 'productId', type: 'int', isPrimary: true },
        { name: 'revision', type: 'int', isPrimary: true, default: 1 },
        { name: 'vatId', type: 'int', isNullable: false },
        { name: 'categoryId', type: 'int', isNullable: false },
        { name: 'featured', type: 'tinyint', default: 0, isNullable: false },
        { name: 'preferred', type: 'tinyint', default: 0, isNullable: false },
        { name: 'priceList', type: 'tinyint', default: 0, isNullable: false },
      ],
      indices: [
        { name: 'IDX_83a955d71e12c919cc0cb0d53b', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('product_revision', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_d0bf413994264a323d914f1c767',
        columnNames: ['productId'],
        referencedTableName: 'product',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_98524ea1462e06ea2e49f98fb41',
        columnNames: ['vatId'],
        referencedTableName: 'vat_group',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_4c2b27e9edcada5b7c32a1bba4f',
        columnNames: ['categoryId'],
        referencedTableName: 'product_category',
        referencedColumnNames: ['id'],
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'product_ordering',
      engine: 'InnoDB',
      columns: [
        { name: 'posId', type: 'int', isPrimary: true },
        { name: 'productId', type: 'int', isPrimary: true },
        { name: 'order', type: 'int', isNullable: false },
      ],
      uniques: [{
        name: 'IDX_f34b7832069ef698d2eb6d7b50',
        columnNames: ['posId', 'productId', 'order'],
      }],
    }), true);
    await queryRunner.createForeignKey('product_ordering', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_9e85b9443e2cdbcbd60fc5c3daf',
      columnNames: ['productId'],
      referencedTableName: 'product',
      referencedColumnNames: ['id'],
    }));

    //
    // Section C. Containers and POS
    //
    await queryRunner.createTable(new Table({
      name: 'container',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'currentRevision', type: 'int', isNullable: true },
        { name: 'public', type: 'tinyint', default: 0, isNullable: false },
        { name: 'ownerId', type: 'int', isNullable: false },
        { name: 'deletedAt', type: 'datetime(6)', isNullable: true },
      ],
      indices: [
        { name: 'IDX_2bde964cf68f4124873433e906', columnNames: ['createdAt'] },
        { name: 'FK_2e7a0befc04b14d4b22960a7438', columnNames: ['ownerId'] },
      ],
    }), true);
    await queryRunner.createForeignKey('container', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_2e7a0befc04b14d4b22960a7438',
      columnNames: ['ownerId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'container_revision',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'containerId', type: 'int', isPrimary: true },
        { name: 'revision', type: 'int', isPrimary: true, default: 1 },
      ],
      indices: [{ name: 'IDX_91faf9dd42af7b6891b50b98c6', columnNames: ['createdAt'] }],
    }), true);
    await queryRunner.createForeignKey('container_revision', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_c68449032c093b4b1ac0a715500',
      columnNames: ['containerId'],
      referencedTableName: 'container',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'container_revision_products_product_revision',
      engine: 'InnoDB',
      columns: [
        { name: 'containerRevisionContainerId', type: 'int', isPrimary: true },
        { name: 'containerRevisionRevision', type: 'int', isPrimary: true },
        { name: 'productRevisionProductId', type: 'int', isPrimary: true },
        { name: 'productRevisionRevision', type: 'int', isPrimary: true },
      ],
      indices: [
        {
          name: 'IDX_1ebf86226729e5e2ebcead3005',
          columnNames: ['containerRevisionContainerId', 'containerRevisionRevision'],
        },
        {
          name: 'IDX_0aff363152e31f6795fadc45d5',
          columnNames: ['productRevisionProductId', 'productRevisionRevision'],
        },
      ],
    }), true);
    await queryRunner.createForeignKeys('container_revision_products_product_revision', [
      new TableForeignKey({
        name: 'FK_1crppr_containerrev',
        columnNames: ['containerRevisionContainerId', 'containerRevisionRevision'],
        referencedTableName: 'container_revision',
        referencedColumnNames: ['containerId', 'revision'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_0crppr_productrev',
        columnNames: ['productRevisionProductId', 'productRevisionRevision'],
        referencedTableName: 'product_revision',
        referencedColumnNames: ['productId', 'revision'],
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'updated_container',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'containerId', type: 'int', isPrimary: true },
      ],
      indices: [{ name: 'IDX_973e5010e226f69bb1402281a7', columnNames: ['createdAt'] }],
      uniques: [{ name: 'REL_aed61f0ebbe447d8133a68b5dc', columnNames: ['containerId'] }],
    }), true);
    await queryRunner.createForeignKey('updated_container', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_aed61f0ebbe447d8133a68b5dcb',
      columnNames: ['containerId'],
      referencedTableName: 'container',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'updated_container_products_product',
      engine: 'InnoDB',
      columns: [
        { name: 'updatedContainerContainerId', type: 'int', isPrimary: true },
        { name: 'productId', type: 'int', isPrimary: true },
      ],
      indices: [
        { name: 'IDX_6c25f3b3c37db9812e3ae2db23', columnNames: ['updatedContainerContainerId'] },
        { name: 'IDX_00bacabbad03567d6b290aa15d', columnNames: ['productId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('updated_container_products_product', [
      new TableForeignKey({
        name: 'FK_6c25f3b3c37db9812e3ae2db239',
        columnNames: ['updatedContainerContainerId'],
        referencedTableName: 'updated_container',
        referencedColumnNames: ['containerId'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_00bacabbad03567d6b290aa15d3',
        columnNames: ['productId'],
        referencedTableName: 'product',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'point_of_sale',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'currentRevision', type: 'int', isNullable: true },
        { name: 'ownerId', type: 'int', isNullable: false },
        { name: 'deletedAt', type: 'datetime(6)', isNullable: true },
        { name: 'userId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_ec4298708311ae8ca1a574aac4', columnNames: ['createdAt'] },
        { name: 'IDX_a0ccf55f761fcc887394bf4309', columnNames: ['userId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('point_of_sale', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_24fb8a721a293ac72c10ac5de61',
        columnNames: ['ownerId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_a0ccf55f761fcc887394bf4309b',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
    ]);

    // now that POS exists, wire product_ordering.posId -> point_of_sale.id
    await queryRunner.createForeignKey('product_ordering', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_c301bcdbc96620a03407969c377',
      columnNames: ['posId'],
      referencedTableName: 'point_of_sale',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'point_of_sale_revision',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'useAuthentication', type: 'tinyint', default: 0, isNullable: false },
        { name: 'pointOfSaleId', type: 'int', isPrimary: true },
        { name: 'revision', type: 'int', isPrimary: true, default: 1 },
      ],
      indices: [{ name: 'IDX_271eb7e95de682b69cbe72429f', columnNames: ['createdAt'] }],
    }), true);
    await queryRunner.createForeignKey('point_of_sale_revision', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_cf563b738966171e8680239ffe3',
      columnNames: ['pointOfSaleId'],
      referencedTableName: 'point_of_sale',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'point_of_sale_revision_containers_container_revision',
      engine: 'InnoDB',
      columns: [
        { name: 'pointOfSaleRevisionPointOfSaleId', type: 'int', isPrimary: true },
        { name: 'pointOfSaleRevisionRevision', type: 'int', isPrimary: true },
        { name: 'containerRevisionContainerId', type: 'int', isPrimary: true },
        { name: 'containerRevisionRevision', type: 'int', isPrimary: true },
      ],
      indices: [
        {
          name: 'IDX_33376b1706747cf7c1aa3f875f',
          columnNames: ['pointOfSaleRevisionPointOfSaleId', 'pointOfSaleRevisionRevision'],
        },
        {
          name: 'IDX_beba133c317de33aa612f6737e',
          columnNames: ['containerRevisionContainerId', 'containerRevisionRevision'],
        },
      ],
    }), true);
    await queryRunner.createForeignKeys('point_of_sale_revision_containers_container_revision', [
      new TableForeignKey({
        name: 'FK_33376b1706747cf7c1aa3f875f2',
        columnNames: ['pointOfSaleRevisionPointOfSaleId', 'pointOfSaleRevisionRevision'],
        referencedTableName: 'point_of_sale_revision',
        referencedColumnNames: ['pointOfSaleId', 'revision'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_beba133c317de33aa612f6737e6',
        columnNames: ['containerRevisionContainerId', 'containerRevisionRevision'],
        referencedTableName: 'container_revision',
        referencedColumnNames: ['containerId', 'revision'],
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'updated_point_of_sale',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        {
          name: 'updatedAt',
          type: 'datetime(6)',
          default: 'CURRENT_TIMESTAMP(6)',
          onUpdate: 'CURRENT_TIMESTAMP(6)',
          isNullable: false,
        },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'useAuthentication', type: 'tinyint', default: 0, isNullable: false },
        { name: 'pointOfSaleId', type: 'int', isPrimary: true },
      ],
      indices: [{ name: 'IDX_23023f77294bff8abe57ab6ab6', columnNames: ['createdAt'] }],
      uniques: [{ name: 'REL_05265354a3b84f882fe68349f4', columnNames: ['pointOfSaleId'] }],
    }), true);
    await queryRunner.createForeignKey('updated_point_of_sale', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_05265354a3b84f882fe68349f4f',
      columnNames: ['pointOfSaleId'],
      referencedTableName: 'point_of_sale',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'updated_point_of_sale_containers_container',
      engine: 'InnoDB',
      columns: [
        { name: 'updatedPointOfSalePointOfSaleId', type: 'int', isPrimary: true },
        { name: 'containerId', type: 'int', isPrimary: true },
      ],
      indices: [
        {
          name: 'IDX_7d0d7f029a07d3133137bc0eec',
          columnNames: ['updatedPointOfSalePointOfSaleId'],
        },
        { name: 'IDX_18e428547adff0f47d2e91b5dc', columnNames: ['containerId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('updated_point_of_sale_containers_container', [
      new TableForeignKey({
        name: 'FK_7d0d7f029a07d3133137bc0eecc',
        columnNames: ['updatedPointOfSalePointOfSaleId'],
        referencedTableName: 'updated_point_of_sale',
        referencedColumnNames: ['pointOfSaleId'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_18e428547adff0f47d2e91b5dc6',
        columnNames: ['containerId'],
        referencedTableName: 'container',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    // Also include POS cashier role join table now
    await queryRunner.createTable(new Table({
      name: 'point_of_sale_cashier_roles_role',
      engine: 'InnoDB',
      columns: [
        { name: 'pointOfSaleId', type: 'int', isPrimary: true },
        { name: 'roleId', type: 'int', isPrimary: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('point_of_sale_cashier_roles_role', [
      new TableForeignKey({
        name: 'FK_d9c043a3957a31d7f699b0932f0',
        columnNames: ['pointOfSaleId'],
        referencedTableName: 'point_of_sale',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_424767742bed3867b8edfb4c14e',
        columnNames: ['roleId'],
        referencedTableName: 'role',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    // =========================
    // Section D. Transfers, Transactions, Subtransactions, Balances, UpdatedProduct
    // =========================

    // transfer
    await queryRunner.createTable(new Table({
      name: 'transfer',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'fromId', type: 'int', isNullable: true },
        { name: 'toId', type: 'int', isNullable: true },
        { name: 'amountInclVat', type: 'int', isNullable: false },
        { name: 'description', type: 'varchar', length: '255', isNullable: true },
        { name: 'vatId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_ad898da19a2036169276bec8c1', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('transfer', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_9bc2f01e5bc90eab1015548b5ab',
        columnNames: ['fromId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_06b33ebdc8919ff5d34646c6fe3',
        columnNames: ['toId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_982efd15d8f524a263dc0dacd1c',
        columnNames: ['vatId'],
        referencedTableName: 'vat_group',
        referencedColumnNames: ['id'],
      }),
    ]);

    // transaction
    await queryRunner.createTable(new Table({
      name: 'transaction',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'fromId', type: 'int', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
        { name: 'pointOfSalePointOfSaleId', type: 'int', isNullable: true },
        { name: 'pointOfSaleRevision', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_83cb622ce2d74c56db3e0c29f1', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('transaction', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_ac3d6711c8adf322a76c0d1a227',
        columnNames: ['fromId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_d2c2c2e40cf2e32e72bb111f6a0',
        columnNames: ['createdById'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_928a8e95de543fca4327cd47877',
        columnNames: ['pointOfSalePointOfSaleId', 'pointOfSaleRevision'],
        referencedTableName: 'point_of_sale_revision',
        referencedColumnNames: ['pointOfSaleId', 'revision'],
      }),
    ]);

    // sub_transaction
    await queryRunner.createTable(new Table({
      name: 'sub_transaction',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'toId', type: 'int', isNullable: false },
        { name: 'containerContainerId', type: 'int', isNullable: false },
        { name: 'containerRevision', type: 'int', isNullable: false },
        { name: 'transactionId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_4d38ed98b11cab29cbf5704495', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('sub_transaction', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_b52f0bfde289a856a1676e4e438',
        columnNames: ['toId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_6a979da149afbd5b55fe95d8441',
        columnNames: ['containerContainerId', 'containerRevision'],
        referencedTableName: 'container_revision',
        referencedColumnNames: ['containerId', 'revision'],
      }),
      new TableForeignKey({
        name: 'FK_865e795ceccbf5a980afa6340e5',
        columnNames: ['transactionId'],
        referencedTableName: 'transaction',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    // sub_transaction_row
    await queryRunner.createTable(new Table({
      name: 'sub_transaction_row',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'productProductId', type: 'int', isNullable: false },
        { name: 'productRevision', type: 'int', isNullable: false },
        { name: 'invoiceId', type: 'int', isNullable: true },
        { name: 'subTransactionId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_0a365df9c0df420ecf9a3be41e', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('sub_transaction_row', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_08486ddd45c1b59aac61c902057',
        columnNames: ['productProductId', 'productRevision'],
        referencedTableName: 'product_revision',
        referencedColumnNames: ['productId', 'revision'],
      }),
      new TableForeignKey({
        name: 'FK_43ce16296a2fb07d50c417bbf23',
        columnNames: ['subTransactionId'],
        referencedTableName: 'sub_transaction',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
      // FK to invoice will be attached in Section E after invoice table is created
    ]);

    // balance
    await queryRunner.createTable(new Table({
      name: 'balance',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'lastTransactionId', type: 'int', isNullable: true },
        { name: 'lastTransferId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_0e771013275fb121dce75e6022', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('balance', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_9297a70b26dc787156fa49de26b',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        name: 'FK_7ea7cc133e5c70f1f80ebeaf194',
        columnNames: ['lastTransactionId'],
        referencedTableName: 'transaction',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
      new TableForeignKey({
        name: 'FK_a52ad6295abc075ef0b25ff2711',
        columnNames: ['lastTransferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
    ]);

    // updated_product
    await queryRunner.createTable(new Table({
      name: 'updated_product',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'priceInclVat', type: 'int', isNullable: false },
        { name: 'alcoholPercentage', type: 'decimal', precision: 5, scale: 2, isNullable: false },
        { name: 'productId', type: 'int', isPrimary: true },
        { name: 'vatId', type: 'int', isNullable: false },
        { name: 'categoryId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_d0e7a0935cce6da8f78b8011d2', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('updated_product', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_43e680991b2168755292d2280ed',
        columnNames: ['productId'],
        referencedTableName: 'product',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_41d61434f1a90cb169674f2bfd2',
        columnNames: ['vatId'],
        referencedTableName: 'vat_group',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_ea95a6e5f0b010f862aaa119435',
        columnNames: ['categoryId'],
        referencedTableName: 'product_category',
        referencedColumnNames: ['id'],
      }),
    ]);

    // =========================
    // Section E. Invoices and relations
    // =========================

    // invoice_pdf
    await queryRunner.createTable(new Table({
      name: 'invoice_pdf',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'hash', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('invoice_pdf', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_2c0caa648b45955e5b813fcd155',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    // invoice
    await queryRunner.createTable(new Table({
      name: 'invoice',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'toId', type: 'int', isNullable: false },
        { name: 'addressee', type: 'varchar', length: '255', isNullable: false },
        { name: 'description', type: 'varchar', length: '255', isNullable: true },
        { name: 'transferId', type: 'int', isNullable: false },
        { name: 'reference', type: 'varchar', length: '255', isNullable: false },
        { name: 'street', type: 'varchar', length: '255', isNullable: false },
        { name: 'postalCode', type: 'varchar', length: '255', isNullable: false },
        { name: 'city', type: 'varchar', length: '255', isNullable: false },
        { name: 'country', type: 'varchar', length: '255', isNullable: false },
        { name: 'pdfId', type: 'int', isNullable: true },
        { name: 'attention', type: 'varchar', length: '255', default: "''", isNullable: true },
        { name: 'date', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'creditTransferId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_31aef0453df6db5015712eb2d2', columnNames: ['createdAt'] },
      ],
      uniques: [
        { name: 'REL_f1af5bbf5baeb15ee911f2c54c', columnNames: ['transferId'] },
        { name: 'IDX_fd48ffbca7ab422836aaf73af5', columnNames: ['pdfId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('invoice', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_a0c7a052a624e9a630272fe96c6',
        columnNames: ['toId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_f1af5bbf5baeb15ee911f2c54ca',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        name: 'FK_fd48ffbca7ab422836aaf73af5c',
        columnNames: ['pdfId'],
        referencedTableName: 'invoice_pdf',
        referencedColumnNames: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_ad265ea872d0ffc7d4ea17447ee',
        columnNames: ['creditTransferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
    ]);

    // sub_transaction_row.invoiceId -> invoice.id
    await queryRunner.createForeignKey('sub_transaction_row', new TableForeignKey({
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
      name: 'FK_f3b08edb69ad5d07a66d8772672',
      columnNames: ['invoiceId'],
      referencedTableName: 'invoice',
      referencedColumnNames: ['id'],
    }));

    // invoice_status
    await queryRunner.createTable(new Table({
      name: 'invoice_status',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'state', type: 'int', isNullable: false },
        { name: 'invoiceId', type: 'int', isNullable: false },
        { name: 'changedById', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_773375711d0c5eb97a33b7af75', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('invoice_status', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_c671f173f08dbe75d91ebd616c7',
        columnNames: ['invoiceId'],
        referencedTableName: 'invoice',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_a2332a63bc6a70d33b320ddbf2d',
        columnNames: ['changedById'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
    ]);

    // invoice_user
    await queryRunner.createTable(new Table({
      name: 'invoice_user',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'automatic', type: 'tinyint', default: 0, isNullable: false },
        { name: 'street', type: 'varchar', length: '255', isNullable: false },
        { name: 'postalCode', type: 'varchar', length: '255', isNullable: false },
        { name: 'city', type: 'varchar', length: '255', isNullable: false },
        { name: 'country', type: 'varchar', length: '255', isNullable: false },
      ],
      indices: [
        { name: 'IDX_1f527d9878bdf21e83a72dddd2', columnNames: ['createdAt'] },
      ],
      uniques: [
        { name: 'REL_273e5b37f9b184fd56e7f2cb08', columnNames: ['userId'] },
      ],
    }), true);
    await queryRunner.createForeignKey('invoice_user', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_273e5b37f9b184fd56e7f2cb08a',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    // inv_sub_tra_row_del_inv_sub_tra_row
    await queryRunner.createTable(new Table({
      name: 'inv_sub_tra_row_del_inv_sub_tra_row',
      engine: 'InnoDB',
      columns: [
        { name: 'invoiceId', type: 'int', isPrimary: true },
        { name: 'subTransactionRowId', type: 'int', isPrimary: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('inv_sub_tra_row_del_inv_sub_tra_row', [
      new TableForeignKey({
        name: 'FK_d9eda7c96531aa0fa3d8a6faf4e',
        columnNames: ['invoiceId'],
        referencedTableName: 'invoice',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_4de5e0dbf807e44ea9a27b78640',
        columnNames: ['subTransactionRowId'],
        referencedTableName: 'sub_transaction_row',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);
    // stripe_payment_intent
    await queryRunner.createTable(new Table({
      name: 'stripe_payment_intent',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'stripeId', type: 'varchar', length: '255', isNullable: false },
        { name: 'amount', type: 'int', isNullable: false },
      ],
      uniques: [
        { name: 'IDX_3107e59c1952213436dcbb6c5a', columnNames: ['stripeId'] },
      ],
      indices: [
        { name: 'IDX_f5e3d623477dca34bba9a77cb8', columnNames: ['createdAt'] },
      ],
    }), true);

    // stripe_payment_intent_status
    await queryRunner.createTable(new Table({
      name: 'stripe_payment_intent_status',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'state', type: 'int', isNullable: false },
        { name: 'stripePaymentIntentId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_e4b29bd67e51ff6d4a5d82738d', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('stripe_payment_intent_status', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_8f454dd76a0725b815a5c046aae',
      columnNames: ['stripePaymentIntentId'],
      referencedTableName: 'stripe_payment_intent',
      referencedColumnNames: ['id'],
    }));

    // stripe_deposit
    await queryRunner.createTable(new Table({
      name: 'stripe_deposit',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'toId', type: 'int', isNullable: false },
        { name: 'transferId', type: 'int', isNullable: true },
        { name: 'stripePaymentIntentId', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKeys('stripe_deposit', [
      new TableForeignKey({
        name: 'FK_30003949e49a55ddef927ac3ea9',
        columnNames: ['toId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
      new TableForeignKey({
        name: 'FK_e3de95c17c9760e68b9d2ac9409',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
      new TableForeignKey({
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
        name: 'FK_996daa2cc2a7322684f827fa030',
        columnNames: ['stripePaymentIntentId'],
        referencedTableName: 'stripe_payment_intent',
        referencedColumnNames: ['id'],
      }),
    ]);

    // =========================
    // Section G. Events and shifts
    // =========================

    await queryRunner.createTable(new Table({
      name: 'event',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '255', isNullable: false },
        { name: 'startDate', type: 'datetime', isNullable: false },
        { name: 'endDate', type: 'datetime', isNullable: false },
        { name: 'type', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_77b45e61f3194ba2be468b0778', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('event', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_1d5a6b5f38273d74f192ae552a6',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'event_shift',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'deletedAt', type: 'datetime(6)', isNullable: true },
        { name: 'name', type: 'varchar', length: '255', isNullable: false },
      ],
      indices: [
        { name: 'IDX_cdb1fdd9afd869277e2d754818', columnNames: ['createdAt'] },
      ],
    }), true);

    await queryRunner.createTable(new Table({
      name: 'event_shifts_event_shift',
      engine: 'InnoDB',
      columns: [
        { name: 'eventId', type: 'int', isPrimary: true },
        { name: 'eventShiftId', type: 'int', isPrimary: true },
      ],
      indices: [
        { name: 'IDX_4a5816ad85f83216ff9358452e', columnNames: ['eventId'] },
        { name: 'IDX_f37c7de1e636e65e2d45290cf9', columnNames: ['eventShiftId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('event_shifts_event_shift', [
      new TableForeignKey({
        name: 'FK_4a5816ad85f83216ff9358452e8',
        columnNames: ['eventId'],
        referencedTableName: 'event',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_f37c7de1e636e65e2d45290cf91',
        columnNames: ['eventShiftId'],
        referencedTableName: 'event_shift',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'event_shift_roles_role',
      engine: 'InnoDB',
      columns: [
        { name: 'eventShiftId', type: 'int', isPrimary: true },
        { name: 'roleId', type: 'int', isPrimary: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('event_shift_roles_role', [
      new TableForeignKey({
        name: 'FK_b7bc5f8d015ac4ab0fa9353cea0',
        columnNames: ['eventShiftId'],
        referencedTableName: 'event_shift',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_ac36ca9f11e4cebf7a7fc4fd1e1',
        columnNames: ['roleId'],
        referencedTableName: 'role',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'event_shift_answer',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'availability', type: 'varchar', length: '255', isNullable: true },
        { name: 'selected', type: 'tinyint', default: 0, isNullable: false },
        { name: 'shiftId', type: 'int', isPrimary: true },
        { name: 'eventId', type: 'int', isPrimary: true },
      ],
      indices: [
        { name: 'IDX_cde8d23385a9e5db4b82ec3b36', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('event_shift_answer', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_1e20b4b670a4b781ebb26671098',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
        name: 'FK_0f619764862ac181f7ebb2eed27',
        columnNames: ['shiftId'],
        referencedTableName: 'event_shift',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        name: 'FK_a6887f089a4dd5fe71c41526695',
        columnNames: ['eventId'],
        referencedTableName: 'event',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      }),
    ]);

    // =========================
    // Section H. Fines
    // =========================

    await queryRunner.createTable(new Table({
      name: 'user_fine_group',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'userId', type: 'int', isNullable: false },
        { name: 'waivedTransferId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_287aa509b39d191a3447a9fe00', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('user_fine_group', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_69128dd1516a60ba9b89e83ef21',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        name: 'FK_81d497d07c08c585214949267a4',
        columnNames: ['waivedTransferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'NO ACTION',
      }),
    ]);

    // user.currentFinesId -> user_fine_group.id
    await queryRunner.createForeignKey('user', new TableForeignKey({
      name: 'FK_b42ca95830a90a240d46c70572c',
      columnNames: ['currentFinesId'],
      referencedTableName: 'user_fine_group',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'fine_handout_event',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'referenceDate', type: 'datetime', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_3a87bd6247b8ef17621a3fdc1b', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('fine_handout_event', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_70f9f6498f6c166943cbb494724',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'fine',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'fineHandoutEventId', type: 'int', isNullable: false },
        { name: 'userFineGroupId', type: 'int', isNullable: false },
        { name: 'transferId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_f218ae3b59a59b93ca62c683db', columnNames: ['createdAt'] },
      ],
      uniques: [
        { name: 'REL_dfd5d8c8fe1b3a4df17be3497d', columnNames: ['transferId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('fine', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_93bc0945de8a9c712f46bd23fce',
        columnNames: ['fineHandoutEventId'],
        referencedTableName: 'fine_handout_event',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_f66ed973a3f01de948b908d632e',
        columnNames: ['userFineGroupId'],
        referencedTableName: 'user_fine_group',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_dfd5d8c8fe1b3a4df17be3497d6',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
    ]);

    // =========================
    // Section I. Vouchers
    // =========================

    await queryRunner.createTable(new Table({
      name: 'voucher_group',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '64', isNullable: false },
        { name: 'activeStartDate', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: false },
        { name: 'activeEndDate', type: 'datetime', isNullable: false },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'balance', type: 'int', isNullable: false },
      ],
      uniques: [
        { name: 'IDX_afb774509fb3d1c802647d86f7', columnNames: ['name'] },
      ],
      indices: [
        { name: 'IDX_392326af17f0b4115bea11e749', columnNames: ['createdAt'] },
      ],
    }), true);

    await queryRunner.createTable(new Table({
      name: 'user_voucher_group',
      engine: 'InnoDB',
      columns: [
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'voucherGroupId', type: 'int', isNullable: false },
      ],
      uniques: [
        { name: 'REL_e8a6a3a59081155d48fcb8e854', columnNames: ['userId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('user_voucher_group', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_e8a6a3a59081155d48fcb8e8540',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_17f2cfbf1f58c50f2bf43315b22',
        columnNames: ['voucherGroupId'],
        referencedTableName: 'voucher_group',
        referencedColumnNames: ['id'],
      }),
    ]);

    // =========================
    // Section J. Payouts, WriteOffs
    // =========================

    // write_off_pdf
    await queryRunner.createTable(new Table({
      name: 'write_off_pdf',
      engine: 'InnoDB',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'hash', type: 'varchar', length: '255', isNullable: false },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('write_off_pdf', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_e6c374b0d0b9d90697820ba88c9',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    // write_off
    await queryRunner.createTable(new Table({
      name: 'write_off',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'transferId', type: 'int', isNullable: true },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'toId', type: 'int', isNullable: false },
        { name: 'pdfId', type: 'int', isNullable: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('write_off', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_c53ae318ca3a0ac0859a79fd5b7',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_3d97c38c0e0e53c323c8353dece',
        columnNames: ['toId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
        name: 'FK_e9033ba76807efc3e10682bab1a',
        columnNames: ['pdfId'],
        referencedTableName: 'write_off_pdf',
        referencedColumnNames: ['id'],
      }),
    ]);

    // payout_request_pdf
    await queryRunner.createTable(new Table({
      name: 'payout_request_pdf',
      engine: 'InnoDB',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'hash', type: 'varchar', length: '255', isNullable: false },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('payout_request_pdf', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_ea897a3fed381cb32d4ba81fd5c',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    // payout_request
    await queryRunner.createTable(new Table({
      name: 'payout_request',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'bankAccountNumber', type: 'varchar', length: '255', isNullable: false },
        { name: 'bankAccountName', type: 'varchar', length: '255', isNullable: false },
        { name: 'requestedById', type: 'int', isNullable: false },
        { name: 'transferId', type: 'int', isNullable: true },
        { name: 'approvedById', type: 'int', isNullable: true },
        { name: 'pdfId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_d2436d4c1075edd6ac1df10860', columnNames: ['createdAt'] },
      ],
      uniques: [
        { name: 'REL_956cef8545f8bc1944809f69c2', columnNames: ['transferId'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('payout_request', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_5ff1718fd7ef4b1314c279124fb',
        columnNames: ['requestedById'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_956cef8545f8bc1944809f69c24',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_b48700107cc13b06f601a7332ec',
        columnNames: ['approvedById'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
        name: 'FK_c54ab0d505973c4a37a9d1ddeb0',
        columnNames: ['pdfId'],
        referencedTableName: 'payout_request_pdf',
        referencedColumnNames: ['id'],
      }),
    ]);

    // payout_request_status
    await queryRunner.createTable(new Table({
      name: 'payout_request_status',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'state', type: 'varchar', length: '255', isNullable: false },
        { name: 'payoutRequestId', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_cc029c5b23ea4b7d34d77e0921', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('payout_request_status', new TableForeignKey({
      name: 'FK_8f370d8326498ec78ba1679f332',
      columnNames: ['payoutRequestId'],
      referencedTableName: 'payout_request',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    // seller_payout_pdf
    await queryRunner.createTable(new Table({
      name: 'seller_payout_pdf',
      engine: 'InnoDB',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'hash', type: 'varchar', length: '255', isNullable: false },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('seller_payout_pdf', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_bb5ce24f6db4174ef68b12a94a2',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    // seller_payout
    await queryRunner.createTable(new Table({
      name: 'seller_payout',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'requestedById', type: 'int', isNullable: false },
        { name: 'transferId', type: 'int', isNullable: true },
        { name: 'amount', type: 'int', isNullable: false },
        { name: 'startDate', type: 'datetime(6)', isNullable: false },
        { name: 'endDate', type: 'datetime(6)', isNullable: false },
        { name: 'reference', type: 'varchar', length: '255', isNullable: false },
        { name: 'pdfId', type: 'int', isNullable: true },
      ],
    }), true);
    await queryRunner.createForeignKeys('seller_payout', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_ba291220bb8a8198b41af5b3fc7',
        columnNames: ['requestedById'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_878c15e23faca012e8279d296a8',
        columnNames: ['transferId'],
        referencedTableName: 'transfer',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'RESTRICT',
        onUpdate: 'NO ACTION',
        name: 'FK_57f50cd5e7f8f80414395fdde40',
        columnNames: ['pdfId'],
        referencedTableName: 'seller_payout_pdf',
        referencedColumnNames: ['id'],
      }),
    ]);

    // =========================
    // Section K. Files, banners, server settings, base file
    // =========================

    await queryRunner.createTable(new Table({
      name: 'base_file',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_91f19c398debec3f46e7ef5f4b', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('base_file', new TableForeignKey({
      name: 'FK_e3163d85b9568a2e2356dbf3780',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'banner_image',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'downloadName', type: 'varchar', length: '255', isNullable: false },
        { name: 'location', type: 'varchar', length: '255', isNullable: false },
        { name: 'createdById', type: 'int', isNullable: false },
      ],
      indices: [
        { name: 'IDX_3fa8a4d985319d91f18bc11ed3', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('banner_image', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_2f6cb6fb09229237f0542a00b50',
      columnNames: ['createdById'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'banner',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '255', isNullable: false },
        { name: 'duration', type: 'int', isNullable: false },
        { name: 'active', type: 'tinyint', default: 0, isNullable: false },
        { name: 'startDate', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: false },
        { name: 'endDate', type: 'datetime', isNullable: false },
        { name: 'imageId', type: 'int', isNullable: true },
      ],
      indices: [
        { name: 'IDX_98c7dae97e53e193244b6e695a', columnNames: ['createdAt'] },
      ],
      uniques: [
        { name: 'REL_6a6cc2453a0675d3e2cad3070c', columnNames: ['imageId'] },
      ],
    }), true);
    await queryRunner.createForeignKey('banner', new TableForeignKey({
      name: 'FK_6a6cc2453a0675d3e2cad3070c0',
      columnNames: ['imageId'],
      referencedTableName: 'banner_image',
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'server_setting',
      engine: 'InnoDB',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'key', type: 'varchar', length: '255', isNullable: false },
        { name: 'value', type: 'text', isNullable: false },
      ],
      uniques: [
        { name: 'UQ_47b83d413b2f2d6684c10468650', columnNames: ['key'] },
      ],
    }), true);

    // =========================
    // Section L. Authenticators and local accounts
    // =========================

    await queryRunner.createTable(new Table({
      name: 'ean_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'eanCode', type: 'varchar', length: '255', isNullable: false },
      ],
      indices: [
        { name: 'IDX_de87f2e595ba08f5800d334f59', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('ean_authenticator', new TableForeignKey({
      name: 'FK_36cdeedf28dd4a53fdce6b63d45',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'key_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'hash', type: 'varchar', length: '128', isNullable: false },
      ],
      indices: [
        { name: 'IDX_13b1ced93790bf87059147e25d', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('key_authenticator', new TableForeignKey({
      name: 'FK_dd2cfdfc47f968d2b43f679085a',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'ldap_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'UUID', type: 'varchar', length: '32', isNullable: false },
      ],
      indices: [
        { name: 'IDX_0f425d81525960879043858973', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('ldap_authenticator', new TableForeignKey({
      name: 'FK_078b5c39c4f95284b2432659cfd',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'local_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'hash', type: 'varchar', length: '128', isNullable: false },
      ],
      indices: [
        { name: 'IDX_54496afaf5d75195e91453a312', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('local_authenticator', new TableForeignKey({
      name: 'FK_78485f0182144860f880119e819',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'local_user',
      engine: 'InnoDB',
      columns: [
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'passwordHash', type: 'varchar', length: '128', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('local_user', new TableForeignKey({
      name: 'FK_0a390f6d32bff639d6d6790f79c',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }));

    await queryRunner.createTable(new Table({
      name: 'member_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'authenticateAsId', type: 'int', isPrimary: true },
      ],
      indices: [
        { name: 'IDX_adbeb4fa2591bf41d3acea5452', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKeys('member_authenticator', [
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_915911173233837e76184d9187b',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
      new TableForeignKey({
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        name: 'FK_1b2c38d5eed7a76676147f66bc8',
        columnNames: ['authenticateAsId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
      }),
    ]);

    await queryRunner.createTable(new Table({
      name: 'nfc_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'nfcCode', type: 'varchar', length: '128', isNullable: false },
      ],
      indices: [
        { name: 'IDX_b744672f9037239c8fd00223ec', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('nfc_authenticator', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_dbfd146b964e7ef3a956281162e',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'pin_authenticator',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'hash', type: 'varchar', length: '128', isNullable: false },
      ],
      indices: [
        { name: 'IDX_052778557e67f46df4a55e3670', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('pin_authenticator', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_c1d1f7d7798b4163ccc4834f5fe',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'reset_token',
      engine: 'InnoDB',
      columns: [
        { name: 'createdAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'updatedAt', type: 'datetime(6)', default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)', isNullable: false },
        { name: 'version', type: 'int', isNullable: false },
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'hash', type: 'varchar', length: '128', isNullable: false },
        { name: 'expires', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: false },
      ],
      indices: [
        { name: 'IDX_6a6b2774850a62749860e15e5b', columnNames: ['createdAt'] },
      ],
    }), true);
    await queryRunner.createForeignKey('reset_token', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_1d61419c157e5325204cbee7a28',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));

    await queryRunner.createTable(new Table({
      name: 'gewis_user',
      engine: 'InnoDB',
      columns: [
        { name: 'userId', type: 'int', isPrimary: true },
        { name: 'gewisId', type: 'int', isNullable: false },
      ],
    }), true);
    await queryRunner.createForeignKey('gewis_user', new TableForeignKey({
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      name: 'FK_6a4af2884aa295cb269d1bcf2ba',
      columnNames: ['userId'],
      referencedTableName: 'user',
      referencedColumnNames: ['id'],
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('This down migration would remove the entire database.');
  }
}
