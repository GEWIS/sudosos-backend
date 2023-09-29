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

import { expect } from 'chai';
import Sinon from 'sinon';
import { Connection } from 'typeorm';
import { BorrelkaartGroupParams, BorrelkaartGroupRequest } from '../../../src/controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../../../src/controller/response/borrelkaart-group-response';
import Database from '../../../src/database/database';
import Transfer from '../../../src/entity/transactions/transfer';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import RoleManager from '../../../src/rbac/role-manager';
import BorrelkaartGroupService from '../../../src/service/borrelkaart-group-service';

export function bkgEq(req: BorrelkaartGroupParams, res: BorrelkaartGroupResponse): void {
  // check if non user fields are equal
  expect(res.name).to.equal(req.name);
  expect(res.activeStartDate).to.equal(req.activeStartDate.toISOString());
  expect(res.activeEndDate).to.equal(req.activeEndDate.toISOString());
  expect(res.users).to.be.of.length(req.amount);
  expect(res.balance.amount).to.equal(req.balance.getAmount());
}

export async function seedBorrelkaartGroups(): Promise<{ paramss: BorrelkaartGroupParams[], bkgIds: number[] }> {
  const paramss: BorrelkaartGroupParams[] = [];
  const bkgIds: number[] = [];
  await Promise.all([...Array(5).keys()].map(async (i) => {
    const bkgReq: BorrelkaartGroupRequest = {
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
    const params = BorrelkaartGroupService.asBorrelkaartGroupParams(bkgReq);
    const bkgRes = await BorrelkaartGroupService.createBorrelkaartGroup(params);
    // paramss.push(params);
    bkgIds[bkgRes.id - 1] = bkgRes.id;
    paramss[bkgRes.id - 1] = params;
  }));
  return { paramss, bkgIds };
}

describe('BorrelkaartGroupService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    clock: Sinon.SinonFakeTimers
  };

  // initialize context
  beforeEach(async () => {
    const clock = Sinon.useFakeTimers({ now: new Date('2000-01-01T00:00:00Z') });
    // initialize test database
    const connection = await Database.initialize();

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        BorrelkaartGroup: {
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
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
    ctx.clock.restore();
  });

  describe('validate borrelkaart group', () => {
    it('should return true when the borrelkaart is valid', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.true;
    });
    it('should return false when the borrelkaart has an invalid name', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart has an invalid startDate', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(params.activeStartDate.valueOf()).to.NaN;
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart has an invalid endDate', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart endDate is before startDate', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart endDate is in the past', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart has an invalid balance', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
    it('should return false when the borrelkaart has an invalid amount of users', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      expect(BorrelkaartGroupService.validateBorrelkaartGroup(params)).to.be.false;
    });
  });

  describe('create borrelkaart group', () => {
    it('should create a borrelkaart group with inactive members', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.createBorrelkaartGroup(params);
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
    it('should create a borrelkaart group with active members', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.createBorrelkaartGroup(params);
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

  describe('update borrelkaart group', () => {
    let bkgId: number;
    beforeEach(async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.createBorrelkaartGroup(params);
      bkgId = bkgRes.id;
    });

    it('should update an existing borrelkaart groups name', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups active start date', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups active end date', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user inactive').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups passed active start date', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(true);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups increased user amount', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups increased balance', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
      bkgEq(params, bkgRes);
      await Promise.all(bkgRes.users.map(async (user) => {
        expect(user.active, 'user active').to.equal(false);
        const transfers = await Transfer.find({ where: { toId: user.id } });
        const balanceAmounts = transfers.map((transfer) => transfer.amount.getAmount());
        const balance = balanceAmounts.reduce((a, b) => a + b);
        expect(balance, 'correct transfers').to.equal(params.balance.getAmount());
      }));
    });

    it('should update an existing borrelkaart groups decreased balance', async () => {
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId, params);
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
      const req: BorrelkaartGroupRequest = {
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
      const params = BorrelkaartGroupService.asBorrelkaartGroupParams(req);
      const bkgRes = await BorrelkaartGroupService.updateBorrelkaartGroup(bkgId + 1, params);
      expect(bkgRes).to.be.undefined;
    });
  });

  describe('get borrelkaart groups', () => {
    let paramss: BorrelkaartGroupParams[];
    let bkgIds: number[];
    beforeEach(async () => {
      const bkgs = await seedBorrelkaartGroups();
      paramss = bkgs.paramss;
      bkgIds = bkgs.bkgIds;
    });

    it('should get an borrelkaart group by id', async () => {
      const bkgRes = (await BorrelkaartGroupService.getBorrelkaartGroups({ bkgId: bkgIds[0] }))
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
      const bkgRes = (await BorrelkaartGroupService.getBorrelkaartGroups({ bkgId: bkgIds.length + 1 }))
        .records[0];
      expect(bkgRes).to.be.undefined;
    });

    it('should get all borrelkaart groups', async () => {
      const bkgRes = (await BorrelkaartGroupService.getBorrelkaartGroups({})).records;
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

