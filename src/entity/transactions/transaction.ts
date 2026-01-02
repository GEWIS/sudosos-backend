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
 * This is the module page of the transaction.
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

/**
 * @typedef {BaseEntity} Transaction
 * @property {User.model} from.required - The account from which the transaction is subtracted.
 * @property {User.model} createdBy.required - The user that created the transaction.
 * @property {Array.<SubTransaction>} subTransactions.required - The subTransactions belonging
 * to this transaction.
 * @property {PointOfSaleRevision.model} pointOfSale.required - The pointOfSale from which the
 * products in the transaction are bought.
 */
@Entity()
export default class Transaction extends BaseEntity {
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
}
