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
import { defaultAfter, defaultBefore, DefaultContext } from '../../helpers/test-helpers';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import User from '../../../src/entity/user/user';
import { createTransactions } from '../../helpers/transaction-factory';
import SellerPayoutService from '../../../src/service/seller-payout-service';
import {
  seedContainers,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts, seedTransactions,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import FileService from '../../../src/service/file-service';

describe('SellerPayoutPdfService', () => {
  let ctx: any & DefaultContext;

  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;

    const users = await seedUsers();
    const vatGropus = await seedVatGroups();
    const categories = await seedProductCategories();
    const { productRevisions } = await seedProducts(users, categories, vatGropus);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions);

    ctx = {
      ...ctx,
      users,
      transactions,
    };
  });

  after(async () => {
    await defaultAfter(ctx);
  });

  describe('should return a pdf', () => {
    it('should return a pdf', async () => {
      await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const transaction = (await createTransactions(debtor.id, creditor.id, 3)).transactions[0];
        const fromDate = new Date('2000-01-01') ;
        const tillDate = new Date('2050-01-01') ;

        const sellerPayout = await new SellerPayoutService().createSellerPayout({
          endDate: tillDate,
          reference: '',
          requestedById: creditor.id,
          startDate: fromDate,
        });

        // await sellerPayout.getOrCreatePdf();
        // console.error(sellerPayout);
      });
    });
  });

});

