/* eslint-disable import/no-cycle */
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import Product from './product';
import Transaction from './transaction';

/**
 * @typedef Subtransaction
 * @property {integer} subtransactionId.required - The auto-generated subtransaction id.
 * @property {Product} product.required - The product sold in the subtransaction.
 * @property {integer} amount.required - The amount of product involved in this subtransaction.
 * @property {decimal} price.required - The price of each product in this subtransaction.
 */
@Entity()
export default class Subtransaction {
  @PrimaryGeneratedColumn()
  public subtransactionId?: number;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  public product: Product;

  @Column({
    type: 'integer',
  })
  public amount: number;

  @Column({
    type: 'decimal',
    precision: 64,
    scale: 2,
  })
  public price: number;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transaction' })
  public transaction: Transaction;
}
