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
 * A `Transaction` is one purchase at a SudoSOS point of sale: one person paid for a basket of
 * products. The buyer is on the transaction (`from`); the products and prices live one level
 * down on {@link transactions/sub-transactions!SubTransaction | SubTransactions}.
 *
 * ### Why it splits
 * A {@link catalogue/point-of-sale!PointOfSale | PointOfSale} can expose products from
 * containers belonging to different sellers (typically different GEWIS organs), so a single
 * basket can mix sellers. The basket is recorded as one transaction with one sub-transaction
 * per container. Each sub-transaction credits its container's owner; the transaction itself
 * only debits the buyer.
 *
 * ### From vs. createdBy
 * - `from` is the user whose balance is charged.
 * - `createdBy` is the user that recorded the transaction.
 *
 * They are usually the same person. They differ on shared bar shifts: a cashier rings up
 * purchases for buyers who do not have an authenticated session of their own, so the cashier
 * is `createdBy` and the buyer is `from`. Whether this is allowed depends on the POS's
 * `useAuthentication` flag and the cashier role on the
 * {@link catalogue/point-of-sale!PointOfSale | PointOfSale}.
 *
 * ### Price freezing
 * The `pointOfSale` reference is a {@link catalogue/point-of-sale!PointOfSaleRevision |
 * PointOfSaleRevision}, not a live `PointOfSale`. Sub-transaction rows reference
 * {@link catalogue/products!ProductRevision | ProductRevisions}; their containers reference
 * {@link catalogue/containers!ContainerRevision | ContainerRevisions}. Everything the
 * transaction needs to reproduce the basket -- product price, VAT group, category, container
 * membership, POS layout -- is pinned at the revision in force at the moment of sale. Editing
 * any of those later creates a new revision and leaves historical transactions untouched.
 *
 * ### Balance impact
 * Each {@link transactions/sub-transactions!SubTransactionRow | SubTransactionRow} debits the
 * transaction's `from` user (the buyer) and credits its sub-transaction's `to` user (the
 * container owner). See {@link balance | Balance} for how these movements roll up.
 *
 * ### PDF receipts
 * `Transaction` is `PdfAble`. `GET /transactions/{id}/pdf` returns a PDF receipt via
 * `TransactionPdfService`.
 *
 * @module transactions
 * @mergeTarget
 */

import {
  Entity, ManyToOne, OneToMany,
} from 'typeorm';
// eslint-disable-next-line import/no-cycle
import SubTransaction from './sub-transaction';
import User from '../user/user';
import BaseEntity from '../base-entity';
import PointOfSaleRevision from '../point-of-sale/point-of-sale-revision';
import { UnstoredPdfAble } from '../file/pdf-able';
import TransactionPdfService from '../../service/pdf/transaction-pdf-service';

/**
 * TypeORM entity for the `transaction` table. Holds the buyer-side record of one purchase at
 * a {@link catalogue/point-of-sale!PointOfSale | PointOfSale}. The actual product lines and
 * seller-side credits live on the related
 * {@link transactions/sub-transactions!SubTransaction | SubTransactions}, which cascade
 * on save.
 * @typedef {BaseEntity} Transaction
 * @property {User.model} from.required - The account from which the transaction is subtracted.
 * @property {User.model} createdBy.required - The user that created the transaction.
 * @property {Array.<SubTransaction>} subTransactions.required - The subTransactions belonging
 * to this transaction.
 * @property {PointOfSaleRevision.model} pointOfSale.required - The pointOfSale from which the
 * products in the transaction are bought.
 */
@Entity()
export default class Transaction extends UnstoredPdfAble(BaseEntity) {
  @ManyToOne(() => User, { nullable: false })
  public from: User;

  @ManyToOne(() => User, { nullable: false })
  public createdBy: User;

  @OneToMany(() => SubTransaction,
    (subTransaction) => subTransaction.transaction,
    { cascade: true, onUpdate: 'CASCADE' })
  public subTransactions: SubTransaction[];

  @ManyToOne(() => PointOfSaleRevision)
  public pointOfSale: PointOfSaleRevision;

  pdfService = new TransactionPdfService();
}