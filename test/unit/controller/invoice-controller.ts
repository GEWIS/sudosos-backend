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
import { Connection, In, Not } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import InvoiceController from '../../../src/controller/invoice-controller';
import Database from '../../../src/database/database';
import {
  seedContainers,
  seedInvoices,
  seedPointsOfSale,
  seedProductCategories,
  seedProducts,
  seedTransactions, seedUsers,
  seedVatGroups,
} from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { BaseInvoiceResponse, InvoiceResponse } from '../../../src/controller/response/invoice-response';
import Invoice from '../../../src/entity/invoices/invoice';
import {
  CreateInvoiceParams,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
} from '../../../src/controller/request/invoice-request';
import Transaction from '../../../src/entity/transactions/transaction';
import {
  INVALID_DATE,
  INVALID_TRANSACTION_OWNER,
  INVALID_USER_ID,
  SAME_INVOICE_STATE,
  SUBTRANSACTION_ALREADY_INVOICED,
  ZERO_LENGTH_STRING,
} from '../../../src/controller/request/validators/validation-errors';
import InvoiceEntryRequest from '../../../src/controller/request/invoice-entry-request';
import { inUserContext, INVOICE_USER, UserFactory } from '../../helpers/user-factory';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { createTransactionRequest, requestToTransaction } from '../service/invoice-service';
import BalanceService from '../../../src/service/balance-service';
import { InvoiceState } from '../../../src/entity/invoices/invoice-status';
import InvoiceService from '../../../src/service/invoice-service';
import InvoiceUser from '../../../src/entity/user/invoice-user';
import { UpdateInvoiceUserRequest } from '../../../src/controller/request/user-request';
import InvoicePdf from '../../../src/entity/file/invoice-pdf';
import InvoicePdfService from '../../../src/service/invoice-pdf-service';
import sinon from 'sinon';

describe('InvoiceController', async () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: InvoiceController,
    adminUser: User,
    localUser: User,
    adminToken: string,
    invoiceToken: string,
    validInvoiceRequest: CreateInvoiceRequest,
    token: string,
    invoiceUser: User,
  };

  before(async () => {
    const connection = await Database.initialize();

    await seedUsers();

    // create dummy users
    const adminUser = {
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    const localUser = {
      firstName: 'User',
      type: UserType.MEMBER,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    let invoiceUser = {
      firstName: 'User',
      type: UserType.INVOICE,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);
    await User.save(invoiceUser);

    const categories = await seedProductCategories();
    const vatGroups = await seedVatGroups();
    const { productRevisions } = await seedProducts([adminUser, localUser], categories, vatGroups);
    const { containerRevisions } = await seedContainers([adminUser, localUser], productRevisions);
    const { pointOfSaleRevisions } = await seedPointsOfSale(
      [adminUser, localUser], containerRevisions,
    );
    const { transactions } = await seedTransactions([adminUser, localUser, invoiceUser], pointOfSaleRevisions);
    await seedInvoices([invoiceUser], transactions);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'], lesser: false }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'], lesser: false }, 'nonce');
    const invoiceToken = await tokenHandler.signToken({ user: invoiceUser, roles: ['User'], lesser: false }, 'nonce');

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Invoice: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    roleManager.registerRole({
      name: 'User',
      permissions: {
        Invoice: {
          get: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER
          || user.type === UserType.INVOICE,
    });

    const controller = new InvoiceController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/invoices', controller.getRouter());

    const validInvoiceRequest: CreateInvoiceRequest = {
      addressee: 'InvoiceRequest',
      byId: adminUser.id,
      description: 'InvoiceRequest test',
      forId: localUser.type,
      isCreditInvoice: false,
      reference: 'BAC-41',
      city: 'city',
      country: 'country',
      postalCode: 'postalCode',
      street: 'street',
    };

    ctx = {
      connection,
      app,
      validInvoiceRequest,
      specification,
      controller,
      adminUser,
      localUser,
      invoiceToken,
      adminToken,
      token,
      invoiceUser,
    };
  });

  after(async () => {
    await ctx.connection.dropDatabase();
    await ctx.connection.close();
  });

  describe('GET /invoices', () => {
    it('should return correct model', async () => {
      const res = await request(ctx.app)
        .get('/invoices')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
      expect(ctx.specification.validateModel(
        'PaginatedInvoiceResponse',
        res.body,
        false,
        true,
      ).valid).to.be.true;
    });
    it('should return an HTTP 200 and all existing invoices if admin', async () => {
      const res = await request(ctx.app)
        .get('/invoices')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const invoices = res.body.records as BaseInvoiceResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const invoiceCount = await Invoice.count();
      expect(invoices.length).to.equal(Math.min(invoiceCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(invoiceCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/invoices')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/invoices')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const invoices = res.body.records as BaseInvoiceResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const invoiceCount = await Invoice.count();
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(invoiceCount);
      expect(invoices.length).to.be.at.most(take);
    });
  });
  async function testValidationOnRoute(type:any, route: string) {
    async function expectError(req: CreateInvoiceRequest, error: string) {
      // @ts-ignore
      const res = await ((request(ctx.app)[type])(route)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req));
      expect(res.status).to.eq(400);
      expect(res.body).to.eq(error);
    }

    it('should verify that all transactions are owned by the debtor', async () => {
      const transactionIDs = (await Transaction.find({ relations: ['from'] })).filter((i) => i.from.id !== ctx.adminUser.id).map((t) => t.id);
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, transactionIDs };
      await expectError(req, INVALID_TRANSACTION_OWNER().value);
    });
    it('should verify that all transactions are owned by creditor if credit Invoice', async () => {
      const transactionIDs = (await Transaction.find({ relations: ['from'] })).filter((i) => i.from.id === ctx.adminUser.id).map((t) => t.id);
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, forId: ctx.localUser.id, isCreditInvoice: true, transactionIDs };
      await expectError(req, INVALID_TRANSACTION_OWNER().value);
    });
    it('should verity that forId is a valid user', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, forId: -1 };
      await expectError(req, `forId: ${INVALID_USER_ID().value}`);
    });
    it('should verity that fromDate is a valid date', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, fromDate: 'invalid' };
      await expectError(req, `fromDate: ${INVALID_DATE().value}`);
    });
    it('should verity that description is a valid string', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, description: '' };
      await expectError(req, `description: ${ZERO_LENGTH_STRING().value}`);
    });
    it('should verity that the custom invoice entries have valid amounts', async () => {
      const customEntries: InvoiceEntryRequest[] = [
        {
          description: 'invalid',
          amount: -2,
          priceInclVat: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
          vatPercentage: 39,
        },
      ];
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, customEntries };
      await expectError(req, 'Custom entries: amount: Number must be positive');
    });
    it('should verity that the custom invoice entries have valid descriptions', async () => {
      const customEntries: InvoiceEntryRequest[] = [
        {
          description: 'valid',
          amount: 1,
          priceInclVat: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
          vatPercentage: 39,
        },
        {
          description: '',
          amount: 2,
          priceInclVat: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
          vatPercentage: 39,
        },
      ];
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, customEntries };
      await expectError(req, 'Custom entries: description: must be a non-zero length string.');
    });
    it('should disallow double invoicing of a transaction', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const transactionRequests: TransactionRequest[] = await createTransactionRequest(
            debtor.id, creditor.id, 2,
          );
          const { transactions } = await requestToTransaction(transactionRequests);
          const tIds = transactions.map((transaction) => transaction.tId);

          const createInvoiceRequest: CreateInvoiceParams = {
            city: 'city',
            country: 'country',
            postalCode: 'postalCode',
            street: 'street',
            byId: creditor.id,
            addressee: 'Addressee',
            description: 'Description',
            forId: debtor.id,
            transactionIDs: tIds,
            isCreditInvoice: false,
            reference: 'BAC-41',
          };

          const invoiceTransactions = await Transaction.find({ where: { id: In(tIds) }, relations: ['subTransactions', 'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.invoice'] });
          const subIDs: number[] = [];
          invoiceTransactions.forEach((t) => {
            t.subTransactions.forEach((tSub) => {
              tSub.subTransactionRows.forEach((tSubRow) => {
                if (tSubRow.invoice !== undefined) subIDs.push(tSubRow.id);
              });
            });
          });

          await InvoiceService.createInvoice(createInvoiceRequest);
          await expectError(createInvoiceRequest, (SUBTRANSACTION_ALREADY_INVOICED(subIDs)).value);
        });
    });
  }
  describe('POST /invoices', () => {
    describe('verifyInvoiceRequest Specification', async () => {
      await testValidationOnRoute('post', '/invoices');
    });
    it('should create an Invoice with only custom entries and return an HTTP 200 if admin', async () => {
      await inUserContext(await (await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const count = await Invoice.count();
        const newRequest: CreateInvoiceRequest = {
          ...ctx.validInvoiceRequest,
          forId: debtor.id,
          byId: creditor.id,
          customEntries: [
            {
              description: 'Tappers vergoeding',
              amount: 1,
              priceInclVat: {
                amount: 2000,
                currency: 'EUR',
                precision: 2,
              },
              vatPercentage: 39,
            },
          ],
        };
        const res = await request(ctx.app)
          .post('/invoices')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(newRequest);

        expect(res.status).to.equal(200);
        expect(await Invoice.count()).to.equal(count + 1);
        const validation = ctx.specification.validateModel(
          'InvoiceResponse',
          res.body,
          false,
          true,
        );
        expect(validation.valid).to.be.true;
      });
    });
    it('should return an HTTP 403 if not admin', async () => {
      await inUserContext(await (await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
        const newRequest = {
          ...ctx.validInvoiceRequest,
          forId: debtor.id,
          byId: creditor.id,
        };
        const res = await request(ctx.app)
          .post('/invoices')
          .set('Authorization', `Bearer ${ctx.token}`)
          .send(newRequest);
        expect(res.status).to.equal(403);
      });
    });
    it('should create an Invoice and return an HTTP 200 if admin', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
        // Spent money.
          const transactionRequests: TransactionRequest[] = await createTransactionRequest(
            debtor.id, creditor.id, 2,
          );

          const { transactions, total } = await requestToTransaction(transactionRequests);
          const tIds = transactions.map((transaction) => transaction.tId);
          const newRequest: CreateInvoiceRequest = {
            ...ctx.validInvoiceRequest,
            transactionIDs: tIds,
            forId: debtor.id,
            byId: creditor.id,
          };

          await new Promise((f) => setTimeout(f, 500));
          expect((await BalanceService.getBalance(debtor.id)).amount.amount).is.equal(-1 * total);

          const count = await Invoice.count();
          const res = await request(ctx.app)
            .post('/invoices')
            .set('Authorization', `Bearer ${ctx.adminToken}`)
            .send(newRequest);

          expect((await BalanceService.getBalance(debtor.id)).amount.amount).is.equal(0);
          expect(await Invoice.count()).to.equal(count + 1);

          expect(res.status).to.equal(200);
        });
    });
    it('should create an Invoice with custom entries and return an HTTP 200 if admin', async () => {
      await inUserContext(await (await UserFactory()).clone(2),
        async (debtor: User, creditor: User) => {
          const count = await Invoice.count();
          const newRequest: CreateInvoiceRequest = {
            ...ctx.validInvoiceRequest,
            forId: debtor.id,
            byId: creditor.id,
            customEntries: [
              {
                description: 'Tappers vergoeding',
                amount: 1,
                priceInclVat: {
                  amount: 2000,
                  currency: 'EUR',
                  precision: 2,
                },
                vatPercentage: 39,
              },
            ],
          };
          const res = await request(ctx.app)
            .post('/invoices')
            .set('Authorization', `Bearer ${ctx.adminToken}`)
            .send(newRequest);

          expect(await Invoice.count()).to.equal(count + 1);
          expect(((res.body) as InvoiceResponse).invoiceEntries[0].description)
            .to.equal(newRequest.customEntries[0].description);
          expect(((res.body) as InvoiceResponse).invoiceEntries[0].amount)
            .to.equal(newRequest.customEntries[0].amount);
          expect(((res.body) as InvoiceResponse).invoiceEntries[0].priceInclVat.amount)
            .to.equal(newRequest.customEntries[0].priceInclVat.amount);

          expect(res.status).to.equal(200);
        });
    });
  });
  describe('GET /invoices/{id}', () => {
    it('should return correct model', async () => {
      const invoice = (await Invoice.find())[0];
      const res = await request(ctx.app)
        .get(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'InvoiceResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 200 and the requested invoice if exists and admin', async () => {
      const invoice = (await Invoice.find())[0];
      const res = await request(ctx.app)
        .get(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as InvoiceResponse).id).to.be.equal(invoice.id);
    });
    it('should return an HTTP 200 and the requested invoice if exists and user owns Invoice', async () => {
      const invoice = (await Invoice.find())[0];
      const res = await request(ctx.app)
        .get(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.invoiceToken}`);

      expect(res.status).to.equal(200);
      expect((res.body as InvoiceResponse).id).to.be.equal(invoice.id);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const invoice = (await Invoice.find())[0];
      const res = await request(ctx.app)
        .get(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.localUser}`);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if invoice does not exist', async () => {
      const count = await Invoice.count();
      const invoice = await Invoice.findOne({ where: { id: count + 1 } });
      expect(invoice).to.be.null;

      const res = await request(ctx.app)
        .get(`/invoices/${count + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
    });
  });
  describe('PATCH /invoices/{id}', () => {
    it('should return an HTTP 200 and update an invoice if admin', async () => {
      const invoice = (await Invoice.find())[0];
      const updateRequest: UpdateInvoiceRequest = {
        addressee: 'Updated-addressee',
        description: 'Updated-description',
        state: 'SENT',
      };

      const res = await request(ctx.app)
        .patch(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(updateRequest);

      expect(res.status).to.equal(200);
      const validation = ctx.specification.validateModel(
        'BaseInvoiceResponse',
        res.body,
        false,
        true,
      );
      expect(validation.valid).to.be.true;

      expect(res.status).to.equal(200);
      const body = res.body as InvoiceResponse;
      expect(body.description).to.equal(updateRequest.description);
      expect(body.addressee).to.equal(updateRequest.addressee);
      expect(body.currentState.state).to.equal(updateRequest.state);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const invoice = (await Invoice.find())[0];
      const updateRequest: UpdateInvoiceRequest = {
        addressee: 'Updated-addressee',
        description: 'Updated-description',
        state: 'PAID',
      };

      const res = await request(ctx.app)
        .patch(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(updateRequest);

      expect(res.status).to.equal(403);
    });
    it('should verify that new invoice state is not the same as current', async () => {
      const invoice = (await Invoice.find({ relations: ['invoiceStatus'] }))[0];
      const currentState = invoice.invoiceStatus[invoice.invoiceStatus.length - 1].state;
      const req: UpdateInvoiceRequest = {
        addressee: 'Updated-addressee',
        description: 'Updated-description',
        state: InvoiceState[currentState] as 'SENT' | 'CREATED' | 'PAID' | 'DELETED',
      };
      const res = await request(ctx.app)
        .patch(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req);

      expect(res.status).to.eq(400);
      expect(res.body).to.eq(SAME_INVOICE_STATE().value);
    });
  });
  describe('DELETE /invoices/{id}', () => {
    it('should return an HTTP 200 and delete the requested invoice if exists and admin', async () => {
      const invoice = (await Invoice.find())[0];

      const res = await request(ctx.app)
        .delete(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(204);
      expect(res.body).to.be.empty;
    });
    it('should return an HTTP 403 if not admin', async () => {
      const invoice = (await Invoice.find())[0];

      const res = await request(ctx.app)
        .delete(`/invoices/${invoice.id}`)
        .set('Authorization', `Bearer ${ctx.localUser}`);

      expect(res.status).to.equal(403);
    });
    it('should return an HTTP 404 if invoice does not exist', async () => {
      const count = await Invoice.count();
      const invoice = await Invoice.findOne({ where: { id: count + 1 } });
      expect(invoice).to.be.null;

      const res = await request(ctx.app)
        .delete(`/invoices/${count + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(404);
    });
  });
  describe('GET /invoices/{id}/pdf', () => {
    it('should return the file name of the pdf', async () => {
      let invoice = (await Invoice.find())[0];

      const hash = require('../../../src/helpers/hash');
      const stub = sinon.stub(hash, 'hashJSON').returns('fake_hash');

      const pdf = Object.assign(new InvoicePdf(), {
        downloadName: 'test-file.pdf',
        createdBy: ctx.adminUser,
        location: '/etc/test-file.pdf',
        hash: 'fake_hash',
      });

      await InvoicePdf.save(pdf);
      invoice.pdf = pdf;
      await Invoice.save(invoice);

      const res = await request(ctx.app)
        .get(`/invoices/${invoice.id}/pdf`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.pdf).to.equal('test-file.pdf');
      stub.restore();
    });
  });

  describe('/invoices/users/{id}', () => {
    describe('GET /invoices/users/{id}', () => {
      it('should return an HTTP 403 if not admin', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { user: { deleted: false, type: UserType.INVOICE } }, relations: ['user'] });
        expect(invoiceUser).to.not.be.null;

        const res = await request(ctx.app)
          .get(`/invoices/users/${invoiceUser.userId}`)
          .set('Authorization', `Bearer ${ctx.token}`);

        expect(res.status).to.equal(403);
        expect(res.body).to.be.empty;
      });
      it('should return an HTTP 200 and the InvoiceUser if admin', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { user: { deleted: false, type: UserType.INVOICE } }, relations: ['user'] });
        expect(invoiceUser).to.not.be.null;

        const res = await request(ctx.app)
          .get(`/invoices/users/${invoiceUser.userId}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);

        expect(res.status).to.equal(200);
        const validation = ctx.specification.validateModel(
          'InvoiceUserResponse',
          res.body,
          false,
          true,
        );
        expect(validation.valid).to.be.true;
      });
      it('should return an HTTP 404 if user is not found', async () => {
        const count = await User.count();
        const user = await User.findOne({ where: { id: count + 1 } });
        expect(user).to.be.null;

        const res = await request(ctx.app)
          .get(`/invoices/users/${count + 1}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);

        expect(res.status).to.equal(404);
        expect(res.body).to.equal('User not found.');
      });
      it('should return an HTTP 404 if user has no matched InvoiceUser', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { userId: ctx.invoiceUser.id } });
        expect(invoiceUser).to.be.null;

        const res = await request(ctx.app)
          .get(`/invoices/users/${ctx.invoiceUser.id}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);

        expect(res.status).to.equal(404);
        expect(res.body).to.equal('Invoice User not found.');
      });
      it('should return an HTTP 400 if user is not of type INVOICE', async () => {
        const user = await User.findOne({ where: { type: Not(UserType.INVOICE) } });
        expect(user).to.not.be.null;

        const res = await request(ctx.app)
          .get(`/invoices/users/${user.id}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);

        expect(res.status).to.equal(400);
        expect(res.body).to.equal(`User is of type ${UserType[user.type]} and not of type INVOICE.`);
      });
    });
    describe('DELETE /invoices/users/{id}', () => {
      it('should return an HTTP 403 if not admin', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { user: { deleted: false, type: UserType.INVOICE } }, relations: ['user'] });
        expect(invoiceUser).to.not.be.null;

        const res = await request(ctx.app)
          .delete(`/invoices/users/${invoiceUser.userId}`)
          .set('Authorization', `Bearer ${ctx.token}`);

        expect(res.status).to.equal(403);
        expect(res.body).to.be.empty;
      });
      it('should return an HTTP 204 and delete the InvoiceUser', async () => {
        await inUserContext(await (await UserFactory(await INVOICE_USER())).clone(1),
          async (user: User) => {
            // Create invoice User
            const invoiceUser = Object.assign(new InvoiceUser(), {
              automatic: false,
              city: 'city',
              country: 'country',
              postalCode: 'postalCode',
              street: 'street',
              userId: user.id,
            });
            await InvoiceUser.save(invoiceUser);

            const res = await request(ctx.app)
              .delete(`/invoices/users/${user.id}`)
              .set('Authorization', `Bearer ${ctx.adminToken}`);

            expect(res.status).to.equal(204);
            expect(res.body).to.be.empty;

            const deleted = await InvoiceUser.findOne({ where: { userId: user.id }, relations: ['user'] });
            expect(deleted).to.be.null;
          });
      });
      it('should return an HTTP 404 if user is not found', async () => {
        const count = await User.count();
        const user = await User.findOne({ where: { id: count + 1 } });
        expect(user).to.be.null;

        const res = await request(ctx.app)
          .delete(`/invoices/users/${count + 1}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`);

        expect(res.status).to.equal(404);
        expect(res.body).to.equal('Invoice User not found.');
      });
    });
    describe('PUT /invoices/users/{id}', () => {
      it('should return an HTTP 200 and the updated InvoiceUser if admin', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { user: { deleted: false, type: UserType.INVOICE } }, relations: ['user'] });
        expect(invoiceUser).to.not.be.null;

        const update: UpdateInvoiceUserRequest = {
          automatic: false,
          city: 'Eindhoven',
          country: 'Nederland',
          postalCode: '5612 AE',
          street: 'Groene Loper 5 ',
        };

        const res = await request(ctx.app)
          .put(`/invoices/users/${invoiceUser.userId}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(update);

        expect(res.status).to.equal(200);
        const validation = ctx.specification.validateModel(
          'InvoiceUserResponse',
          res.body,
          false,
          true,
        );
        expect(validation.valid).to.be.true;

        for (let updateKey in update) {
          // @ts-ignore
          expect(update[updateKey]).to.equal(res.body[updateKey]);
        }
      });
      it('should create an InvoiceUser if admin and if it does not exist', async () => {
        await inUserContext(await (await UserFactory(await INVOICE_USER())).clone(1),
          async (user: User) => {

            let invoiceUser = await InvoiceUser.findOne({ where: { userId: user.id } });
            expect(invoiceUser).to.be.null;

            const update: UpdateInvoiceUserRequest = {
              automatic: false,
              city: 'Eindhoven',
              country: 'Nederland',
              postalCode: '5612 AE',
              street: 'Groene Loper 5 ',
            };

            const res = await request(ctx.app)
              .put(`/invoices/users/${user.id}`)
              .set('Authorization', `Bearer ${ctx.adminToken}`)
              .send(update);

            expect(res.status).to.equal(200);
            const validation = ctx.specification.validateModel(
              'InvoiceUserResponse',
              res.body,
              false,
              true,
            );
            expect(validation.valid).to.be.true;

            invoiceUser = await InvoiceUser.findOne({ where: { userId: user.id } });
            expect(invoiceUser).to.not.be.null;

            for (let updateKey in update) {
              // @ts-ignore
              expect(update[updateKey]).to.equal(res.body[updateKey]);
            }
          });
      });
      it('should return an HTTP 403 if not admin', async () => {
        const invoiceUser = await InvoiceUser.findOne({ where: { user: { deleted: false, type: UserType.INVOICE } }, relations: ['user'] });
        expect(invoiceUser).to.not.be.null;

        const update: UpdateInvoiceUserRequest = {
          automatic: false,
          city: 'Eindhoven',
          country: 'Nederland',
          postalCode: '5612 AE',
          street: 'Groene Loper 5 ',
        };

        const res = await request(ctx.app)
          .put(`/invoices/users/${invoiceUser.userId}`)
          .set('Authorization', `Bearer ${ctx.token}`)
          .send(update);

        expect(res.status).to.equal(403);
      });
      it('should return an HTTP 404 if user is not  found', async () => {
        const count = await User.count();
        const user = await User.findOne({ where: { id: count + 1 } });
        expect(user).to.be.null;

        const update: UpdateInvoiceUserRequest = {
          automatic: false,
          city: 'Eindhoven',
          country: 'Nederland',
          postalCode: '5612 AE',
          street: 'Groene Loper 5 ',
        };

        const res = await request(ctx.app)
          .put(`/invoices/users/${count + 1}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(update);

        expect(res.status).to.equal(404);
        expect(res.body).to.equal('User not found.');
      });
      it('should return an HTTP 400 if user is not of type INVOICE', async () => {
        const user = await User.findOne({ where: { type: Not(UserType.INVOICE) } });
        expect(user).to.not.be.null;

        const update: UpdateInvoiceUserRequest = {
          automatic: false,
          city: 'Eindhoven',
          country: 'Nederland',
          postalCode: '5612 AE',
          street: 'Groene Loper 5 ',
        };

        const res = await request(ctx.app)
          .put(`/invoices/users/${user.id}`)
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(update);

        expect(res.status).to.equal(400);
        expect(res.body).to.equal(`User is of type ${UserType[user.type]} and not of type INVOICE.`);
      });
    });
  });
});
