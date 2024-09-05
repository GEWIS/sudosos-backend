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
import WithManager from '../../../src/with-manager';
import WriteOff from '../../../src/entity/transactions/write-off';
import User, { UserType } from '../../../src/entity/user/user';
import { UserSeeder } from '../index';
import generateBalance from '../../helpers/test-helpers';
import dinero from 'dinero.js';
import Transfer from '../../../src/entity/transactions/transfer';

export default class WriteOffSeeder extends WithManager {
  public async seed(count = 10): Promise<WriteOff[]> {
    const userCount = await User.count();
    const users = new UserSeeder().defineUsers(userCount, count, UserType.LOCAL_USER, false);
    await User.save(users);

    for (const u of users) {
      u.firstName = 'WriteOff';
      u.deleted = true;
      await generateBalance(-1000, u.id);
    }
    await User.save(users);

    const writeOffs: WriteOff[] = [];
    for (const u of users) {
      const writeOff = await this.manager.save(WriteOff, {
        to: u,
        amount: dinero({ amount: 1000 }),
      });
      writeOff.transfer = (await this.manager.save(Transfer, {
        amountInclVat: dinero({ amount: 1000 }),
        toId: u.id,
        description: 'WriteOff',
        fromId: null,
        writeOff,
      }));
      await this.manager.save(WriteOff, writeOff);

      writeOffs.push(writeOff);
    }
    return writeOffs;
  }
}
