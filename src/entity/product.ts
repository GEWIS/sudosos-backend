import {
  Entity, PrimaryGeneratedColumn, Column,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import DineroTransformer from './transformer/dinero-transformer';

@Entity()
/**
 * @typedef Product
 * @property {integer} productId.required - The auto-generated product id.
 * @property {string} name.required - The unique name of the product.
 * @property {decimal} price.required - The price of each product.
 */
export default class Product {
  @PrimaryGeneratedColumn()
  public productId?: number;

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
}
