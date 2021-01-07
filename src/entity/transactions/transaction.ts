/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 * @typedef {Transaction} Transaction
 * @property {User.model} from.required - The account from which the transaction is subtracted.
 * @property {User.model} createdBy - The user that created the transaction, if not same as 'from'.
 * @property {Array.<SubTransaction>} subtransactions.required - The subtransactions belonging
 *    to this transaction.
 */
@Entity()
export default class Transaction extends BaseEntity {
  @ManyToOne(() => User, { nullable: false })
  public from: User;

  @ManyToOne(() => User, { nullable: true })
  public createdBy?: User;

  @OneToMany(() => SubTransaction, (subTransaction) => subTransaction.transaction)
  public subTransactions: SubTransaction[];

  @ManyToOne(() => PointOfSaleRevision)
  public pointOfSale: PointOfSaleRevision;
}
