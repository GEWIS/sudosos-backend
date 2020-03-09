/* eslint-disable import/no-cycle */
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, BaseEntity,
} from 'typeorm';
import Subtransaction from './subtransaction';
import User from './user';

/**
 * @typedef Transaction
 * @property {integer} transactionId.required - The auto-generated transaction id.
 * @property {User} from.required - The account from which the transaction is subtracted.
 * @property {User} to.required - The user to which the transaction is added.
 * @property {User} createdBy - The user that created the transaction, if not same as 'from'.
 * @property {decimal} balance.required - The total balance processed in the transaction.
 * @property {Array.<Subtransaction>} subtransactions.required - The subtransactions belonging to this transaction.
 */
@Entity()
export default class Transaction extends BaseEntity {
  @PrimaryGeneratedColumn()
  public subtransactionId?: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'from' })
  public from: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'to' })
  public to: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  public createdBy?: User;

  @Column({
    type: 'decimal',
    precision: 64,
    scale: 2,
  })
  public balance: number;

  @OneToMany(() => Subtransaction, (subtransaction) => subtransaction.transaction)
  public subtransactions: Subtransaction;
}
