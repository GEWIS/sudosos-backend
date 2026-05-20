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
 * @module terminal-payment
 */

import { EntityManager } from 'typeorm';
import { CreateTerminalPaymentRequest, ProcessTerminalPaymentRequest } from '../controller/request/terminal-payment-request';
import WithManager from '../database/with-manager';
import TmpTransaction from '../entity/transactions/terminal/tmp-transaction';
import TransactionService, { TransactionContext } from './transaction-service';
import StripeService from './stripe-service';
import DineroFactory, { DineroObject } from 'dinero.js';
import TerminalPayment from '../entity/transactions/terminal/terminal-payment';

export default class TerminalPaymentService extends WithManager {
  private transactionService: TransactionService;

  private stripeService: StripeService;

  constructor(manager?: EntityManager) {
    super();
    this.transactionService = new TransactionService(manager);
    this.stripeService = new StripeService(manager);
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
    return this.manager.getRepository(TerminalPayment).findOne({ where: { id } });
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

    const { stripePaymentIntent } = await this.stripeService.createStripePaymentIntent(savedTmpTransaction.from, totalCost);

    const terminalPayment = this.manager.getRepository(TerminalPayment).save({
      stripePaymentIntent,
      temporaryTransaction: savedTmpTransaction,
    } as TerminalPayment);

    return terminalPayment;
  }

  /**
   * Send the Payment to the terminal
   */
  public async startTerminalPayment(id: number, params: ProcessTerminalPaymentRequest): Promise<void> {
    const terminalPayment = await this.getTerminalPayment(id);
    if (!terminalPayment) {
      throw new Error('TerminalPayment not found');
    }
    await this.stripeService.startTerminalPayment(params.stripeTerminalId, terminalPayment.stripePaymentIntent.stripeId);

  }
}