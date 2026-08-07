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

/**
 * This is the module page of the terminal payment service
 *
 * @module stripe/terminal-payment
 */

import { EntityManager, FindOptionsRelations } from 'typeorm';
import { CreateTerminalPaymentRequest, ProcessTerminalPaymentRequest } from '../controller/request/terminal-payment-request';
import WithManager from '../database/with-manager';
import TmpTransaction from '../entity/transactions/terminal/tmp-transaction';
import TransactionService, { TransactionContext } from './transaction-service';
import StripeService from './stripe-service';
import DineroFactory from 'dinero.js';
import TerminalPayment, { TerminalPaymentState } from '../entity/transactions/terminal/terminal-payment';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import TransferService from './transfer-service';
import { TerminalPaymentResponse } from '../controller/response/terminal-payment-response';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';

/**
 * The relations needed to turn a TerminalPayment into a
 * {@link TerminalPaymentResponse}. Shared by every lookup so a payment fetched
 * by payment intent is as complete as one fetched by ID.
 */
const TERMINAL_PAYMENT_RELATIONS: FindOptionsRelations<TerminalPayment> = {
  temporaryTransaction: {
    pointOfSale: { pointOfSale: true },
    from: true,
    createdBy: true,
    subTransactions: {
      container: { container: true },
      to: true,
      subTransactionRows: { product: { product: true, vat: true } },
    },
  },
  finalTransaction: {
    pointOfSale: { pointOfSale: true },
    from: true,
    createdBy: true,
    subTransactions: {
      container: { container: true },
      to: true,
      subTransactionRows: { product: { product: true, vat: true } },
    },
  },
  transfer: true,
  stripePaymentIntent: true,
  createdBy: true,
};

export default class TerminalPaymentService extends WithManager {
  private transactionService: TransactionService;

  private stripeService: StripeService;

  constructor(manager?: EntityManager) {
    super(manager);
    this.transactionService = new TransactionService(manager);
    this.stripeService = new StripeService(manager);
  }

  /**
   * Convert a {@link TerminalPayment} entity into its API response shape. The
   * embedded transaction is taken from the final transaction when the payment
   * has succeeded, otherwise from the temporary transaction (if any).
   * @param tp The entity to convert.
   * @param context Optional transaction context to reuse when building the
   * embedded transaction response.
   */
  public static async asTerminalPaymentResponse(tp: TerminalPayment, context?: TransactionContext): Promise<TerminalPaymentResponse> {
    const transactionService = new TransactionService();
    const totalCost = tp.stripePaymentIntent.amount;
    return {
      id: tp.id,
      createdAt: tp.createdAt.toISOString(),
      updatedAt: tp.updatedAt.toISOString(),
      version: tp.version,
      amount: tp.stripePaymentIntent.amount.toObject(),
      transaction: tp.temporaryTransaction
        ? await transactionService.asTransactionResponse(tp.temporaryTransaction, totalCost, context)
        : (tp.finalTransaction
          ? await transactionService.asTransactionResponse(tp.finalTransaction, totalCost, context)
          : undefined ),
      transfer: tp.transfer ? TransferService.asTransferResponse(tp.transfer) : undefined,
      createdBy: parseUserToBaseResponse(tp.createdBy, false),
      state: tp.getState(),
    };
  }

  /**
   * Verify whether the given terminal payment request object is valid. Primarily checks
   * whether the transaction is OK.
   * @param params
   */
  public async verifyTerminalPaymentRequest(params: CreateTerminalPaymentRequest) {
    return this.transactionService.verifyTransaction(params.transaction);
  }

  /**
   * Find the TerminalPayment with the given ID
   * @returns The TerminalPayment if found. Null if not found.
   */
  public async getTerminalPayment(id: number): Promise<TerminalPayment | null> {
    return this.manager.getRepository(TerminalPayment).findOne({
      where: { id },
      relations: TERMINAL_PAYMENT_RELATIONS,
    });
  }

  /**
   * Find the TerminalPayment belonging to the given Stripe payment intent.
   * Used after a webhook has been processed, to report the payment's new state
   * to subscribers.
   * @param paymentIntentId The database ID of the {@link StripePaymentIntent}.
   * @returns The TerminalPayment if found. Null if not found.
   */
  public async getTerminalPaymentByPaymentIntentId(paymentIntentId: number): Promise<TerminalPayment | null> {
    return this.manager.getRepository(TerminalPayment).findOne({
      where: { stripePaymentIntent: { id: paymentIntentId } },
      relations: TERMINAL_PAYMENT_RELATIONS,
    });
  }

  /**
   * Determine whether the given user is connected to the TerminalPayment with
   * the given ID:
   *   - `own` if they created it, or are the buyer or creator of its
   *     transaction
   *   - `all` otherwise, and when the TerminalPayment does not exist
   * @param id ID of the TerminalPayment.
   * @param userId ID of the user whose relation to it is being determined.
   */
  public async getRelation(id: number, userId: number): Promise<'all' | 'own'> {
    const t = await this.getTerminalPayment(id);
    if (!t) return 'all';

    return t.isRelatedToUser(userId) ? 'own' : 'all';
  }

  /**
   * Create a new TerminalPayment. Save the transaction as a temporary,
   * immutable record to the database.
   * @param params
   * @param context Transaction context returned by the transaction
   * validator.
   */
  public async createTerminalPayment(params: CreateTerminalPaymentRequest, context: TransactionContext) {
    const tmpTransaction: TmpTransaction | undefined = await this.transactionService.asTransaction(params.transaction, context);
    if (!tmpTransaction) {
      throw new Error('Could not transform transaction request into a transaction entity');
    }

    const savedTmpTransaction = await this.manager.save(TmpTransaction, tmpTransaction);
    const totalCost: DineroFactory.Dinero = tmpTransaction.subTransactions.reduce((prevTotalSt, st) => {
      const strTotal = st.subTransactionRows.reduce((prevTotalStr, str) => {
        return prevTotalStr.add(str.product.priceInclVat.multiply(str.amount));
      }, DineroFactory());
      return prevTotalSt.add(strTotal);
    }, DineroFactory());

    const { stripePaymentIntent } = await this.stripeService.createStripePaymentIntent(savedTmpTransaction.from, totalCost, 'terminal');

    const tp = await this.manager.getRepository(TerminalPayment).save({
      stripePaymentIntent,
      temporaryTransaction: savedTmpTransaction,
      createdBy: savedTmpTransaction.createdBy,
    } as TerminalPayment);
    const dbTerminalPayment = await this.getTerminalPayment(tp.id);

    return dbTerminalPayment!;
  }

  /**
   * Send the payment to the terminal: record which reader is handling it and
   * instruct Stripe to start collecting the payment.
   * @param id ID of the TerminalPayment to process.
   * @param params Request holding the Stripe terminal ID to process with.
   * @returns The updated TerminalPayment.
   */
  public async startTerminalPayment(id: number, params: ProcessTerminalPaymentRequest): Promise<TerminalPayment> {
    const tp = await this.getTerminalPayment(id);
    if (!tp) {
      throw new Error(`TerminalPayment with ID "${id}" not found`);
    }

    const terminal = await this.stripeService.getSingleTerminal(params.stripeTerminalId);
    if (!terminal) {
      throw new Error(`Stripe Terminal with ID "${params.stripeTerminalId}" not found`);
    }

    tp.processedByTerminal = terminal.id;
    await this.manager.save(tp);

    await this.stripeService.startTerminalPayment(terminal.id, tp.stripePaymentIntent.stripeId);
    return tp;
  }

  /**
   * Cancel a CREATED or PROCESSING terminal payment. Removes the temporary transaction.
   * @param id ID of the TerminalPayment
   * @param sendStripeCancellation Whether the corresponding PaymentIntent must
   * also be cancelled at Stripe. Defaults to true, but should be false when
   * Stripe is cancelling the terminalPayment.
   * @returns The cancelled TerminalPayment.
   */
  public async cancelTerminalPayment(id: number, sendStripeCancellation = true): Promise<TerminalPayment> {
    const tp = await this.getTerminalPayment(id);
    if (!tp) throw new Error(`TerminalPayment with ID "${id}" not found`);

    if (tp.getState() !== TerminalPaymentState.CREATED && tp.getState() !== TerminalPaymentState.PROCESSING) {
      throw new Error(`TerminalPayment has state "${tp.getState()}", but expected state "${TerminalPaymentState.CREATED}" or "${TerminalPaymentState.PROCESSING}"`);
    }

    const transaction = tp.temporaryTransaction;
    tp.temporaryTransaction = null;
    await this.manager.save(tp);
    await this.manager.getRepository(TmpTransaction).remove(transaction);

    if (sendStripeCancellation && tp.processedByTerminal) {
      await this.stripeService.cancelTerminalAction(tp.processedByTerminal);
    }

    if (sendStripeCancellation) {
      tp.stripePaymentIntent = await this.stripeService.cancelPaymentIntent(tp.stripePaymentIntent);
    }

    return tp;
  }

  /**
   * Create the transaction and corresponding transfer in the database
   * @param paymentIntent PaymentIntent that has been paid
   */
  public async handleTerminalPaymentSuccess(paymentIntent: StripePaymentIntent) {
    if (!paymentIntent.terminalPayment) throw new Error('Given paymentIntent does not have a TerminalPayment');

    const tp = await this.getTerminalPayment(paymentIntent.terminalPayment!.id);
    if (!tp) throw new Error(`TerminalPayment with ID "${paymentIntent.terminalPayment.id}" not found!`);

    if (tp.getState() !== TerminalPaymentState.PROCESSING) {
      throw new Error(`TerminalPayment has state "${tp.getState()}", but expected state "${TerminalPaymentState.PROCESSING}"`);
    }
    const { temporaryTransaction } = tp;
    if (!temporaryTransaction) {
      throw new Error('No temporary transaction found to convert to an actual transaction.');
    }

    // Transform the temporary transaction into an actual transaction
    const transactionService = new TransactionService(this.manager);
    const transactionReq = transactionService.asTransactionRequest(temporaryTransaction);
    const { valid, context } = await transactionService.verifyTransaction(transactionReq);
    if (!valid) throw new Error('Stored transaction is invalid');
    if (!context) throw new Error('No context given');
    tp.finalTransaction = await transactionService.createTransaction(transactionReq, context);

    // Create the transfer that pays for the transaction
    tp.transfer = await new TransferService(this.manager).createTransfer({
      amount: paymentIntent.amount.toObject(),
      description: `Terminal Payment for transaction "${tp.finalTransaction.id}"`,
      toId: temporaryTransaction.from.id,
      fromId: undefined,
    });

    // Remove the temporary transaction reference
    tp.temporaryTransaction = null;

    // Save all changes to the database
    await this.manager.save(tp);

    // Cleanup temporary transaction
    await this.manager.getRepository(TmpTransaction).remove(temporaryTransaction);

    return tp;
  }
}
