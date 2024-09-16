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

import { expect } from 'chai';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import {
  defaultPagination, maxPagination,
  parseRequestPagination,
  validateRequestPagination,
} from '../../../src/helpers/pagination';

describe('Pagination', (): void => {
  let ctx: {
    req: RequestWithToken,
    paginationDefault: number,
    paginationMax: number,
  };

  beforeEach((): void => {
    const req = {
      token: '',
      query: {
        take: '23',
        skip: '2',
      },
    } as any as RequestWithToken;

    ctx = {
      req,
      paginationDefault: defaultPagination(),
      paginationMax: maxPagination(),
    };
  });

  describe('validateRequestPagination', () => {
    it('should validate correct take and skip', async () => {
      const response = validateRequestPagination(ctx.req);
      expect(response).to.be.true;
    });

    it('should return true when no take is set', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      delete req.query.take;

      const response = validateRequestPagination(req);
      expect(response).to.be.true;
    });

    it('should return true when no skip is set', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      delete req.query.skip;

      const response = validateRequestPagination(req);
      expect(response).to.be.true;
    });

    it('should return true when take is too large', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = (ctx.paginationMax + 1).toString();

      const response = validateRequestPagination(req);
      expect(response).to.be.true;
    });

    it('should return false when take is negative', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = '-1';

      const response = validateRequestPagination(req);
      expect(response).to.be.false;
    });

    it('should return false when skip is negative', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.skip = '-1';

      const response = validateRequestPagination(req);
      expect(response).to.be.false;
    });

    it('should return false when take is a float', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = '12.345';
    });

    it('should return false when skip is a float', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.skip = '12.345';
    });

    it('should return false when both take and skip are strings', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = 'iiieeee';
      req.query.skip = 'aaaaaaa';

      const response = validateRequestPagination(req);
      expect(response).to.be.false;
    });
  });

  describe('parseRequestPagination', () => {
    it('should correctly return take and skip from request', async () => {
      const { take, skip } = parseRequestPagination(ctx.req);
      expect(take).to.equal(parseInt(ctx.req.query.take as string, 10));
      expect(skip).to.equal(parseInt(ctx.req.query.skip as string, 10));
    });

    it('should set default take when no take is set', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      delete req.query.take;

      const { take, skip } = parseRequestPagination(req);
      expect(take).to.equal(ctx.paginationDefault);
      expect(skip).to.equal(parseInt(req.query.skip as string, 10));
    });

    it('should set skip to zero when no skip is set', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      delete req.query.skip;

      const { take, skip } = parseRequestPagination(req);
      expect(take).to.equal(parseInt(req.query.take as string, 10));
      expect(skip).to.equal(0);
    });

    it('should set max take when take is too large', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = (ctx.paginationMax + 1).toString();

      const { take, skip } = parseRequestPagination(req);
      expect(take).to.equal(ctx.paginationMax);
      expect(skip).to.equal(parseInt(req.query.skip as string, 10));
    });

    it('should throw error when take is negative', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = '-1';

      const func = () => parseRequestPagination(req);
      expect(func).to.throw('Invalid pagination parameters');
    });

    it('should throw error when skip is negative', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.skip = '-1';

      const func = () => parseRequestPagination(req);
      expect(func).to.throw('Invalid pagination parameters');
    });

    it('should throw error when both are strings', async () => {
      const req = { ...ctx.req } as any as RequestWithToken;
      req.query.take = 'iiieeee';
      req.query.skip = 'aaaaaaa';

      const func = () => parseRequestPagination(req);
      expect(func).to.throw('Invalid pagination parameters');
    });
  });
});
