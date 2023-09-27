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
  AfterInsert,
  Entity, ManyToOne, OneToMany,
} from 'typeorm';
// eslint-disable-next-line import/no-cycle
import SubTransaction from './sub-transaction';
import User from '../user/user';
import BaseEntity from '../base-entity';
import PointOfSaleRevision from '../point-of-sale/point-of-sale-revision';
import BalanceService from '../../service/balance-service';
import Mailer from '../../mailer';
import UserDebtNotification from '../../mailer/templates/user-debt-notification';
import DineroTransformer from '../transformer/dinero-transformer';
import { getLogger } from 'log4js';

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

  @AfterInsert()
  // NOTE: this event listener is only called when calling .save() on a new Transaction object instance,
  // not .save() on the static method of the Transaction class
  async sendEmailNotificationIfNowInDebt() {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') return;

    const user = await User.findOne({ where: { id: this.from.id } });
    const balance = await BalanceService.getBalance(user.id);
    const currentBalance = balance.amount.amount - this.subTransactions[0].subTransactionRows[0].amount * this.subTransactions[0].subTransactionRows[0].product.priceInclVat.getAmount();

    if (currentBalance >= 0) return;
    // User is now in debt

    const balanceBefore = await BalanceService.getBalance(
      user.id,
      new Date(this.createdAt.getTime() - 1),
    );

    if (balanceBefore.amount.amount < 0) return;
    // User was not in debt before this new transaction

    Mailer.getInstance().send(user, new UserDebtNotification({
      name: user.firstName,
      balance: DineroTransformer.Instance.from(currentBalance),
      url: '',
    })).catch((e) => getLogger('Transaction').error(e));
  }
}
