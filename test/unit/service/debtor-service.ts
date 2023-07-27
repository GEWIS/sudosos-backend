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
import { Connection } from 'typeorm';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import {
  seedContainers,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions,
  seedTransfers,
  seedUsers,
  seedVatGroups,
} from '../../seed';
import Database from '../../../src/database/database';
import Transaction from '../../../src/entity/transactions/transaction';
import SubTransaction from '../../../src/entity/transactions/sub-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import DebtorService from '../../../src/service/debtor-service';
import { calculateBalance } from './balance-service';
import { expect } from 'chai';
import { addTransfer } from '../../helpers/transaction-helpers';
import BalanceService from '../../../src/service/balance-service';
import Fine from '../../../src/entity/fine/fine';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';

function calculateFine(balance: number): number {
  // Fine is 20%, rounded down to whole euros with a maximum of 5 euros.
  return Math.max(0, Math.min(Math.floor(balance * -0.2 / 100), 5) * 100);
}

describe('DebtorService', (): void => {
  let ctx: {
    connection: Connection,
    users: User[],
    productRevisions: ProductRevision[],
    containerRevisions: ContainerRevision[],
    pointOfSaleRevisions: PointOfSaleRevision[],
    transactions: Transaction[],
    subTransactions: SubTransaction[],
    transfers: Transfer[],
  };

  beforeEach(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();
    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts(users, categories, vatGroups);
    const { containerRevisions } = await seedContainers(users, productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
    const { transactions } = await seedTransactions(users, pointOfSaleRevisions, new Date('2020-02-12'), new Date('2021-11-30'), 10);
    const transfers = await seedTransfers(users, new Date('2020-02-12'), new Date('2021-11-30'));
    const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
      .map((t) => t.subTransactions));

    ctx = {
      connection,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
    };
  });

  afterEach(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.destroy();
  });

  describe('calculateFinesOnDate', () => {
    it('should return everyone who should get fined', async () => {
      const calculatedFines = await DebtorService.calculateFinesOnDate({});
      const usersToFine = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers))
        .filter((b) => b.amount.getAmount() <= -500);
      expect(calculatedFines.length).to.equal(usersToFine.length);

      calculatedFines.forEach((f) => {
        const u = usersToFine.find((b) => b.user.id === f.id);
        expect(u).to.not.be.undefined;
        expect(f.amount.amount).to.equal(calculateFine(u.amount.getAmount()));
      });
    });

    it('should only return users from given userTypes', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.INVOICE];
      const calculatedFines = await DebtorService.calculateFinesOnDate({
        userTypes,
      });
      const usersToFine = ctx.users
        .filter((u) => userTypes.includes(u.type))
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers))
        .filter((b) => b.amount.getAmount() <= -500);
      expect(calculatedFines.length).to.equal(usersToFine.length);

      calculatedFines.forEach((f) => {
        const u = usersToFine.find((b) => b.user.id === f.id);
        expect(u).to.not.be.undefined;
        expect(userTypes).to.include(u.user.type);
        expect(f.amount.amount).to.equal(calculateFine(u.amount.getAmount()));
      });
    });

    it('should only return users that have more than 5 euros debt now and on reference date', async () => {
      const referenceDate = new Date('2021-02-12');
      const calculatedFines = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const usersToFine = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers, referenceDate))
        .filter((b) => b.amount.getAmount() <= -500)
        .filter((b) => calculateBalance(b.user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount() <= -500);
      expect(calculatedFines.length).to.equal(usersToFine.length);

      calculatedFines.forEach((f) => {
        const u = usersToFine.find((b) => b.user.id === f.id);
        expect(u).to.not.be.undefined;
        expect(f.amount.amount).to.equal(calculateFine(u.amount.getAmount()));
      });
    });
    it('should return 1 euro fine with a balance of exactly -5 euros', async () => {
      let newUser = Object.assign(new User(), {
        firstName: 'TestUser',
        type: UserType.LOCAL_USER,
        ofAge: true,
        active: true,
        acceptedToS: TermsOfServiceStatus.ACCEPTED,
      });
      newUser = await newUser.save();
      const transfer = await addTransfer(newUser, ctx.users, false, undefined, 500);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-500);

      const fines = await DebtorService.calculateFinesOnDate({});
      const fineForUser = fines.find((f) => f.id === newUser.id);
      expect(fineForUser).to.not.be.undefined;
      expect(fineForUser.amount.amount).to.equal(100);
    });
  });

  describe('handOutFines', async () => {
    async function checkCorrectNewBalance(fines: Fine[]) {
      const balances = await BalanceService.getBalances({});
      balances.records.forEach((b) => {
        const user = ctx.users.find((u) => u.id === b.id);
        expect(user).to.not.be.undefined;
        const fine = fines.find((f) => f.userFineCollection.userId === b.id);

        let balance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount();
        if (fine) balance = balance - fine.amount.getAmount();
        expect(b.amount.amount).to.equal(balance);
      });
    }

    function checkFine(f: Fine, date: Date, fineGroup: FineHandoutEvent) {
      const user = ctx.users.find((u) => u.id === f.userFineCollection.userId);
      expect(user).to.not.be.undefined;
      const b = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);

      expect(f.userFineCollection).to.not.be.undefined;
      expect(f.fineGroup.id).to.equal(fineGroup.id);
      expect(f.transfer).to.not.be.null;
      expect(f.transfer).to.not.be.undefined;
      expect(f.transfer.from.id).to.equal(f.userFineCollection.userId);
      expect(f.transfer.to).to.be.undefined;
      expect(f.transfer.amount.getAmount()).to.equal(f.amount.getAmount());
      const balString = '-€' + (b.amount.getAmount() / 100).toFixed(2).substring(1);
      expect(f.transfer.description).to.equal(`Fine for balance of ${balString} on ${date.toLocaleDateString()}.`);
    }

    it('should correctly create first fines without reference date', async () => {
      const usersToFine = await DebtorService.calculateFinesOnDate({});
      const fines = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
      });
      expect(fines.length).to.equal(usersToFine.length);

      fines.forEach((f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineCollection.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(new Date().getTime() - f.fineGroup.referenceDate.getTime()).to.be.at.most(1000);
        checkFine(f, new Date(), fines[0].fineGroup);
      });

      await checkCorrectNewBalance(fines);
    });
    it('should correctly create fines with reference date', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const fines = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
        referenceDate,
      });
      expect(fines.length).to.equal(usersToFine.length);

      fines.forEach((f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineCollection.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(f.fineGroup.referenceDate.getTime()).to.equal(referenceDate.getTime());
        checkFine(f, referenceDate, fines[0].fineGroup);
      });

      await checkCorrectNewBalance(fines);
    });
    it('should correctly calculate fines based on date of previous fines', async () => {
      const oldRef = new Date('2020-08-01');
      const referenceDate = new Date('2021-01-30');

      // Two finegroups, so we can check that the newest one is used
      await Object.assign(new FineHandoutEvent(), {
        createdAt: oldRef,
        updatedAt: oldRef,
        referenceDate: oldRef,
      }).save();
      await Object.assign(new FineHandoutEvent(), {
        createdAt: referenceDate,
        updatedAt: referenceDate,
        referenceDate,
      }).save();

      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const fines = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
      });
      expect(fines.length).to.equal(usersToFine.length);

      fines.forEach((f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineCollection.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(f.fineGroup.referenceDate.getTime()).to.equal(referenceDate.getTime());
        checkFine(f, referenceDate, fines[0].fineGroup);
      });

      await checkCorrectNewBalance(fines);
    });
    it('should correctly put two fines in same userFineCollection', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const user = usersToFine[0];
      expect(user).to.not.be.undefined;

      const fines1 = await DebtorService.handOutFines({
        userIds: [user.id],
      });
      const fines2 = await DebtorService.handOutFines({
        userIds: [user.id],
      });

      expect(fines1.length).to.equal(1);
      expect(fines2.length).to.equal(1);
      expect(fines1[0].userFineCollection.userId).to.equal(user.id);
      expect(fines2[0].userFineCollection.userId).to.equal(user.id);
      expect(fines1[0].userFineCollection.id).to.equal(fines2[0].userFineCollection.id);
      const collection = await UserFineGroup.findOne({
        where: { id: fines1[0].userFineCollection.id },
        relations: ['fines'],
      });
      expect(collection.fines.length).to.equal(2);
    });
  });
});
