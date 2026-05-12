/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
 * A `SubTransaction` is one seller's slice of a {@link transactions!Transaction | Transaction}.
 * Where the parent transaction records "this user spent money at this POS", the sub-transaction
 * records "and this much of it goes to this organ". A transaction with one container in the
 * basket has one sub-transaction; a basket that mixes containers from three organs has three.
 *
 * ### Roles on the sub-transaction
 * - `to` is the user being credited -- the
 *   {@link catalogue/containers!Container | Container} owner (typically a GEWIS organ).
 * - `container` is the
 *   {@link catalogue/containers!ContainerRevision | ContainerRevision} the products were
 *   bought from. It is a revision so historical sub-transactions keep resolving even after
 *   the container is edited.
 * - `transaction` is the parent {@link transactions!Transaction | Transaction}; cascading
 *   delete on the parent removes the sub-transaction with it.
 *
 * ### Rows
 * Product lines live on {@link SubTransactionRow}: one row per product, with an `amount`
 * (quantity) and a {@link catalogue/products!ProductRevision | ProductRevision} reference.
 * The revision pins price (incl. VAT), VAT group, and category at the moment of sale.
 *
 * ### Invoicing
 * A row can carry an `invoiceId` linking it to an {@link invoicing!Invoice | Invoice}. That
 * marks the row as "billed to the invoiced customer" rather than charged directly to the
 * buyer's balance. {@link balance | Balance} reads treat invoiced rows the same as any other
 * row when computing the seller side; the invoice flow handles the buyer side separately.
 *
 * ### Why it exists
 * Splitting per-seller lets a single POS purchase pay multiple organs in one ring-up. Without
 * sub-transactions you would need either one transaction per organ (and the cashier ringing
 * up the same basket three times) or a denormalised seller field on each row (with reports
 * gathering and grouping on the fly).
 *
 * @module transactions/sub-transactions
 * @mergeTarget
 */

/* eslint-disable import/no-cycle */
import {
  Entity, ManyToOne, OneToMany,
} from 'typeorm';
import Transaction from './transaction';
import BaseEntity from '../base-entity';
import User from '../user/user';
import ContainerRevision from '../container/container-revision';
import SubTransactionRow from './sub-transaction-row';

/**
 * TypeORM entity for the `sub_transaction` table. One per (transaction, container) pair: the
 * portion of a transaction that credits a single container owner.
 * @typedef {BaseEntityWithoutId} SubTransaction
 * @property {User.model} to.required - The account that the transaction is added to.
 * @property {Container.model} container.required - The container from which all products in the
 * SubTransactionRows are bought.
 * @property {Transaction.model} transaction.required - The parent transaction.
 * @property {Array.<SubTransactionRow>} subTransactionsRows.required - The rows of this
 * SubTransaction.
 */
@Entity()
export default class SubTransaction extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  public to: User;

  @ManyToOne(() => ContainerRevision, { nullable: false })
  public container: ContainerRevision;

  @ManyToOne(() => Transaction,
    (transaction) => transaction.subTransactions,
    { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  public transaction: Transaction;

  @OneToMany(() => SubTransactionRow,
    (subTransactionRow) => subTransactionRow.subTransaction,
    { cascade: true })
  public subTransactionRows: SubTransactionRow[];
}
