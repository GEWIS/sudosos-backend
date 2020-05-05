import {
  Entity, Column,
} from 'typeorm';
import BaseEntity from './base-entity';

@Entity()
/**
 * @typedef {BaseEntity} ProductCategory
 * @property {string} name.required - The unique name of the product category.
 */
export default class ProductCategory extends BaseEntity {
  @Column({
    unique: true,
    length: 64,
  })
  public name: string;
}
