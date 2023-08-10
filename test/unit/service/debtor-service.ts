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
  seedContainers, seedFines,
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
import { expect } from 'chai';
import { addTransfer } from '../../helpers/transaction-helpers';
import BalanceService from '../../../src/service/balance-service';
import Fine from '../../../src/entity/fine/fine';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';
import { calculateBalance, calculateFine } from '../../helpers/balance';
import { FineHandoutEventResponse } from '../../../src/controller/response/debtor-response';

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
    transfersInclFines: Transfer[],
    fines: Fine[],
    userFineGroups: UserFineGroup[],
  };

  before(async () => {
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
    const { fines, fineTransfers, userFineGroups } = await seedFines(users, transactions, transfers);

    ctx = {
      connection,
      users,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
      transfersInclFines: transfers.concat(fineTransfers),
      fines,
      userFineGroups,
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.destroy();
  });

  describe('calculateFinesOnDate', () => {
    it('should return everyone who should get fined', async () => {
      const calculatedFines = await DebtorService.calculateFinesOnDate({});
      const usersToFine = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines))
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
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines))
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
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines, referenceDate))
        .filter((b) => b.amount.getAmount() <= -500)
        .filter((b) => calculateBalance(b.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines).amount.getAmount() <= -500);
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
      const { transfer } = await addTransfer(newUser, ctx.users, false, undefined, 500);

      const balance = await BalanceService.getBalance(newUser.id);
      expect(balance.amount.amount).to.equal(-500);

      const fines = await DebtorService.calculateFinesOnDate({});
      const fineForUser = fines.find((f) => f.id === newUser.id);
      expect(fineForUser).to.not.be.undefined;
      expect(fineForUser.amount.amount).to.equal(100);

      await Transfer.remove(transfer);
      await User.remove(newUser);
    });
  });
  describe('deleteFine', () => {
    it('should correctly delete a single fine', async () => {
      const userFineGroup = ctx.userFineGroups.find((g) => g.fines.length === 1);
      let dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id }, relations: ['fines', 'fines.transfer'] });
      expect(dbUserFineGroup).to.not.be.null;
      expect(dbUserFineGroup.fines.length).to.equal(1);

      const fine = dbUserFineGroup.fines[0];
      expect(await DebtorService.deleteFine(fine.id)).to.not.throw;

      const dbFine = await Fine.findOne({ where: { id: fine.id } });
      expect(dbFine).to.be.null;
      const dbTransfer = await Transfer.findOne({ where: { id: fine.transfer.id } });
      expect(dbTransfer).to.be.null;
      dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id } });
      expect(dbUserFineGroup).to.be.null;
    });
    it('should correctly delete a single fine in a larger fineUserGroup', async () => {
      const userFineGroup = ctx.userFineGroups.find((g) => g.fines.length > 1);
      let dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id }, relations: ['fines', 'fines.transfer'] });
      expect(dbUserFineGroup).to.not.be.null;
      expect(dbUserFineGroup.fines.length).to.be.greaterThan(1);

      const fine = dbUserFineGroup.fines[0];
      expect(await DebtorService.deleteFine(fine.id)).to.not.throw;

      const dbFine = await Fine.findOne({ where: { id: fine.id } });
      expect(dbFine).to.be.null;
      const dbTransfer = await Transfer.findOne({ where: { id: fine.transfer.id } });
      expect(dbTransfer).to.be.null;
      dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id } });
      expect(dbUserFineGroup).to.not.be.null;
    });
    it('should not do anything when fine does not exist', async () => {
      const id = 9999999;
      const fine = await Fine.findOne({ where: { id } });
      expect(fine).to.be.null;
      expect(await DebtorService.deleteFine(id)).to.not.throw;
    });
  });

  /**
   * This function should be tested last, because it requires an empty Fines
   * table. It therefore destroys the initial state
   */
  describe('handOutFines', async () => {
    async function clearFines() {
      const fines = await Fine.find({ relations: ['transfer'] });
      const fineTransfers = fines.map((f) => f.transfer);

      await Fine.clear();
      await Transfer.remove(fineTransfers);
      await FineHandoutEvent.clear();
      await UserFineGroup.clear();
    }

    before(async () => {
      await clearFines();
      const fineTransfers = (await Transfer.find({ relations: ['fine'] })).filter((t) => t.fine != null);
      expect(fineTransfers.length).to.equal(0);
    });

    afterEach(async () => {
      await clearFines();
    });

    async function checkCorrectNewBalance(fines: Fine[]) {
      const balances = await BalanceService.getBalances({});
      balances.records.map((b) => {
        const user = ctx.users.find((u) => u.id === b.id);
        expect(user).to.not.be.undefined;
        const fine = fines.find((f) => f.userFineGroup.userId === b.id);

        let balance = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount();

        if (fine) balance = balance - fine.amount.getAmount();
        expect(b.amount.amount).to.equal(balance);
      });
    }

    async function checkFine(f: Fine, date: Date, fineGroup: FineHandoutEventResponse) {
      const user = ctx.users.find((u) => u.id === f.userFineGroup.userId);
      expect(user).to.not.be.undefined;
      const b = calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers, date);

      expect(f.userFineGroup).to.not.be.undefined;
      if (f.amount.getAmount() > 0) {
        expect((await User.findOne({
          where: { id: f.userFineGroup.userId },
          relations: ['currentFines'],
        })).currentFines.id).to.equal(f.userFineGroup.id);
      }
      expect(f.fineHandoutEvent.id).to.equal(fineGroup.id);
      expect(f.transfer).to.not.be.null;
      expect(f.transfer).to.not.be.undefined;
      expect(f.transfer.from.id).to.equal(f.userFineGroup.userId);
      expect(f.transfer.to).to.be.undefined;
      expect(f.transfer.amount.getAmount()).to.equal(f.amount.getAmount());
      const balString = '-€' + (b.amount.getAmount() / 100).toFixed(2).substring(1);
      expect(f.transfer.description).to.equal(`Fine for balance of ${balString} on ${date.toLocaleDateString()}.`);
    }

    it('should correctly create first fines without reference date', async () => {
      const usersToFine = await DebtorService.calculateFinesOnDate({});
      const fineHandoutEvent = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
      });
      expect(fineHandoutEvent.fines.length).to.equal(usersToFine.length);

      const fines = await Promise.all(fineHandoutEvent.fines.map((f) => Fine
        .findOne({ where: { id: f.id }, relations: ['transfer', 'transfer.from', 'fineHandoutEvent', 'userFineGroup', 'userFineGroup.user'] })));

      await Promise.all(fines.map(async (f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineGroup.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(new Date().getTime() - new Date(fineHandoutEvent.referenceDate).getTime()).to.be.at.most(1000);
        await checkFine(f, new Date(), fineHandoutEvent);
      }));

      await checkCorrectNewBalance(fines);
    });
    it('should correctly create fines with reference date', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const fineHandoutEvent = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
        referenceDate,
      });
      expect(fineHandoutEvent.fines.length).to.equal(usersToFine.length);

      const fines = await Promise.all(fineHandoutEvent.fines.map((f) => Fine
        .findOne({ where: { id: f.id }, relations: ['transfer', 'transfer.from', 'fineHandoutEvent', 'userFineGroup', 'userFineGroup.user'] })));

      await Promise.all(fines.map(async (f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineGroup.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(new Date(fineHandoutEvent.referenceDate).getTime()).to.equal(referenceDate.getTime());
        await checkFine(f, referenceDate, fineHandoutEvent);
      }));

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
      const fineHandoutEvent = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
      });
      expect(fineHandoutEvent.fines.length).to.equal(usersToFine.length);

      const fines = await Promise.all(fineHandoutEvent.fines.map((f) => Fine
        .findOne({ where: { id: f.id }, relations: ['transfer', 'transfer.from', 'fineHandoutEvent', 'userFineGroup', 'userFineGroup.user'] })));

      await Promise.all(fines.map(async (f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineGroup.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.amount.amount);
        expect(new Date(fineHandoutEvent.referenceDate).getTime()).to.equal(referenceDate.getTime());
        await checkFine(f, referenceDate, fineHandoutEvent);
      }));

      await checkCorrectNewBalance(fines);
    });
    it('should correctly put two fines in same userFineGroup', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDate,
      });
      const user = usersToFine[0];
      expect(user).to.not.be.undefined;

      const fineHandoutEvent1 = await DebtorService.handOutFines({
        userIds: [user.id],
      });
      const fineHandoutEvent2 = await DebtorService.handOutFines({
        userIds: [user.id],
      });

      expect(fineHandoutEvent1.fines.length).to.equal(1);
      expect(fineHandoutEvent2.fines.length).to.equal(1);
      expect(fineHandoutEvent1.fines[0].user.id).to.equal(user.id);
      expect(fineHandoutEvent2.fines[0].user.id).to.equal(user.id);
      expect(fineHandoutEvent1.fines[0].user.id).to.equal(fineHandoutEvent2.fines[0].user.id);
      const userFineGroups = await UserFineGroup.find({
        where: { userId: user.id },
        relations: ['fines'],
      });
      expect(userFineGroups.length).to.equal(1);
      const collection = userFineGroups[0];
      const ids = collection.fines.map((f) => f.id);
      expect(collection.fines.length).to.equal(2);
      expect(ids).to.include(fineHandoutEvent1.fines[0].id);
      expect(ids).to.include(fineHandoutEvent2.fines[0].id);
    });
    it('should create no fines if empty list of userIds is given', async () => {
      const fineHandoutEvent = await DebtorService.handOutFines({ userIds: [] });

      expect(fineHandoutEvent.fines.length).to.equal(0);
      expect(await Fine.count()).to.equal(0);
    });
    it('should not set User.currentFines attribute when user gets 0.00 fine', async () => {
      const user = ctx.users.find((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount() > 0);
      let dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.be.null;

      const fineHandoutEvent = await DebtorService.handOutFines({ userIds: [user.id] });
      expect(fineHandoutEvent.fines.length).to.equal(1);
      const fine = fineHandoutEvent.fines[0];
      expect(fine.user.id).to.equal(user.id);
      expect(fine.amount.amount).to.equal(0);

      dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount())
        .to.be.greaterThanOrEqual(0);
      expect(dbUser.currentFines).to.be.null;
    });
  });
});
