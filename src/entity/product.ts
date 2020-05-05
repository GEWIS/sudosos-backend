import {
  Entity, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import DineroTransformer from './transformer/dinero-transformer';
import BaseEntity from './base-entity';
import User from './user';
import ProductCategory from './product-category';

@Entity()
/**
 * @typedef {BaseEntity} Product
 * @property {string} name.required - The unique name of the product.
 * @property {Dinero.model} price.required - The price of each product.
 * @property {User.model} owner.required - The owner of this product entity.
 * @property {ProductCategory.model} category.required - The category this product belongs to.
 * @property {string} picture.required - The URL to the picture representing this product.
 * @property {decimal} alcoholPercentage.required - The percentage of alcohol in this product.
 */
export default class Product extends BaseEntity {
  @Column({
    unique: true,
    length: 64,
  })
  public name: string;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public price: Dinero;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'owner' })
  public owner: User;

  @ManyToOne(() => ProductCategory, { nullable: false })
  public category: ProductCategory;

  @Column()
  public picture: String;

  @Column({
    type: 'decimal',
    scale: 2,
  })
  public alcoholPercentage: number;
}
