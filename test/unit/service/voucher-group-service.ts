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


import { expect } from 'chai';
import Sinon from 'sinon';
import { Connection } from 'typeorm';
import { VoucherGroupParams, VoucherGroupRequest } from '../../../src/controller/request/voucher-group-request';
import VoucherGroupResponse from '../../../src/controller/response/voucher-group-response';
import Database from '../../../src/database/database';
import Transfer from '../../../src/entity/transactions/transfer';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import RoleManager from '../../../src/rbac/role-manager';
import VoucherGroupService from '../../../src/service/voucher-group-service';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';

export function bkgEq(req: VoucherGroupParams, res: VoucherGroupResponse): void {
  // check if non user fields are equal
  expect(res.name).to.equal(req.name);
  expect(res.activeStartDate).to.equal(req.activeStartDate.toISOString());
  expect(res.activeEndDate).to.equal(req.activeEndDate.toISOString());
  expect(res.users).to.be.of.length(req.amount);
  expect(res.balance.amount).to.equal(req.balance.getAmount());
}

export async function seedVoucherGroups(): Promise<{ paramss: VoucherGroupParams[], bkgIds: number[] }> {
  const paramss: VoucherGroupParams[] = [];
  const bkgIds: number[] = [];
  await Promise.all([...Array(5).keys()].map(async (i) => {
    const bkgReq: VoucherGroupRequest = {
      name: `test ${i}`,
      activeStartDate: '2000-01-02T00:00:00Z',
      activeEndDate: '2000-01-03T00:00:00Z',
      balance: {
        amount: 100,
        currency: 'EUR',
        precision: 2,
      },
      amount: 4,
    };
    const params = VoucherGroupService.asVoucherGroupParams(bkgReq);
    const bkgRes = await VoucherGroupService.createVoucherGroup(params);
    // paramss.push(params);
    bkgIds[bkgRes.id - 1] = bkgRes.id;
    paramss[bkgRes.id - 1] = params;
  }));
  return { paramss, bkgIds };
}

describe('VoucherGroupService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    clock: Sinon.SinonFakeTimers
  };

  beforeEach(async () => {
    const clock = Sinon.useFakeTimers({ now: new Date('2000-01-01T00:00:00Z') });
    // initialize test database
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        VoucherGroup: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    // initialize context
    ctx = {
      connection,
      clock,
    };
  });

  // close database connection
  afterEach(async () => {
    await finishTestDB(ctx.connection);
    ctx.clock.restore();
  });

  describe('validate voucher group', () => {
    it('should return true when the voucher is valid', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.true;
    });
    it('should return false when the voucher has an invalid name', async () => {
      const req: VoucherGroupRequest = {
        name: '',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher has an invalid startDate', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: 'aasdfasd',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(params.activeStartDate.valueOf()).to.NaN;
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher has an invalid endDate', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: 'asdafasd',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher endDate is before startDate', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-03T00:00:00Z',
        activeEndDate: '2000-01-01T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher endDate is in the past', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '1999-12-31T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher has an invalid balance', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 0,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
    it('should return false when the voucher has an invalid amount of users', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 0,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      expect(VoucherGroupService.validateVoucherGroup(params)).to.be.false;
    });
  });

  describe('create voucher group', () => {
    it('should create a voucher group with inactive members', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.createVoucherGroup(params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        expect(user.acceptedToS).to.equal(TermsOfServiceStatus.NOT_REQUIRED);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });
    it('should create a voucher group with active members', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '1999-12-31T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.createVoucherGroup(params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(true);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });
  });

  describe('update voucher group', () => {
    let bkgId: number;
    beforeEach(async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.createVoucherGroup(params);
      bkgId = bkgRes.id;
    });

    it('should update an existing voucher groups name', async () => {
      const req: VoucherGroupRequest = {
        name: 'newTest',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups active start date', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-03T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups active end date', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-04T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups passed active start date', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '1999-12-31T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(true);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups increased user amount', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 100,
          currency: 'EUR',
          precision: 2,
        },
        amount: 5,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups increased balance', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 120,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing voucher groups decreased balance', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 80,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(false);
        const transfersPos = await Transfer.find({ where: { toId: user.id } });
        const transfersNeg = await Transfer.find({ where: { fromId: user.id } });
        const balanceAmounts = [
          ...transfersPos.map((transfer) => transfer.amount.getAmount()),
          ...transfersNeg.map((transfer) => -transfer.amount.getAmount()),
        ];
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should return undefined when given an invalid id', async () => {
      const req: VoucherGroupRequest = {
        name: 'test',
        activeStartDate: '2000-01-02T00:00:00Z',
        activeEndDate: '2000-01-03T00:00:00Z',
        balance: {
          amount: 80,
          currency: 'EUR',
          precision: 2,
        },
        amount: 4,
      };
      const params = VoucherGroupService.asVoucherGroupParams(req);
      const bkgRes = await VoucherGroupService.updateVoucherGroup(bkgId + 1, params);
      expect(bkgRes).to.be.undefined;
    });
  });

  describe('get voucher groups', () => {
    let paramss: VoucherGroupParams[];
    let bkgIds: number[];
    beforeEach(async () => {
      const bkgs = await seedVoucherGroups();
      paramss = bkgs.paramss;
      bkgIds = bkgs.bkgIds;
    });

    it('should get an voucher group by id', async () => {
      const bkgRes = (await VoucherGroupService.getVoucherGroups({ bkgId: bkgIds[0] }))
        .records[0];
      bkgEq(paramss[0], bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(paramss[0].balance.getAmount());
      }));
    });

    it('should return undefined when given a wrong id', async () => {
      const bkgRes = (await VoucherGroupService.getVoucherGroups({ bkgId: bkgIds.length + 1 }))
        .records[0];
      expect(bkgRes).to.be.undefined;
    });

    it('should get all voucher groups', async () => {
      const bkgRes = (await VoucherGroupService.getVoucherGroups({})).records;
      await Promise.all(bkgRes.map(async (res, i) => {
        bkgEq(paramss[i], res);
        await Promise.all(res.users.map(async (user) => {
          expect(user.active, 'user inactive').to.equal(false);
          const transfers = await Transfer.find({ where: { toId: user.id } });
          const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
          const balance = balanceAmounts.reduce((a, b) => a + b);
          expect(balance, 'correct transfers').to.equal(paramss[i].balance.getAmount());
        }));
      }));
    });
  });
});

