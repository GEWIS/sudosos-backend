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
  UserType,
} from '../../../src/entity/user/user';
import Config from '../../../src/config';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import TerminalPaymentSeeder from '../../seed/ledger/terminal-payment-seeder';
import { DepositSeeder } from '../../seed';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import TransactionService from '../../../src/service/transaction-service';
import Product from '../../../src/entity/product/product';
import { CreateTerminalPaymentRequest } from '../../../src/controller/request/terminal-payment-request';
import Transaction from '../../../src/entity/transactions/transaction';
import TmpTransaction from '../../../src/entity/transactions/terminal/tmp-transaction';
import Transfer from '../../../src/entity/transactions/transfer';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';

const FAKE_PAYMENT_INTENT = 'fake_payment_intent_for_testing_do_not_use';
const FAKE_READER_ID = 'fake_reader_id_do_not_use';
const FAKE_READER_NAME = 'fake_reader_name_do_not_use';

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
  let paymentIntentsCancelStub: sinon.SinonStub;
  let readersListStub: sinon.SinonStub;
  let readersProcessIntentStub: sinon.SinonStub;
  let readersCancelActionStub: sinon.SinonStub;

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
      tosRequired: false,
    } as User;
    const organUser = {
      id: 2,
      firstName: 'Bar',
      type: UserType.ORGAN,
      active: true,
      tosRequired: false,
    } as User;

    await User.save([adminUser, organUser]);

    // The TerminalPaymentSeeder seeds the full catalogue (categories, VAT
    // groups, products, containers, point of sale) and a set of transactions
    // internally when no points of sale or transactions are supplied, and
    // returns them so the request below can be built against the same entities.
    const { terminalPayments, catalogue } = await new TerminalPaymentSeeder().seed([adminUser]);
    const { products, containers, pointOfSale } = catalogue!;

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
    paymentIntentsCancelStub = sinon
      .stub(Object.getPrototypeOf(sampleStripe.paymentIntents), 'cancel')
      .resolves({ id: FAKE_PAYMENT_INTENT, status: 'canceled' } as any);
    readersListStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'list',
      )
      .resolves({ data: [{ id: FAKE_READER_ID, name: FAKE_READER_NAME, lastSeenAt: new Date(), available: true }] });
    readersProcessIntentStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'processPaymentIntent',
      )
      .resolves({ id: FAKE_READER_ID } as any);
    readersCancelActionStub = sinon
      .stub(
        Object.getPrototypeOf(sampleStripe.terminal.readers),
        'cancelAction',
      )
      .resolves({ id: FAKE_READER_ID } as any);
    stubs.push(
      paymentIntentsCreateStub,
      paymentIntentsCancelStub,
      readersListStub,
      readersProcessIntentStub,
      readersCancelActionStub,
    );
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('#asTerminalPaymentResponse', () => {
    it('should map a CREATED terminal payment using its temporary transaction', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const tp = await service.getTerminalPayment(ctxTerminalPayment!.id);
      expect(tp).to.not.be.null;

      const response = await TerminalPaymentService.asTerminalPaymentResponse(tp!);

      expect(response.id).to.equal(tp!.id);
      expect(response.version).to.equal(tp!.version);
      expect(response.state).to.equal(TerminalPaymentState.CREATED);
      expect(response.amount).to.deep.equal(
        tp!.stripePaymentIntent.amount.toObject(),
      );
      expect(response.createdBy.id).to.equal(tp!.createdBy.id);
      // The temporary transaction should be mapped, no transfer should exist yet
      expect(response.transaction).to.not.be.undefined;
      expect(response.transaction!.id).to.equal(tp!.temporaryTransaction!.id);
      expect(response.transfer).to.be.undefined;
    });

    it('should map a PAID terminal payment using its final transaction and transfer', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PAID,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "PAID"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const tp = await service.getTerminalPayment(ctxTerminalPayment!.id);
      expect(tp).to.not.be.null;

      const response = await TerminalPaymentService.asTerminalPaymentResponse(tp!);

      expect(response.id).to.equal(tp!.id);
      expect(response.state).to.equal(TerminalPaymentState.PAID);
      // The final transaction should be mapped since there is no temporary one
      expect(response.transaction).to.not.be.undefined;
      expect(response.transaction!.id).to.equal(tp!.finalTransaction!.id);
      // The transfer should be mapped
      expect(response.transfer).to.not.be.undefined;
      expect(response.transfer!.id).to.equal(tp!.transfer!.id);
    });

    it('should map a CANCELLED terminal payment without a transaction or transfer', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CANCELLED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CANCELLED"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const tp = await service.getTerminalPayment(ctxTerminalPayment!.id);
      expect(tp).to.not.be.null;

      const response = await TerminalPaymentService.asTerminalPaymentResponse(tp!);

      expect(response.id).to.equal(tp!.id);
      expect(response.state).to.equal(TerminalPaymentState.CANCELLED);
      expect(response.transaction).to.be.undefined;
      expect(response.transfer).to.be.undefined;
    });
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
      expect(terminalPayment.createdBy).to.not.be.null;
      expect(terminalPayment.createdBy.id).to.equal(terminalPayment.temporaryTransaction.createdBy.id);

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

      // The card-present payment must be captured automatically, otherwise the
      // authorization expires and payment_intent.succeeded never fires.
      const createParams = paymentIntentsCreateStub.firstCall.args[0];
      expect(createParams.capture_method).to.equal('automatic');
      expect(createParams.payment_method_options?.card_present?.capture_method)
        .to.be.undefined;

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

      // Error message differs per database (SQLite vs MariaDB), so only check that it rejects.
      await expect(promise).to.eventually.be.rejected;
    });

    it('should throw if the transaction service yields no transaction entity', async () => {
      const req: CreateTerminalPaymentRequest = {
        transaction: ctx.validTransactionRequest,
      };
      const service = new TerminalPaymentService();
      const { context } = await service.verifyTerminalPaymentRequest(req);

      // Force the transaction service to produce no transaction entity.
      const asTransactionStub = sinon
        .stub(TransactionService.prototype, 'asTransaction')
        .resolves(undefined);
      stubs.push(asTransactionStub);

      const promise = service.createTerminalPayment(req, context!);
      await expect(promise).to.eventually.be.rejectedWith(
        'Could not transform transaction request into a transaction entity',
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
      const response = await service.startTerminalPayment(ctxTerminalPayment!.id, {
        stripeTerminalId: FAKE_READER_ID,
      });

      expect(response).to.not.be.null;
      expect(response.getState()).to.equal(TerminalPaymentState.PROCESSING);

      expect(readersProcessIntentStub).to.be.calledOnceWith(FAKE_READER_ID, {
        payment_intent: ctxTerminalPayment?.stripePaymentIntent.stripeId,
      });

      // Cleanup
      await TerminalPayment.save(ctxTerminalPayment);
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

    it('should throw if the Stripe terminal does not exist', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      // readersListStub only knows about FAKE_READER_ID, so getSingleTerminal
      // returns null for any other id.
      const unknownTerminalId = 'non_existent_reader_id';
      const service = new TerminalPaymentService();
      const promise = service.startTerminalPayment(ctxTerminalPayment!.id, {
        stripeTerminalId: unknownTerminalId,
      });
      await expect(promise).to.eventually.be.rejectedWith(
        `Stripe Terminal with ID "${unknownTerminalId}" not found`,
      );
      // The intent should never have been sent to a reader
      expect(readersProcessIntentStub).to.not.have.been.called;
    });
  });

  describe('#handleTerminalPaymentSuccess', () => {
    it('should correctly create transaction and transfer', async () => {
      const tp = ctx.terminalPayments.find((t) => t.getState() === TerminalPaymentState.PROCESSING);
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
    it('should raise error if terminalPayment is not yet procesing', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      const promise = new TerminalPaymentService().handleTerminalPaymentSuccess(
        tp.stripePaymentIntent,
      );

      await expect(promise).to.eventually.be
        .rejectedWith('TerminalPayment has state "created", but expected state "processing"');
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
        .rejectedWith('TerminalPayment has state "paid", but expected state "processing"');
    });
    it('should raise error if the terminal payment cannot be found in the database', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PROCESSING,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      const service = new TerminalPaymentService();
      const getStub = sinon
        .stub(service, 'getTerminalPayment')
        .resolves(null);
      stubs.push(getStub);

      const promise = service.handleTerminalPaymentSuccess(tp.stripePaymentIntent);

      await expect(promise).to.eventually.be
        .rejectedWith(`TerminalPayment with ID "${tp.id}" not found!`);
    });
    it('should raise error if the processing terminal payment has no temporary transaction', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PROCESSING,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      // A PROCESSING payment that lost its temporary transaction.
      const fakeTerminalPayment = {
        getState: () => TerminalPaymentState.PROCESSING,
        temporaryTransaction: null,
      } as unknown as TerminalPayment;

      const service = new TerminalPaymentService();
      const getStub = sinon
        .stub(service, 'getTerminalPayment')
        .resolves(fakeTerminalPayment);
      stubs.push(getStub);

      const promise = service.handleTerminalPaymentSuccess(tp.stripePaymentIntent);

      await expect(promise).to.eventually.be
        .rejectedWith('No temporary transaction found to convert to an actual transaction.');
    });
    it('should raise error if the stored transaction is no longer valid', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PROCESSING,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      const verifyStub = sinon
        .stub(TransactionService.prototype, 'verifyTransaction')
        .resolves({ valid: false });
      stubs.push(verifyStub);

      const promise = new TerminalPaymentService().handleTerminalPaymentSuccess(
        tp.stripePaymentIntent,
      );

      await expect(promise).to.eventually.be
        .rejectedWith('Stored transaction is invalid');
    });
    it('should raise error if no transaction context is returned', async () => {
      const tp = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PROCESSING,
      );
      expect(tp).to.not.be.undefined;
      tp.stripePaymentIntent.terminalPayment = tp;

      const verifyStub = sinon
        .stub(TransactionService.prototype, 'verifyTransaction')
        .resolves({ valid: true, context: undefined });
      stubs.push(verifyStub);

      const promise = new TerminalPaymentService().handleTerminalPaymentSuccess(
        tp.stripePaymentIntent,
      );

      await expect(promise).to.eventually.be
        .rejectedWith('No context given');
    });
  });

  describe('#cancelTerminalPayment', () => {
    it('should correctly cancel a terminal payment', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PROCESSING,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const tmpTransactionId = ctxTerminalPayment!.temporaryTransaction!.id;
      const nrTmpTransactionsBefore = await ctx.connection
        .getRepository(TmpTransaction)
        .count();

      const service = new TerminalPaymentService();
      const result = await service.cancelTerminalPayment(ctxTerminalPayment!.id);

      // The terminal reader should stop the payment
      expect(readersCancelActionStub).to.be.calledOnceWith(
        ctxTerminalPayment.processedByTerminal,
      );
      // The Stripe payment intent should have been cancelled
      expect(paymentIntentsCancelStub).to.be.calledOnceWith(
        ctxTerminalPayment!.stripePaymentIntent.stripeId,
      );

      // The returned terminal payment should now be CANCELLED
      expect(result).to.not.be.null;
      expect(result.temporaryTransaction).to.be.null;
      expect(result.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );
      expect(result.stripePaymentIntent.cancelledWithAPI).to.be.true;

      // The change should be persisted and the temporary transaction removed
      const dbTerminalPayment = await service.getTerminalPayment(
        ctxTerminalPayment!.id,
      );
      expect(dbTerminalPayment!.temporaryTransaction).to.be.null;
      expect(dbTerminalPayment!.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );

      const nrTmpTransactionsAfter = await ctx.connection
        .getRepository(TmpTransaction)
        .count();
      expect(nrTmpTransactionsAfter).to.equal(nrTmpTransactionsBefore - 1);
      const removedTmp = await ctx.connection
        .getRepository(TmpTransaction)
        .findOne({ where: { id: tmpTransactionId } });
      expect(removedTmp).to.be.null;

      // Cleanup: restore the temporary transaction and re-attach it, and reset
      // the payment intent's cancelledWithAPI flag, so the seeded CREATED
      // terminal payment is left intact for other tests.
      ctxTerminalPayment!.stripePaymentIntent.cancelledWithAPI = false;
      await ctx.connection
        .getRepository(StripePaymentIntent)
        .save(ctxTerminalPayment!.stripePaymentIntent);
      await ctx.connection
        .getRepository(TmpTransaction)
        .save(ctxTerminalPayment!.temporaryTransaction!);
      await ctx.connection
        .getRepository(TerminalPayment)
        .save(ctxTerminalPayment!);
    });
    it('should not cancel terminal payment at Stripe when instructed', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const tmpTransactionId = ctxTerminalPayment!.temporaryTransaction!.id;
      const nrTmpTransactionsBefore = await ctx.connection
        .getRepository(TmpTransaction)
        .count();

      const service = new TerminalPaymentService();
      const result = await service.cancelTerminalPayment(ctxTerminalPayment!.id, false);

      // The Stripe payment intent should NOT have been cancelled
      expect(paymentIntentsCancelStub).to.not.be.called;
      expect(readersCancelActionStub).to.not.be.called;

      // The returned terminal payment should now be CANCELLED
      expect(result).to.not.be.null;
      expect(result.temporaryTransaction).to.be.null;
      expect(result.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );
      expect(result.stripePaymentIntent.cancelledWithAPI).to.equal(ctxTerminalPayment.stripePaymentIntent.cancelledWithAPI);

      // The change should be persisted and the temporary transaction removed
      const dbTerminalPayment = await service.getTerminalPayment(
        ctxTerminalPayment!.id,
      );
      expect(dbTerminalPayment!.temporaryTransaction).to.be.null;
      expect(dbTerminalPayment!.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );

      const nrTmpTransactionsAfter = await ctx.connection
        .getRepository(TmpTransaction)
        .count();
      expect(nrTmpTransactionsAfter).to.equal(nrTmpTransactionsBefore - 1);
      const removedTmp = await ctx.connection
        .getRepository(TmpTransaction)
        .findOne({ where: { id: tmpTransactionId } });
      expect(removedTmp).to.be.null;

      // Cleanup: restore the temporary transaction and re-attach it, and reset
      // the payment intent's cancelledWithAPI flag, so the seeded CREATED
      // terminal payment is left intact for other tests.
      ctxTerminalPayment!.stripePaymentIntent.cancelledWithAPI = false;
      await ctx.connection
        .getRepository(StripePaymentIntent)
        .save(ctxTerminalPayment!.stripePaymentIntent);
      await ctx.connection
        .getRepository(TmpTransaction)
        .save(ctxTerminalPayment!.temporaryTransaction!);
      await ctx.connection
        .getRepository(TerminalPayment)
        .save(ctxTerminalPayment!);
    });
    it('should not cancel reader action if intent is not processing', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.CREATED,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "CREATED"',
      ).to.not.be.undefined;

      const tmpTransactionId = ctxTerminalPayment!.temporaryTransaction!.id;
      const nrTmpTransactionsBefore = await ctx.connection
        .getRepository(TmpTransaction)
        .count();

      const service = new TerminalPaymentService();
      const result = await service.cancelTerminalPayment(ctxTerminalPayment!.id);

      // The reader should NOT have been cancelled
      expect(readersCancelActionStub).to.not.be.called;
      // The Stripe payment intent should have been cancelled
      expect(paymentIntentsCancelStub).to.be.calledOnceWith(
        ctxTerminalPayment!.stripePaymentIntent.stripeId,
      );

      // The returned terminal payment should now be CANCELLED
      expect(result).to.not.be.null;
      expect(result.temporaryTransaction).to.be.null;
      expect(result.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );
      expect(result.stripePaymentIntent.cancelledWithAPI).to.equal(true);

      // The change should be persisted and the temporary transaction removed
      const dbTerminalPayment = await service.getTerminalPayment(
        ctxTerminalPayment!.id,
      );
      expect(dbTerminalPayment!.temporaryTransaction).to.be.null;
      expect(dbTerminalPayment!.getState()).to.equal(
        TerminalPaymentState.CANCELLED,
      );

      const nrTmpTransactionsAfter = await ctx.connection
        .getRepository(TmpTransaction)
        .count();
      expect(nrTmpTransactionsAfter).to.equal(nrTmpTransactionsBefore - 1);
      const removedTmp = await ctx.connection
        .getRepository(TmpTransaction)
        .findOne({ where: { id: tmpTransactionId } });
      expect(removedTmp).to.be.null;

      // Cleanup: restore the temporary transaction and re-attach it, and reset
      // the payment intent's cancelledWithAPI flag, so the seeded CREATED
      // terminal payment is left intact for other tests.
      ctxTerminalPayment!.stripePaymentIntent.cancelledWithAPI = false;
      await ctx.connection
        .getRepository(StripePaymentIntent)
        .save(ctxTerminalPayment!.stripePaymentIntent);
      await ctx.connection
        .getRepository(TmpTransaction)
        .save(ctxTerminalPayment!.temporaryTransaction!);
      await ctx.connection
        .getRepository(TerminalPayment)
        .save(ctxTerminalPayment!);
    });
    it('should throw when terminal payment is already processed', async () => {
      const ctxTerminalPayment = ctx.terminalPayments.find(
        (t) => t.getState() === TerminalPaymentState.PAID,
      );
      // Sanity check
      expect(
        ctxTerminalPayment,
        'Precondition failed: could not find terminal payment with state "PAID"',
      ).to.not.be.undefined;

      const service = new TerminalPaymentService();
      const promise = service.cancelTerminalPayment(ctxTerminalPayment!.id, false);

      await expect(promise).to.eventually.be.rejectedWith('TerminalPayment has state "paid", but expected state "created" or "processing"');
      expect(readersCancelActionStub).to.not.have.been.called;
      expect(paymentIntentsCancelStub).to.not.have.been.called;
    });
    it('should throw when terminal payment does not exist', async () => {
      const id = ctx.terminalPayments.length + 100;

      const service = new TerminalPaymentService();
      const promise = service.cancelTerminalPayment(id);

      await expect(promise).to.eventually.be.rejectedWith(`TerminalPayment with ID "${id}" not found`);
      expect(readersCancelActionStub).to.not.have.been.called;
      expect(paymentIntentsCancelStub).to.not.have.been.called;
    });
  });
});
