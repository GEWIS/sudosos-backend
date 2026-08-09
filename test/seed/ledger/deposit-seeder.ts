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
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import Transfer from '../../../src/entity/transactions/transfer';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';
import StripePaymentIntentStatus, {
  StripePaymentIntentState,
} from '../../../src/entity/stripe/stripe-payment-intent-status';

export default class DepositSeeder extends WithManager {
  /**
   * Creates a single completed Stripe deposit for dev seeding.
   * Alice receives a EUR 50.00 top-up via a fake Stripe payment intent.
   *
   * @param user - The user to deposit to (alice).
   */
  public async init(user: User): Promise<{ stripeDeposit: StripeDeposit; transfer: Transfer }> {
    const amount = DineroTransformer.Instance.from(5000);

    const stripePaymentIntent = await this.manager.save(StripePaymentIntent, {
      // Unique per call, not per user: callers may seed more than one deposit
      // for the same user, and stripeId is a unique column.
      stripeId: `FakeStripeIDDevSeed_${user.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      amount,
      paymentIntentStatuses: [],
    });

    const stripeDeposit = await StripeDeposit.save({ stripePaymentIntent, to: user });

    const transfer = await this.manager.save(Transfer, {
      from: null,
      to: user,
      amountInclVat: amount,
      description: 'Dev seed Stripe deposit',
    });
    stripeDeposit.transfer = transfer;
    await this.manager.save(StripeDeposit, stripeDeposit);
    transfer.deposit = stripeDeposit;

    for (const state of [StripePaymentIntentState.CREATED, StripePaymentIntentState.PROCESSING, StripePaymentIntentState.SUCCEEDED]) {
      const status = await this.manager.save(StripePaymentIntentStatus, { stripePaymentIntent, state });
      stripePaymentIntent.paymentIntentStatuses.push(status);
    }

    return { stripeDeposit, transfer };
  }

  /**
   * Create mock stripe deposits objects. Note that the stripe IDs are fake, so you cannot use
   * these entries to make actual API calls to Stripe.
   * @param users
   */
  public async seed(users: User[]): Promise<{
    stripeDeposits: StripeDeposit[],
    stripeDepositTransfers: Transfer[],
  }> {
    const stripeDeposits: StripeDeposit[] = [];
    const transfers: Transfer[] = [];

    const totalNrOfStatuses = 3;

    for (let i = 0; i < users.length * totalNrOfStatuses + 1; i += 1) {
      const to = users[Math.floor(i / 4)];
      const amount = DineroTransformer.Instance.from(3900);
      // eslint-disable-next-line no-await-in-loop
      const stripePaymentIntent = await this.manager.save(StripePaymentIntent, {
        stripeId: `FakeStripeIDDoNotUsePleaseThankYou_${i + 1}`,
        amount,
        paymentIntentStatuses: [],
      });
      // eslint-disable-next-line no-await-in-loop
      const newDeposit = await StripeDeposit.save({
        stripePaymentIntent,
        to,
      });

      const succeeded = Math.floor(((i % 8) + 1) / 4) !== 1;
      // CANCELLED is mutually exclusive with SUCCEEDED and FAILED. Only cancel a small
      // subset of the non-succeeded deposits. The terminal state is only persisted for
      // deposits with a full status array (i % 4 === 3), so the condition must land there:
      // i % 24 === 11 picks i = 11, 35, 59, 83 (all non-succeeded, all i % 4 === 3).
      const cancelled = !succeeded && i % 24 === 11;
      let terminalState = StripePaymentIntentState.FAILED;
      if (succeeded) terminalState = StripePaymentIntentState.SUCCEEDED;
      else if (cancelled) terminalState = StripePaymentIntentState.CANCELLED;
      const states = [StripePaymentIntentState.CREATED, StripePaymentIntentState.PROCESSING,
        terminalState].slice(0, i % 4);

      if (succeeded) {
        const transfer = await this.manager.save(Transfer, {
          from: null,
          to,
          amountInclVat:amount,
          description: `Deposit transfer for ${amount}`,
        });
        newDeposit.transfer = transfer;
        await this.manager.save(StripeDeposit, newDeposit);
        transfer.deposit = newDeposit;
        transfers.push(transfer);
      }

      const statePromises: Promise<any>[] = [];
      states.forEach((state) => {
        const promise = this.manager.save(StripePaymentIntentStatus, {
          stripePaymentIntent,
          state,
        }).then((s) => stripePaymentIntent.paymentIntentStatuses.push(s));
        statePromises.push(promise);
      });

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(statePromises);
      stripeDeposits.push(newDeposit);
    }

    return {
      stripeDeposits,
      stripeDepositTransfers: transfers,
    };
  }
}
