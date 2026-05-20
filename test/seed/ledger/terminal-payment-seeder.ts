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

import WithManager from '../../../src/database/with-manager';
import User from '../../../src/entity/user/user';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';
import StripePaymentIntentStatus, {
  StripePaymentIntentState,
} from '../../../src/entity/stripe/stripe-payment-intent-status';
import TerminalPayment from '../../../src/entity/transactions/terminal/terminal-payment';
import TmpTransaction from '../../../src/entity/transactions/terminal/tmp-transaction';
import Transaction from '../../../src/entity/transactions/transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';

export default class TerminalPaymentSeeder extends WithManager {
  /**
   * Create a single TerminalPayment in the CREATED state for dev seeding.
   *
   * @param user - The user initiating the terminal payment.
   */
  public async init(user: User): Promise<{ terminalPayment: TerminalPayment }> {
    const amount = DineroTransformer.Instance.from(2500);

    const stripePaymentIntent = await this.manager.save(StripePaymentIntent, {
      stripeId: `FakeTerminalPaymentIntent_${user.id}`,
      amount,
      paymentIntentStatuses: [],
    });

    const status = await this.manager.save(StripePaymentIntentStatus, {
      stripePaymentIntent,
      state: StripePaymentIntentState.CREATED,
    });
    stripePaymentIntent.paymentIntentStatuses.push(status);

    const tmpTransaction = await this.manager.save(TmpTransaction, Object.assign(new TmpTransaction(), {
      from: user,
      createdBy: user,
      subTransactions: [],
    }));

    const terminalPayment = await this.manager.save(TerminalPayment, {
      stripePaymentIntent,
      temporaryTransaction: tmpTransaction,
    } as TerminalPayment);

    return { terminalPayment };
  }

  /**
   * Create a set of mock TerminalPayment entries. The Stripe IDs are fake, so
   * these entries cannot be used for real Stripe API calls.
   *
   * For every user a TerminalPayment in the CREATED state (with a TmpTransaction)
   * is created. When transactions are supplied, every transaction is additionally
   * converted into a PAID TerminalPayment: the TmpTransaction is replaced by a
   * finalTransaction and a Transfer whose amount equals the total value of the
   * transaction's sub-transaction rows.
   *
   * @param users - The users that initiate the CREATED terminal payments.
   * @param transactions - Existing transactions to back PAID terminal payments
   * with. Must have subTransactions, subTransactionRows and products loaded so
   * the transfer total can be computed.
   */
  public async seed(users: User[], transactions: Transaction[] = []): Promise<{
    terminalPayments: TerminalPayment[],
    stripePaymentIntents: StripePaymentIntent[],
    tmpTransactions: TmpTransaction[],
    transfers: Transfer[],
  }> {
    const terminalPayments: TerminalPayment[] = [];
    const stripePaymentIntents: StripePaymentIntent[] = [];
    const tmpTransactions: TmpTransaction[] = [];
    const transfers: Transfer[] = [];

    for (let i = 0; i < users.length; i += 1) {
      const user = users[i];
      const amount = DineroTransformer.Instance.from(1000 * (i + 1));

      // eslint-disable-next-line no-await-in-loop
      const stripePaymentIntent = await this.manager.save(StripePaymentIntent, {
        stripeId: `FakeTerminalPaymentIntentDoNotUse_${i + 1}`,
        amount,
        paymentIntentStatuses: [],
      });

      // eslint-disable-next-line no-await-in-loop
      const status = await this.manager.save(StripePaymentIntentStatus, {
        stripePaymentIntent,
        state: StripePaymentIntentState.CREATED,
      });
      stripePaymentIntent.paymentIntentStatuses.push(status);

      // eslint-disable-next-line no-await-in-loop
      const tmpTransaction = await this.manager.save(TmpTransaction, Object.assign(new TmpTransaction(), {
        from: user,
        createdBy: user,
        subTransactions: [],
      }));

      // eslint-disable-next-line no-await-in-loop
      const terminalPayment = await this.manager.save(TerminalPayment, Object.assign(new TerminalPayment(), {
        stripePaymentIntent,
        temporaryTransaction: tmpTransaction,
      }));

      stripePaymentIntents.push(stripePaymentIntent);
      tmpTransactions.push(tmpTransaction);
      terminalPayments.push(terminalPayment);
    }

    for (let i = 0; i < transactions.length; i += 1) {
      const transaction = transactions[i];
      let cost = 0;
      for (const subTransaction of transaction.subTransactions) {
        for (const row of subTransaction.subTransactionRows) {
          cost += row.amount * row.product.priceInclVat.getAmount();
        }
      }
      const amount = DineroTransformer.Instance.from(cost);

      // eslint-disable-next-line no-await-in-loop
      const stripePaymentIntent = await this.manager.save(StripePaymentIntent, {
        stripeId: `FakeTerminalPaymentIntentPaidDoNotUse_${i + 1}`,
        amount,
        paymentIntentStatuses: [],
      });

      const intentStates = [
        StripePaymentIntentState.CREATED,
        StripePaymentIntentState.PROCESSING,
        StripePaymentIntentState.SUCCEEDED,
      ];
      for (const state of intentStates) {
        // eslint-disable-next-line no-await-in-loop
        const status = await this.manager.save(StripePaymentIntentStatus, {
          stripePaymentIntent,
          state,
        });
        stripePaymentIntent.paymentIntentStatuses.push(status);
      }

      const transfer = Object.assign(new Transfer(), {
        from: null,
        to: transaction.from,
        amountInclVat: amount,
        description: 'Terminal payment',
      });
      // eslint-disable-next-line no-await-in-loop
      await this.manager.save(Transfer, transfer);

      // eslint-disable-next-line no-await-in-loop
      const terminalPayment = await this.manager.save(TerminalPayment, Object.assign(new TerminalPayment(), {
        stripePaymentIntent,
        finalTransaction: transaction,
        transfer,
      }));

      stripePaymentIntents.push(stripePaymentIntent);
      transfers.push(transfer);
      terminalPayments.push(terminalPayment);
    }

    return { terminalPayments, stripePaymentIntents, tmpTransactions, transfers };
  }
}
