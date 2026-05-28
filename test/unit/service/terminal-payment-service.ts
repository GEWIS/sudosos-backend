/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import { DataSource } from 'typeorm';
import sinon from 'sinon';
import Stripe from 'stripe';
import { expect } from 'chai';
import TerminalPaymentService from '../../../src/service/terminal-payment-service';
import { STRIPE_API_VERSION } from '../../../src/service/stripe-service';
import TerminalPayment, {
  TerminalPaymentState,
} from '../../../src/entity/transactions/terminal/terminal-payment';
import User, {
  TermsOfServiceStatus,
  UserType,
} from '../../../src/entity/user/user';
import Config from '../../../src/config';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';
import {
  ContainerSeeder,
  DepositSeeder,
  PointOfSaleSeeder,
  ProductCategorySeeder,
  ProductSeeder,
  TransactionSeeder,
  VatGroupSeeder,
} from '../../seed';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import TransactionService from '../../../src/service/transaction-service';
import Product from '../../../src/entity/product/product';
import { CreateTerminalPaymentRequest } from '../../../src/controller/request/terminal-payment-request';
import Transaction from '../../../src/entity/transactions/transaction';
import TmpTransaction from '../../../src/entity/transactions/terminal/tmp-transaction';
import Transfer from '../../../src/entity/transactions/transfer';

const FAKE_PAYMENT_INTENT = 'fake_payment_intent_for_testing_do_not_use';
const FAKE_READER_ID = 'fake_reader_id_do_not_use';

describe('TerminalPaymentService', () => {
  let ctx: {
    connection: DataSource;
    service: TerminalPaymentService;
    users: User[];
    products: Product[];
    terminalPayments: TerminalPayment[];
    validTransactionRequest: TransactionRequest;
  };

  const stubs: sinon.SinonStub[] = [];
  let originalStripeKey: string | undefined;
  let paymentIntentsCreateStub: sinon.SinonStub;
  let readersProcessIntentStub: sinon.SinonStub;

  beforeAll(async () => {
    originalStripeKey = process.env.STRIPE_PRIVATE_KEY;
    process.env.STRIPE_PRIVATE_KEY =
      process.env.STRIPE_PRIVATE_KEY || 'sk_test_dummy';
    Config.reset();

    ctx = {
      ...(await defaultBefore()),
    } as any;

    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;
    const organUser = {
      id: 2,
      firstName: 'Bar',
      type: UserType.ORGAN,
      active: true,
      acceptedToS: TermsOfServiceStatus.NOT_REQUIRED,
    } as User;

    await User.save([adminUser, organUser]);

    const categories = await new ProductCategorySeeder().init();
    const vatGroups = await new VatGroupSeeder().init();
    const products = await new ProductSeeder().init(
      organUser,
      vatGroups,
      categories,
    );
    const containers = await new ContainerSeeder().init(organUser, products);
    const pointOfSale = await new PointOfSaleSeeder().init(
      organUser,
      containers,
    );
    const transactions = await new TransactionSeeder().init(
      [adminUser],
      pointOfSale.barRevision,
    );

    const { terminalPayments } = await new TerminalPaymentSeeder().seed(
      [adminUser],
      [pointOfSale.barRevision],
      [transactions.transactions[0]],
    );

    const product = products.grimbergenRevision;
    const productPrice = product.priceInclVat.toObject();
    const validTransactionRequest: TransactionRequest = {
      from: adminUser.id,
      createdBy: adminUser.id,
      pointOfSale: {
        id: pointOfSale.bar.id,
        revision: pointOfSale.barRevision.revision,
      },
      subTransactions: [
        {
          to: organUser.id,
          container: {
            id: containers.alcoholic.id,
            revision: containers.alcoholicRevision.revision,
          },
          subTransactionRows: [
            {
              product: {
                id: product.product.id,
                revision: product.revision,
              },
              amount: 1,
              totalPriceInclVat: productPrice,
            },
          ],
          totalPriceInclVat: productPrice,
        },
      ],
      totalPriceInclVat: productPrice,
    };

    ctx.users = [adminUser, organUser];
    ctx.terminalPayments = terminalPayments;
    ctx.validTransactionRequest = validTransactionRequest;
    ctx.service = new TerminalPaymentService();
  });

  afterAll(async () => {
    process.env.STRIPE_PRIVATE_KEY = originalStripeKey;
    Config.reset();
    await finishTestDB(ctx.connection);
  });

  beforeEach(() => {
    // Stub the underlying Stripe API methods at the resource prototype level
    // so that no real HTTP calls are made by the StripeService. A throwaway
    // Stripe instance is used purely to reach the resource prototypes; the
    // stubs apply to every Stripe instance (including the one inside the
    // StripeService that TerminalPaymentService owns).
    const sampleStripe = new Stripe('sk_test_dummy', {
      apiVersion: STRIPE_API_VERSION,
    });
    paymentIntentsCreateStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.paymentIntents), 'create')
      .resolves({ id: FAKE_PAYMENT_INTENT, client_secret: 'cs_fake' } as any);
    readersProcessIntentStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'processPaymentIntent',
      )
      .resolves({ id: FAKE_READER_ID } as any);
    stubs.push(paymentIntentsCreateStub, readersProcessIntentStub);
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('#verifyTerminalPaymentRequest', () => {
    it('should use transaction validator', async () => {
      const transactionValidateStub = sinon
        .stub(TransactionService.prototype, 'verifyTransaction')
        .resolves({ valid: true });
      stubs.push(transactionValidateStub);

      const service = new TerminalPaymentService();
      const res = await service.verifyTerminalPaymentRequest({
        transaction: ctx.validTransactionRequest,
      });
      expect(res.valid).to.be.true;
      expect(transactionValidateStub).to.have.been.calledWith(
        ctx.validTransactionRequest,
      );
    });

    it('should return a transaction context for a valid request', async () => {
      const service = new TerminalPaymentService();
      const res = await service.verifyTerminalPaymentRequest({
        transaction: ctx.validTransactionRequest,
      });
      expect(res.valid).to.be.true;
      expect(res.context).to.not.be.undefined;
      // Small sanity check
      const reqProduct = ctx.validTransactionRequest.subTransactions[0].subTransactionRows[0].product;
      expect(res.context!.products.has(`${reqProduct.id}-${reqProduct.revision}`)).to.be.true;
    });

    it('should reject an invalid transaction request', async () => {
      const invalidTransactionReq: TransactionRequest = {
        ...ctx.validTransactionRequest,
        createdBy: 100000,
      };
      const service = new TerminalPaymentService();
      const res = await service.verifyTerminalPaymentRequest({
        transaction: invalidTransactionReq,
      });
      expect(res.valid).to.be.false;
    });
  });

  describe('#getTerminalPayment', () => {
    it('should return a CREATED terminal payment with the given id', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const dbTerminalPayment = await service.getTerminalPayment(
        ctxTerminalPayment!.id,
      );
      expect(dbTerminalPayment).to.not.be.null;
      expect(dbTerminalPayment!.id).to.equal(ctxTerminalPayment!.id);
      expect(dbTerminalPayment!.finalTransaction).to.be.null;
      expect(dbTerminalPayment!.transfer).to.be.null;
      expect(dbTerminalPayment!.temporaryTransaction).to.not.be.null;
      expect(dbTerminalPayment!.temporaryTransaction!.id).to.equal(
        ctxTerminalPayment!.temporaryTransaction!.id,
      );
      expect(dbTerminalPayment!.stripePaymentIntent).to.not.be.null;
      expect(dbTerminalPayment!.stripePaymentIntent.id).to.equal(
        ctxTerminalPayment!.stripePaymentIntent.id,
      );
      expect(dbTerminalPayment!.stripePaymentIntent.stripeId).to.equal(
        ctxTerminalPayment!.stripePaymentIntent.stripeId,
      );
    });

    it('should return a PAID terminal payment with the given id', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PAID,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "PAID"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const dbTerminalPayment = await service.getTerminalPayment(
        ctxTerminalPayment!.id,
      );
      expect(dbTerminalPayment).to.not.be.null;
      expect(dbTerminalPayment!.id).to.equal(ctxTerminalPayment!.id);
      expect(dbTerminalPayment!.temporaryTransaction).to.be.null;
      expect(dbTerminalPayment!.transfer).to.not.be.null;
      expect(dbTerminalPayment!.transfer!.id).to.equal(
        ctxTerminalPayment!.transfer!.id,
      );
      expect(dbTerminalPayment!.finalTransaction).to.not.be.null;
      expect(dbTerminalPayment!.finalTransaction!.id).to.equal(
        ctxTerminalPayment!.finalTransaction!.id,
      );
      expect(dbTerminalPayment!.stripePaymentIntent).to.not.be.null;
      expect(dbTerminalPayment!.stripePaymentIntent.id).to.equal(
        ctxTerminalPayment!.stripePaymentIntent.id,
      );
      expect(dbTerminalPayment!.stripePaymentIntent.stripeId).to.equal(
        ctxTerminalPayment!.stripePaymentIntent.stripeId,
      );
    });
    it('should return null if no terminal payment exists with the given id', async () => {
      const id = ctx.terminalPayments.length + 1000;

      const service = new TerminalPaymentService();
      const terminalPayment = await service.getTerminalPayment(id);

      expect(terminalPayment).to.be.null;
    });
  });

  describe('#createTerminalPayment', () => {
    it('should create a new TerminalPayment together with a TmpTransaction and Stripe payment intent', async () => {
      const req: CreateTerminalPaymentRequest = {
        transaction: ctx.validTransactionRequest,
      };
      const service = new TerminalPaymentService();
      const { valid, context } =
        await service.verifyTerminalPaymentRequest(req);
      // Sanity checks
      expect(valid).to.be.true;
      expect(context).to.not.be.undefined;
      const terminalPayment = await service.createTerminalPayment(
        req,
        context!,
      );

      expect(terminalPayment).to.not.be.null;
      expect(terminalPayment.stripePaymentIntent).to.not.be.null;
      expect(terminalPayment.temporaryTransaction).to.not.be.null;
      expect(terminalPayment.finalTransaction).to.be.null;
      expect(terminalPayment.transfer).to.be.null;

      // Correctly written to database
      const id = terminalPayment.id;
      const dbTerminalPayment = await ctx.connection
        .getRepository(TerminalPayment)
        .findOne({ where: { id } });
      expect(dbTerminalPayment).to.not.be.null;

      // Correctly created Stripe PaymentIntent
      expect(paymentIntentsCreateStub).to.be.calledOnce;
      expect(terminalPayment.stripePaymentIntent.stripeId).to.equal(
        FAKE_PAYMENT_INTENT,
      );

      // Cleanup
      await ctx.connection
        .getRepository(TerminalPayment)
        .remove(terminalPayment);
    });

    it('should throw if the transaction request cannot be transformed into a transaction entity', async () => {
      const req: CreateTerminalPaymentRequest = {
        transaction: ctx.validTransactionRequest,
      };
      const service = new TerminalPaymentService();
      const { valid, context } =
        await service.verifyTerminalPaymentRequest(req);
      // Sanity checks
      expect(valid).to.be.true;
      expect(context).to.not.be.undefined;
      const promise = service.createTerminalPayment(
        {
          ...req,
          transaction: {
            ...ctx.validTransactionRequest,
            createdBy: 10000,
          },
        },
        context!,
      );

      // Weird error message, but precondition should be checked before calling this function.
      // That is the design of the transaction service anyways.
      await expect(promise).to.eventually.be.rejectedWith(
        'SqliteError: NOT NULL constraint failed: tmp_transaction.createdById',
      );
    });
  });

  describe('#startTerminalPayment', () => {
    it('should call the Stripe service with the matching payment intent id', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const promise = service.startTerminalPayment(ctxTerminalPayment!.id, {
        stripeTerminalId: FAKE_READER_ID,
      });
      await expect(promise).to.eventually.be.fulfilled;

      expect(readersProcessIntentStub).to.be.calledOnceWith(FAKE_READER_ID, {
        payment_intent: ctxTerminalPayment?.stripePaymentIntent.stripeId,
      });
    });

    it('should throw if the terminal payment does not exist', async () => {
      const id = ctx.terminalPayments.length + 100;

      const service = new TerminalPaymentService();
      const promise = service.startTerminalPayment(id, {
        stripeTerminalId: FAKE_READER_ID,
      });
      await expect(promise).to.eventually.be.rejectedWith(
        `TerminalPayment with ID "${id}" not found`,
      );
    });
  });

  describe('#handleTerminalPaymentSuccess', () => {
    it('should correctly create transaction and transfer', async () => {
      const tp = ctx.terminalPayments.find((t) => !!t.temporaryTransaction);
      expect(tp).to.not.be.undefined;
      const tmpT = tp?.temporaryTransaction!;

      const nrTransactionsBefore = await ctx.connection
        .getRepository(Transaction)
        .count();
      const nrTransfersBefore = await ctx.connection
        .getRepository(Transfer)
        .count();
      const nrTmpTransactionsBefore = await ctx.connection
        .getRepository(TmpTransaction)
        .count();

      const tpCopy = { ...tp };
      tpCopy.stripePaymentIntent!.terminalPayment = tp;

      const res =
        await new TerminalPaymentService().handleTerminalPaymentSuccess(
          tp!.stripePaymentIntent,
        );
      expect(res.finalTransaction).to.not.be.null;
      expect(res.transfer).to.not.be.null;
      expect(res.temporaryTransaction).to.be.null;

      const finalT = res.finalTransaction!;
      const transfer = res.transfer!;

      const nrTransactionsAfter = await ctx.connection
        .getRepository(Transaction)
        .count();
      const nrTransfersAfter = await ctx.connection
        .getRepository(Transfer)
        .count();
      const nrTmpTransactionsAfter = await ctx.connection
        .getRepository(TmpTransaction)
        .count();

      expect(nrTransactionsAfter).to.equal(nrTransactionsBefore + 1);
      expect(nrTransfersAfter).to.equal(nrTransfersBefore + 1);
      expect(nrTmpTransactionsAfter).to.equal(nrTmpTransactionsBefore - 1);

      // Verify that temporary and final transaction are the same
      expect(tmpT.createdBy.id).to.equal(finalT.createdBy.id);
      expect(tmpT.from.id).to.equal(finalT.from.id);
      expect(tmpT.pointOfSale.pointOfSaleId).to.equal(
        finalT.pointOfSale.pointOfSaleId,
      );
      expect(tmpT.pointOfSale.revision).to.equal(finalT.pointOfSale.revision);
      expect(tmpT.subTransactions.length).to.equal(
        finalT.subTransactions.length,
      );
      expect(tmpT.subTransactions.length).to.equal(1);
      expect(tmpT.subTransactions[0].to.id).to.equal(
        finalT.subTransactions[0].to.id,
      );
      expect(tmpT.subTransactions[0].container.containerId).to.equal(
        finalT.subTransactions[0].container.containerId,
      );
      expect(tmpT.subTransactions[0].container.revision).to.equal(
        finalT.subTransactions[0].container.revision,
      );
      expect(tmpT.subTransactions[0].subTransactionRows.length).to.equal(
        finalT.subTransactions[0].subTransactionRows.length,
      );
      expect(tmpT.subTransactions[0].subTransactionRows.length).to.equal(1);
      expect(tmpT.subTransactions[0].subTransactionRows[0].amount).to.equal(
        finalT.subTransactions[0].subTransactionRows[0].amount,
      );
      expect(
        tmpT.subTransactions[0].subTransactionRows[0].product.productId,
      ).to.equal(
        finalT.subTransactions[0].subTransactionRows[0].product.productId,
      );
      expect(
        tmpT.subTransactions[0].subTransactionRows[0].product.revision,
      ).to.equal(
        finalT.subTransactions[0].subTransactionRows[0].product.revision,
      );

      // Verify transfer is correct
      expect(transfer.amountInclVat.getAmount()).to.equal(
        finalT.subTransactions[0].subTransactionRows[0].amount *
          finalT.subTransactions[0].subTransactionRows[0].product.priceInclVat.getAmount(),
      );
      expect(transfer.to).to.not.be.null;
      expect(transfer.to!.id).to.equal(finalT.from.id);
      expect(transfer.from).to.be.undefined;
      expect(transfer.description).to.equal(
        'Terminal Payment for transaction "3"',
      );

      // Cleanup
      res.finalTransaction = null;
      res.transfer = null;
      await ctx.connection.getRepository(TerminalPayment).save(res);

      await ctx.connection
        .getRepository(TmpTransaction)
        .save(tp!.temporaryTransaction!);
      await ctx.connection.getRepository(TerminalPayment).save(tp!);
      await ctx.connection.manager.delete(Transaction, finalT.id);
      await ctx.connection.getRepository(Transfer).remove(transfer);
    });
    it('should raise error if paymentIntent is not for TerminalPayment', async () => {
      const { stripeDeposits } = await new DepositSeeder().seed(ctx.users);
      const deposit = stripeDeposits.find((s) => s.transfer == null);
      expect(deposit).to.not.be.undefined;

      const promise = new TerminalPaymentService().handleTerminalPaymentSuccess(
        deposit.stripePaymentIntent,
      );

      await expect(promise).to.eventually.be
        .rejectedWith('Given paymentIntent does not have a TerminalPayment');
    });
    it('should raise error if terminalPayment is already successful', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.finalTransaction && t.transfer,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      const promise = new TerminalPaymentService().handleTerminalPaymentSuccess(
        tp.stripePaymentIntent,
      );

      await expect(promise).to.eventually.be
        .rejectedWith('TerminalPayment has state "paid", but expected state "created"');
    });
  });
});
