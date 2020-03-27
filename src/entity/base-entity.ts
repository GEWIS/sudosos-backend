import {
  BaseEntity as OrmBaseEntity, CreateDateColumn, UpdateDateColumn, VersionColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * @typedef BaseEntity
 * @property {integer} id - The auto-generated object id.
 * @property {Date} createdAt - The creation date of the object.
 * @property {Date} updatedAt - The last update date of the object.
 * @property {integer} version - The current version of the object.
 */
export default class BaseEntity extends OrmBaseEntity {
  @PrimaryGeneratedColumn()
  public readonly id?: number;

  @CreateDateColumn({ update: false })
  public readonly createdAt: Date;

  @UpdateDateColumn()
  public readonly updatedAt: Date;

  @VersionColumn()
  public readonly version: number;
}
