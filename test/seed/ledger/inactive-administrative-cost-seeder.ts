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
 *
 *  @license
 */
import WithManager from '../../../src/database/with-manager';
import User from '../../../src/entity/user/user';
import InactiveAdministrativeCost from '../../../src/entity/transactions/inactive-administrative-cost';
import Transfer from '../../../src/entity/transactions/transfer';
import { getRandomDate } from '../helpers';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';

export default class InactiveAdministrativeCostSeeder extends WithManager {
  public async seed(
    users: User[],
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
      inactiveAdministrativeCosts: InactiveAdministrativeCost[],
      inactiveAdministrativeCostsTransfers: Transfer[]
    }> {
    let inactiveAdministrativeCosts: InactiveAdministrativeCost[] = [];
    let transfers: Transfer[] = [];

    for (let i = 0; i < users.length; i += 1) {
      let date = new Date();
      if (startDate && endDate) {
        date = getRandomDate(startDate, endDate, i);
      }

      const user = users[i];
      const amount = DineroTransformer.Instance.from(5);

      const inactiveAdministrativeCost = Object.assign(new InactiveAdministrativeCost(), {
        from: user,
        amount: amount,
        createdAt: date,
      });

      const transfer = Object.assign(new Transfer, {
        from: user,
        to: null,
        amountInclVat: amount,
        description: `Invoice Transfer for ${amount}`,
        createdAt: date,
      });
      await this.manager.save(Transfer, transfer);

      transfer.inactiveAdministrativeCost = inactiveAdministrativeCost;
      transfers.push(transfer);

      inactiveAdministrativeCost.transfer = transfer;

      await this.manager.save(InactiveAdministrativeCost, inactiveAdministrativeCost);

      inactiveAdministrativeCosts.push(inactiveAdministrativeCost);
    }

    return {
      inactiveAdministrativeCosts: inactiveAdministrativeCosts,
      inactiveAdministrativeCostsTransfers: transfers,
    };
  }
}