/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
import WithManager from '../../../src/database/with-manager';
import User, { UserType } from '../../../src/entity/user/user';
import PayoutRequest from '../../../src/entity/transactions/payout/payout-request';
import Transfer from '../../../src/entity/transactions/transfer';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import PayoutRequestStatus, { PayoutRequestState } from '../../../src/entity/transactions/payout/payout-request-status';

export default class PayoutRequestSeeder extends WithManager {
  public async seed(users: User[]): Promise<{
    payoutRequests: PayoutRequest[], payoutRequestTransfers: Transfer[],
  }> {
    const payoutRequests: Promise<PayoutRequest>[] = [];
    const transfers: Transfer[] = [];

    const admins = users.filter((u) => u.type === UserType.LOCAL_ADMIN);
    admins.push(undefined);

    const totalNrOfStatuses = 3;
    let finalState = 0;

    for (let i = 0; i < users.length * 3; i += 1) {
      const requestedBy = users[Math.floor(i / totalNrOfStatuses)];
      const amount = DineroTransformer.Instance.from(3900);
      const newPayoutReq = Object.assign(new PayoutRequest(), {
        requestedBy,
        amount,
        bankAccountNumber: 'NL69GEWI0420042069',
        bankAccountName: `${requestedBy.firstName} ${requestedBy.lastName}`,
      });

      const option = Math.floor(finalState % 3);
      let lastOption;
      switch (option) {
        case 0: lastOption = PayoutRequestState.APPROVED; break;
        case 1: lastOption = PayoutRequestState.DENIED; break;
        default: lastOption = PayoutRequestState.CANCELLED; break;
      }
      const states = [PayoutRequestState.CREATED, lastOption].slice(0, i % totalNrOfStatuses);
      if (states.length === 2) finalState += 1;

      const statusses: PayoutRequestStatus[] = [];
      states.forEach((state, index) => {
        statusses.push(Object.assign(new PayoutRequestStatus(), {
          state,
          createdAt: new Date((new Date()).getTime() + 1000 * 60 * index),
          updatedAt: new Date((new Date()).getTime() + 1000 * 60 * index),
        }));
        if (state === PayoutRequestState.APPROVED) {
          newPayoutReq.approvedBy = admins[i % admins.length];
        }
      });

      if (i % 5 === 0) {
        const transfer = await this.manager.save(Transfer, {
          from: requestedBy,
          to: null,
          amountInclVat: amount,
          description: `Payout request for ${amount}`,
        });
        transfer.payoutRequest = newPayoutReq;
        transfers.push(transfer);
        newPayoutReq.transfer = transfer;
      }

      payoutRequests.push(this.manager.save(newPayoutReq).then(async (payoutRequest) => {
        await Promise.all(statusses.map((s) => {
          // eslint-disable-next-line no-param-reassign
          s.payoutRequest = payoutRequest;
          return this.manager.save(s);
        }));
        // eslint-disable-next-line no-param-reassign
        payoutRequest.payoutRequestStatus = statusses;
        return payoutRequest;
      }));
    }

    return {
      payoutRequests: await Promise.all(payoutRequests),
      payoutRequestTransfers: transfers,
    };
  }
}
