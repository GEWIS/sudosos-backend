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

import express, { Application } from 'express';
import { expect } from 'chai';
import { createQueryBuilder } from 'typeorm';
import { RequestWithToken } from '../../../src/middleware/token-middleware';
import { addPaginationForFindOptions, addPaginationToQueryBuilder } from '../../../src/helpers/pagination';

describe('Pagination', (): void => {
  let ctx: {
    app: Application,
    req: RequestWithToken,
  };

  beforeEach((): void => {
    const app = express();
    const req = {
      token: '',
      query: {
        take: 23,
        skip: 2,
      },
    } as any as RequestWithToken;

    ctx = {
      app,
      req,
    };
  });

  describe('Pagination FindOptions', () => {
    it('should apply environment pagination', () => {
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(23);
      expect(options.skip).to.equal(2);
    });

    it('should apply default pagination from environment variables', () => {
      ctx.req.query = {};
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(parseInt(process.env.PAGINATION_DEFAULT, 10));
      expect(options.skip).to.equal(0);
    });

    it('should apply default pagination if query is invalid', () => {
      ctx.req.query.take = 'StringsAreNotIntegers';
      ctx.req.query.skip = 'StringsAreNotIntegers';
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(parseInt(process.env.PAGINATION_DEFAULT, 10));
      expect(options.skip).to.equal(0);
    });

    it('should apply default pagination from coded value', () => {
      ctx.req.query = {};
      const defaultPagination = process.env.PAGINATION_DEFAULT;
      process.env.PAGINATION_DEFAULT = null;
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(25);
      expect(options.skip).to.equal(0);

      process.env.PAGINATION_DEFAULT = defaultPagination;
    });

    it('should use maximum pagination', () => {
      ctx.req.query.take = process.env.PAGINATION_MAX + 100;
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(parseInt(process.env.PAGINATION_MAX, 10));
      expect(options.skip).to.equal(2);
    });

    it('should use maximum pagination with hardcoded max', () => {
      ctx.req.query.take = 10000;
      const maxPagination = process.env.PAGINATION_MAX;
      process.env.PAGINATION_MAX = null;
      const options = addPaginationForFindOptions(ctx.req);

      expect(options.take).to.equal(500);
      expect(options.skip).to.equal(2);

      process.env.PAGINATION_MAX = maxPagination;
    });
  });

  describe('Pagination QueryBuilder', () => {
    it('should apply environment pagination', () => {
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(23);
      expect(query.expressionMap.offset).to.equal(2);
    });

    it('should apply default pagination from environment variables', () => {
      ctx.req.query = {};
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(parseInt(process.env.PAGINATION_DEFAULT, 10));
      expect(query.expressionMap.offset).to.equal(0);
    });

    it('should apply default pagination if query is invalid', () => {
      ctx.req.query.take = 'StringsAreNotIntegers';
      ctx.req.query.skip = 'StringsAreNotIntegers';
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(parseInt(process.env.PAGINATION_DEFAULT, 10));
      expect(query.expressionMap.offset).to.equal(0);
    });

    it('should apply default pagination from coded value', () => {
      ctx.req.query = {};
      const defaultPagination = process.env.PAGINATION_DEFAULT;
      process.env.PAGINATION_DEFAULT = null;
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(25);
      expect(query.expressionMap.offset).to.equal(0);

      process.env.PAGINATION_DEFAULT = defaultPagination;
    });

    it('should use maximum pagination', () => {
      ctx.req.query.take = process.env.PAGINATION_MAX + 100;
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(parseInt(process.env.PAGINATION_MAX, 10));
      expect(query.expressionMap.offset).to.equal(2);
    });

    it('should use maximum pagination with hardcoded max', () => {
      ctx.req.query.take = 10000;
      const maxPagination = process.env.PAGINATION_MAX;
      process.env.PAGINATION_MAX = null;
      const query = addPaginationToQueryBuilder(ctx.req, createQueryBuilder());

      expect(query.expressionMap.limit).to.equal(500);
      expect(query.expressionMap.offset).to.equal(2);

      process.env.PAGINATION_MAX = maxPagination;
    });
  });
});
