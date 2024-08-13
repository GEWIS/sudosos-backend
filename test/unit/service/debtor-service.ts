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

import { Connection } from 'typeorm';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import ProductRevision from '../../../src/entity/product/product-revision';
import ContainerRevision from '../../../src/entity/container/container-revision';
import PointOfSaleRevision from '../../../src/entity/point-of-sale/point-of-sale-revision';
import {
  seedContainers,
  seedFines,
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
import UserFineGroup from '../../../src/entity/fine/userFineGroup';
import { calculateBalance, calculateFine } from '../../helpers/balance';
import { FineHandoutEventResponse } from '../../../src/controller/response/debtor-response';
import sinon, { SinonSandbox, SinonSpy } from 'sinon';
import nodemailer, { Transporter } from 'nodemailer';
import Mailer from '../../../src/mailer';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import dinero from 'dinero.js';
import TransferService from '../../../src/service/transfer-service';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';

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
    actor: User,
  };

  let sandbox: SinonSandbox;
  let sendMailFake: SinonSpy;

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

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
    const { fines, fineTransfers, userFineGroups, users: usersWithFines } = await seedFines(users, transactions, transfers, true);

    ctx = {
      connection,
      users: usersWithFines,
      productRevisions,
      containerRevisions,
      pointOfSaleRevisions,
      transactions,
      subTransactions,
      transfers,
      transfersInclFines: transfers.concat(fineTransfers),
      fines,
      userFineGroups,
      actor: usersWithFines[0],
    };

    Mailer.reset();

    sandbox = sinon.createSandbox();
    sendMailFake = sandbox.spy();
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
    sandbox.restore();
  });

  afterEach(() => {
    sendMailFake.resetHistory();
  });

  describe('calculateFinesOnDate', () => {
    it('should return everyone who should get fined', async () => {
      const now = new Date();
      const calculatedFines = await DebtorService.calculateFinesOnDate({
        referenceDates: [now],
      });
      const usersToFine = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines))
        .filter((b) => b.amount.getAmount() <= -500);
      expect(calculatedFines.length).to.equal(usersToFine.length);

      calculatedFines.forEach((f) => {
        const u = usersToFine.find((b) => b.user.id === f.id);
        expect(u).to.not.be.undefined;
        expect(f.fineAmount.amount).to.equal(calculateFine(u.amount.getAmount()));
        expect(f.balances.length).to.equal(1);
        expect(f.balances[0].date).to.equal(now.toISOString());
        expect(f.balances[0].amount.amount).to.equal(u.amount.getAmount());
      });
    });

    it('should only return users from given userTypes', async () => {
      const userTypes = [UserType.LOCAL_USER, UserType.INVOICE];
      const calculatedFines = await DebtorService.calculateFinesOnDate({
        userTypes,
        referenceDates: [new Date()],
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
        expect(f.fineAmount.amount).to.equal(calculateFine(u.amount.getAmount()));
      });
    });

    it('should only return users that have more than 5 euros debt now and on reference date', async () => {
      const referenceDates = [new Date('2021-02-12'), new Date()];
      const calculatedFines = await DebtorService.calculateFinesOnDate({
        referenceDates,
      });
      const usersToFine = ctx.users
        .map((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines, referenceDates[0]))
        .filter((b) => b.amount.getAmount() <= -500)
        .filter((b) => calculateBalance(b.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines, referenceDates[1]).amount.getAmount() <= -500);
      expect(calculatedFines.length).to.equal(usersToFine.length);

      calculatedFines.forEach((f) => {
        const u = usersToFine.find((b) => b.user.id === f.id);
        expect(u).to.not.be.undefined;
        expect(f.fineAmount.amount).to.equal(calculateFine(u.amount.getAmount()));
        expect(f.balances.length).to.equal(referenceDates.length);

        const [firstBalance, ...balances] = f.balances;
        expect(firstBalance.amount.amount).to.equal(u.amount.getAmount());
        expect(firstBalance.date).to.equal(referenceDates[0].toISOString());
        balances.forEach((b, index) => {
          const actualBalance = calculateBalance(u.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines, new Date(b.date));
          expect(b.amount.amount).to.equal(actualBalance.amount.getAmount());
          expect(b.date).to.equal(referenceDates[index + 1].toISOString());
        });

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

      const fines = await DebtorService.calculateFinesOnDate({
        referenceDates: [new Date()],
      });
      const fineForUser = fines.find((f) => f.id === newUser.id);
      expect(fineForUser).to.not.be.undefined;
      expect(fineForUser.fineAmount.amount).to.equal(100);

      await Transfer.remove(transfer);
      await User.remove(newUser);
    });
  });

  describe('sendFineWarnings', () => {
    it('should notify all given users', async () => {
      const users = ctx.users.slice(8);
      const usersWithDebt = users.filter((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines).amount.getAmount() <= -500);
      const userIds = usersWithDebt.map((u) => u.id);

      await DebtorService.sendFineWarnings({ referenceDate: new Date(), userIds });

      expect(sendMailFake.callCount).to.equal(usersWithDebt.length);
    });
    it('should notify all given users based on reference date', async () => {
      const referenceDate = new Date('2021-01-01');
      const users = ctx.users.slice(8);
      const usersWithDebt = users.filter((u) =>
        calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers, referenceDate).amount.getAmount() <= -500
        && calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfers).amount.getAmount() <= -500);
      const userIds = usersWithDebt.map((u) => u.id);
      expect(userIds.length).to.be.at.least(0);

      await DebtorService.sendFineWarnings({ referenceDate, userIds });

      expect(sendMailFake.callCount).to.equal(usersWithDebt.length);
    });
  });

  describe('deleteFine', () => {
    it('should correctly delete a single fine', async () => {
      const userFineGroupIndex = ctx.userFineGroups.findIndex((g) => g.fines.length === 1);
      const userFineGroup = ctx.userFineGroups[userFineGroupIndex];
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

      // Fix state
      ctx.userFineGroups.splice(userFineGroupIndex, 1);
      ctx.fines.filter((f) => f.id !== fine.id);
      ctx.transfers.filter((t) => !t.fine || t.fine.id !== fine.id);
    });
    it('should correctly delete a single fine in a larger fineUserGroup', async () => {
      const userFineGroupIndex = ctx.userFineGroups.findIndex((g) => g.fines.length > 1);
      const userFineGroup = ctx.userFineGroups[userFineGroupIndex];
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

      // Fix state
      ctx.userFineGroups[userFineGroupIndex].fines.splice(0, 1);
      ctx.fines.filter((f) => f.id !== fine.id);
      ctx.transfers.filter((t) => !t.fine || t.fine.id !== fine.id);
    });

    /**
     * Covers the use case explained at https://github.com/GEWIS/sudosos-backend/pull/188
     */
    it('should correctly delete currentFines reference when user tops up after being fined the second time', async () => {
      const userFineGroupIndex = ctx.userFineGroups.findIndex((g) => g.fines.length > 1 && calculateBalance(g.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines).amount.getAmount() < 0);
      const userFineGroup = ctx.userFineGroups[userFineGroupIndex];
      let dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id }, relations: ['fines', 'fines.transfer'] });
      expect(dbUserFineGroup).to.not.be.null;
      expect(dbUserFineGroup.fines.length).to.be.greaterThan(1);
      const fine = dbUserFineGroup.fines[0];
      expect(fine.amount.getAmount()).to.be.greaterThan(0);

      const balance = calculateBalance(userFineGroup.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines);
      expect(balance.amount.getAmount()).to.be.lessThan(0);
      const toTopUp = balance.amount.multiply(-1).subtract(dinero({ amount: 1 }));
      const transfer = await new TransferService().createTransfer({
        amount: {
          amount: toTopUp.getAmount(),
          precision: toTopUp.getPrecision(),
          currency: toTopUp.getCurrency(),
        },
        toId: userFineGroup.userId,
        description: 'Fake top up to barely negative balance',
        fromId: -1,
      });
      ctx.transfers.push(transfer);
      ctx.transfersInclFines.push(transfer);
      const newBalance = calculateBalance(userFineGroup.user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines);
      expect(newBalance.amount.getAmount()).to.equal(-1);

      let dbUser = await User.findOne({ where: { id: userFineGroup.userId }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.not.be.null;
      let dbBalance = await BalanceService.getBalance(userFineGroup.userId);
      expect(dbBalance.amount.amount).to.be.lessThan(0);
      expect(dbBalance.fine).to.not.be.undefined;
      expect(dbBalance.fineSince).to.not.be.undefined;

      expect(await DebtorService.deleteFine(fine.id)).to.not.throw;

      const dbFine = await Fine.findOne({ where: { id: fine.id } });
      expect(dbFine).to.be.null;
      const dbTransfer = await Transfer.findOne({ where: { id: fine.transfer.id } });
      expect(dbTransfer).to.be.null;
      dbUserFineGroup = await UserFineGroup.findOne({ where: { id: userFineGroup.id } });
      expect(dbUserFineGroup).to.be.not.null;
      dbUser = await User.findOne({ where: { id: userFineGroup.userId }, relations: { currentFines: true } });
      expect(dbUser.currentFines).to.be.null;

      dbBalance = await BalanceService.getBalance(userFineGroup.userId);
      expect(dbBalance.amount.amount).to.be.greaterThan(0);
      expect(dbBalance.fine).to.be.null;
      expect(dbBalance.fineSince).to.be.null;

      // Fix state
      ctx.userFineGroups[userFineGroupIndex].fines.splice(0, 1);
      ctx.fines.filter((f) => f.id !== fine.id);
      ctx.transfers.filter((t) => !t.fine || t.fine.id !== fine.id);
    });
    it('should not do anything when fine does not exist', async () => {
      const id = 9999999;
      const fine = await Fine.findOne({ where: { id } });
      expect(fine).to.be.null;
      expect(await DebtorService.deleteFine(id)).to.not.throw;
    });
  });

  describe('waiveFines', () => {
    it('should correctly waive fines', async () => {
      const userFineGroupIndex = ctx.userFineGroups.findIndex((g) => g.fines.length > 1);
      const userFineGroup = ctx.userFineGroups[userFineGroupIndex];
      const dbUserFineGroupOld = await UserFineGroup.findOne({ where: { id: userFineGroup.id }, relations: ['fines', 'waivedTransfer', 'user', 'user.currentFines'] });
      const amount = dbUserFineGroupOld.fines.reduce((sum, f) => sum + f.amount.getAmount(), 0);
      expect(dbUserFineGroupOld.waivedTransfer).to.be.null;
      expect(dbUserFineGroupOld.user.currentFines).to.not.be.null;
      expect(dbUserFineGroupOld.fines.length).to.be.greaterThan(0);

      await DebtorService.waiveFines(userFineGroup.userId);

      const dbUserFineGroupNew = await UserFineGroup.findOne({ where: { id: userFineGroup.id }, relations: ['fines', 'waivedTransfer', 'user', 'user.currentFines'] });
      expect(dbUserFineGroupNew.waivedTransfer).to.not.be.null;
      expect(dbUserFineGroupNew.waivedTransfer.amountInclVat.getAmount()).to.equal(amount);
      expect(dbUserFineGroupNew.user.currentFines).to.be.null;

      // Cleanup
      const transfer = dbUserFineGroupNew.waivedTransfer;
      dbUserFineGroupNew.waivedTransfer = null;
      await dbUserFineGroupNew.save();
      await Transfer.remove(transfer);
    });
    it('should throw error when user does not exist', async () => {
      const id = 999999;
      const user = await User.findOne({ where: { id } });
      expect(user).to.be.null;

      await expect(DebtorService.waiveFines(id)).to.eventually.rejectedWith(`User with ID ${id} does not exist`);
    });
    it('should not do anything when user does not have fines', async () => {
      const user = ctx.users.find((u) => u.currentFines == null);
      expect(user).to.not.be.null;
      const nrTransfers = await Transfer.count();

      await DebtorService.waiveFines(user.id);
      expect(await Transfer.count()).to.equal(nrTransfers);
    });
  });

  async function clearFines() {
    const fines = await Fine.find({ relations: ['transfer'] });
    const fineTransfers = fines.map((f) => f.transfer);

    await Fine.clear();
    await Transfer.remove(fineTransfers);

    // Truncate instead of clear otherwise; mysql fails.
    const queryRunner = ctx.connection.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await queryRunner.query('TRUNCATE TABLE `FineHandoutEvent`');
      await queryRunner.query('TRUNCATE TABLE `UserFineGroup`');
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * This function should be tested last, because it requires an empty Fines
   * table. It therefore destroys the initial state
   */
  describe('handOutFines', async () => {
    before(async () => {
      await clearFines();
      const fineTransfers = (await Transfer.find({ relations: ['fine'] })).filter((t) => t.fine != null);
      expect(fineTransfers.length).to.equal(0);
    });

    afterEach(async () => {
      await clearFines();
    });

    // Delete a fine handout event to clean after each test case
    async function deleteFineHandoutEvent(id: number) {
      const dbFineHandoutEvent = await FineHandoutEvent.findOne({
        where: { id },
        relations: { fines: { userFineGroup: { fines: true } } },
      });
      for (let fine of dbFineHandoutEvent.fines) {
        await Fine.remove(fine);
        if (fine.userFineGroup.fines.length === 1) {
          await UserFineGroup.remove(fine.userFineGroup);
        }
      }
      await FineHandoutEvent.remove(dbFineHandoutEvent);
    }

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
      expect(f.transfer.amountInclVat.getAmount()).to.equal(f.amount.getAmount());
      const balString = '-€' + (b.amount.getAmount() / 100).toFixed(2).substring(1);
      expect(f.transfer.description).to.equal(`Fine for balance of ${balString} on ${date.toLocaleDateString()}.`);
    }

    it('should correctly create fines with reference date', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDates: [referenceDate],
      });
      const fineHandoutEvent = await DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
        referenceDate,
      }, ctx.actor);
      expect(fineHandoutEvent.fines.length).to.equal(usersToFine.length);
      expect(fineHandoutEvent.referenceDate).to.equal(referenceDate.toISOString());
      expect(fineHandoutEvent.createdBy.id).to.equal(ctx.actor.id);

      const fines = await Promise.all(fineHandoutEvent.fines.map((f) => Fine
        .findOne({ where: { id: f.id }, relations: ['transfer', 'transfer.from', 'fineHandoutEvent', 'userFineGroup', 'userFineGroup.user'] })));

      await Promise.all(fines.map(async (f) => {
        const preCalcedFine = usersToFine.find((u) => u.id === f.userFineGroup.userId);
        expect(preCalcedFine).to.not.be.undefined;
        expect(f.amount.getAmount()).to.equal(preCalcedFine.fineAmount.amount);
        expect(new Date(fineHandoutEvent.referenceDate).getTime()).to.equal(referenceDate.getTime());
        await checkFine(f, referenceDate, fineHandoutEvent);
      }));

      await checkCorrectNewBalance(fines);

      // Cleanup
      await deleteFineHandoutEvent(fineHandoutEvent.id);
    });
    it('should correctly put two fines in same userFineGroup', async () => {
      const referenceDate = new Date('2021-01-30');
      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDates: [referenceDate],
      });
      const usersWithoutFines = ctx.users.filter((u) => !ctx.userFineGroups.some((g) => g.userId === u.id));
      const user = usersToFine.find((u) => usersWithoutFines.find((u2) => u2.id === u.id));
      // Sanity checks
      expect(user).to.not.be.undefined;
      let userFineGroups = await UserFineGroup.find({
        where: { userId: user.id },
        relations: ['fines'],
      });
      expect(userFineGroups).to.be.length(0);

      const fineHandoutEvent1 = await DebtorService.handOutFines({
        userIds: [user.id],
        referenceDate,
      }, ctx.actor);
      const fineHandoutEvent2 = await DebtorService.handOutFines({
        userIds: [user.id],
        referenceDate: new Date(),
      }, ctx.actor);

      expect(fineHandoutEvent1.fines.length).to.equal(1);
      expect(fineHandoutEvent2.fines.length).to.equal(1);
      expect(fineHandoutEvent1.fines[0].user.id).to.equal(user.id);
      expect(fineHandoutEvent2.fines[0].user.id).to.equal(user.id);
      expect(fineHandoutEvent1.fines[0].user.id).to.equal(fineHandoutEvent2.fines[0].user.id);
      userFineGroups = await UserFineGroup.find({
        where: { userId: user.id },
        relations: ['fines'],
      });
      expect(userFineGroups.length).to.equal(1);
      const collection = userFineGroups[0];
      const ids = collection.fines.map((f) => f.id);
      expect(collection.fines.length).to.equal(2);
      expect(ids).to.include(fineHandoutEvent1.fines[0].id);
      expect(ids).to.include(fineHandoutEvent2.fines[0].id);

      // Cleanup
      await deleteFineHandoutEvent(fineHandoutEvent1.id);
      await deleteFineHandoutEvent(fineHandoutEvent2.id);
    });
    it('should create no fines if empty list of userIds is given', async function () {
      const fineHandoutEvent = await DebtorService.handOutFines({ userIds: [], referenceDate: new Date() }, ctx.actor);

      expect(fineHandoutEvent.fines.length).to.equal(0);
      expect(await Fine.count()).to.equal(0);

      // Cleanup
      await deleteFineHandoutEvent(fineHandoutEvent.id);
    });
    it('should not set User.currentFines attribute when user gets 0.00 fine', async () => {
      const user = ctx.users.find((u) => calculateBalance(u, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines).amount.getAmount() > 0);
      let dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(dbUser.currentFines).to.be.null;

      const fineHandoutEvent = await DebtorService.handOutFines({ userIds: [user.id], referenceDate: new Date() }, ctx.actor);
      expect(fineHandoutEvent.fines.length).to.equal(1);
      const fine = fineHandoutEvent.fines[0];
      expect(fine.user.id).to.equal(user.id);
      expect(fine.amount.amount).to.equal(0);

      dbUser = await User.findOne({ where: { id: user.id }, relations: ['currentFines'] });
      expect(calculateBalance(user, ctx.transactions, ctx.subTransactions, ctx.transfersInclFines).amount.getAmount())
        .to.be.greaterThanOrEqual(0);
      expect(dbUser.currentFines).to.be.null;

      // Cleanup
      await deleteFineHandoutEvent(fineHandoutEvent.id);
    });
    it('should correctly send email', async () => {
      const user = ctx.users[0];
      expect(user).to.not.be.undefined;

      const fineHandoutEvent = await DebtorService.handOutFines({
        userIds: [user.id],
        referenceDate: new Date(),
      }, ctx.actor);

      expect(sendMailFake).to.be.calledOnce;

      // Cleanup
      await deleteFineHandoutEvent(fineHandoutEvent.id);
    });
  });

  describe('getFineReport', () => {

    before(async () => {
      await clearFines();
    });

    afterEach(async () => {
      await clearFines();
    });

    async function makeFines(): Promise<FineHandoutEventResponse> {
      const referenceDate = new Date('2021-01-30');

      const usersToFine = await DebtorService.calculateFinesOnDate({
        referenceDates: [referenceDate],
      });

      return DebtorService.handOutFines({
        userIds: usersToFine.map((u) => u.id),
        referenceDate,
      }, ctx.actor);
    }

    it('should return correct report', async () => {
      const fineHandoutEvent = await makeFines();
      const date = new Date(fineHandoutEvent.createdAt);
      const report = await DebtorService.getFineReport(date, date);

      expect(report.fromDate.toISOString()).to.equal(date.toISOString());
      expect(report.toDate.toISOString()).to.equal(date.toISOString());
      expect(report.count).to.equal(fineHandoutEvent.fines.length);

      const handedOut = fineHandoutEvent.fines.reduce((sum, u) => sum + u.amount.amount, 0);
      expect(report.handedOut.getAmount()).to.equal(handedOut);
      expect(report.waivedAmount.getAmount()).to.equal(0);
    });

    it( 'should return error if transfer has fine and waivedFine', async () => {
      const fineHandoutEvent = await makeFines();
      await DebtorService.waiveFines(fineHandoutEvent.fines[0].user.id);

      const transfer = await Transfer.findOne({ where: { waivedFines: { userId: fineHandoutEvent.fines[0].user.id } }, relations: ['fine', 'waivedFines'] });
      transfer.fine = await Fine.create({
        userFineGroup: await UserFineGroup.findOne({ where: { userId: fineHandoutEvent.fines[0].user.id } }),
        fineHandoutEvent: await FineHandoutEvent.findOne({ where: { id: fineHandoutEvent.id } }),
        amount: dinero({ amount: 100 }),
        transfer: transfer,
      }).save();
      await transfer.save();
      const date = new Date(fineHandoutEvent.createdAt);
      const tillDate = new Date();
      // Expect to error
      await expect(DebtorService.getFineReport(date, tillDate)).to.eventually.rejectedWith('Transfer has both fine and waived fine');
    });

    it('should deal with waived fines', async () => {
      const fineHandoutEvent = await makeFines();
      const date = new Date(fineHandoutEvent.createdAt);
      const tillDate = new Date();

      await DebtorService.waiveFines(fineHandoutEvent.fines[0].user.id);
      const report = await DebtorService.getFineReport(date, tillDate);

      expect(report.fromDate.toISOString()).to.equal(date.toISOString());
      expect(report.toDate.toISOString()).to.equal(tillDate.toISOString());
      expect(report.count).to.equal(fineHandoutEvent.fines.length);
      expect(report.waivedCount).to.equal(1);

      const handedOut = fineHandoutEvent.fines.reduce((sum, u) => sum + u.amount.amount, 0);
      expect(report.handedOut.getAmount()).to.equal(handedOut);
      expect(report.waivedAmount.getAmount()).to.equal(fineHandoutEvent.fines[0].amount.amount);
    });

  });

});
