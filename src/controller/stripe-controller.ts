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
 * This is the module page of the stripe-controller.
 *
 * @module stripe
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import Dinero from 'dinero.js';
import { ReturnFileType } from 'pdf-generator-client';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import StripeService from '../service/stripe-service';
import { StripeRequest } from './request/stripe-request';
import BalanceService from '../service/balance-service';
import { asFromAndTillDate, asReturnFileType } from '../helpers/validators';
import { PdfError } from '../errors';

export default class StripeController extends BaseController {
  private logger: Logger = log4js.getLogger('StripeController');

  private stripeService: StripeService;

  /**
   * Create a new stripe controller instance
   * @param options
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
    this.stripeService = new StripeService();
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/deposit': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create', 'all', 'StripeDeposit', ['*'],
          ),
          handler: this.createStripeDeposit.bind(this),
          body: { modelName: 'StripeRequest' },
        },
      },
      '/report': {
        GET: {
          // The report combines deposits and terminal payments, so both
          // permissions are required rather than either one being enough.
          policy: async (req) => this.canGetSettlementReport(req),
          handler: this.getStripeSettlementReport.bind(this),
        },
      },
      '/report/pdf': {
        GET: {
          policy: async (req) => this.canGetSettlementReport(req),
          handler: this.getStripeSettlementReportPdf.bind(this),
        },
      },
    };
  }

  /**
   * POST /stripe/deposit
   * @summary Start the stripe deposit flow
   * @operationId deposit
   * @tags stripe - Operations of the stripe controller
   * @param {StripeRequest} request.body.required - The deposit that should be created
   * @return {StripePaymentIntentResponse} 200 - Payment Intent information
   * @return {string} 500 - Internal server error
   * @security JWT
   */
  public async createStripeDeposit(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create a new stripe deposit by user', req.token.user);
    const request = req.body as StripeRequest;

    try {
      const amount = Dinero(request.amount);
      const balance = await new BalanceService().getBalance(req.token.user.id);

      // Check if top-up satisfies minimum in accordance with TOS.
      if (!StripeService.validateStripeRequestMinimumAmount(balance, request)) {
        res.status(422).json({ error: 'Top-up amount is too low' });
        return;
      }

      // Check if top-up satisfies maximum in accordance with TOS.
      if (!StripeService.validateStripeRequestMaximumAmount(balance, request)) {
        res.status(422).json({ error: 'Top-up amount is too high' });
        return;
      }

      const { deposit, clientSecret } = await this.stripeService.createStripeDeposit(req.token.user, amount);
      res.status(200).json({
        id: deposit.id,
        createdAt: deposit.createdAt.toISOString(),
        updatedAt: deposit.updatedAt.toISOString(),
        stripeId: deposit.stripePaymentIntent.stripeId,
        clientSecret,
      });
    } catch (error) {
      this.logger.error('Could not create Stripe payment intent:', error);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * Whether the token is allowed to see the settlement report. The report
   * combines StripeDeposit and TerminalPayment data, so both permissions are
   * required. Both checks are awaited explicitly rather than combined with
   * `&&`: `can()` is async, and `promiseA && promiseB` looks at the promise
   * objects themselves (always truthy), not their resolved values, which
   * would silently reduce this to only the second check.
   * @param req
   */
  private async canGetSettlementReport(req: RequestWithToken): Promise<boolean> {
    const [canGetDeposits, canGetTerminalPayments] = await Promise.all([
      this.roleManager.can(req.token.roles, 'get', 'all', 'StripeDeposit', ['*']),
      this.roleManager.can(req.token.roles, 'get', 'all', 'TerminalPayment', ['*']),
    ]);
    return canGetDeposits && canGetTerminalPayments;
  }

  /**
   * GET /stripe/report
   * @summary Get a report of everything settled through Stripe (deposits and
   * terminal payments)
   * @operationId getStripeSettlementReport
   * @tags stripe - Operations of the stripe controller
   * @security JWT
   * @param {string} fromDate.query - The start date of the report, inclusive
   * @param {string} toDate.query - The end date of the report, exclusive
   * @return {StripeSettlementReportResponse} 200 - The requested report
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getStripeSettlementReport(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get stripe settlement report by', req.token.user);

    let fromDate, toDate;
    try {
      const filters = asFromAndTillDate(req.query.fromDate, req.query.toDate);
      fromDate = filters.fromDate;
      toDate = filters.tillDate;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const report = await this.stripeService.getStripeSettlementReport(fromDate, toDate);
      res.json(report.toResponse());
    } catch (error) {
      this.logger.error('Could not get stripe settlement report:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /stripe/report/pdf
   * @summary Get a report of everything settled through Stripe (deposits and
   * terminal payments) in pdf format
   * @operationId getStripeSettlementReportPdf
   * @tags stripe - Operations of the stripe controller
   * @security JWT
   * @param {string} fromDate.query.required - The start date of the report, inclusive
   * @param {string} toDate.query.required - The end date of the report, exclusive
   * @param {string} fileType.query - enum:PDF,TEX - The file type of the report, defaults to PDF
   * @returns {string} 200 - The requested report - application/pdf
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async getStripeSettlementReportPdf(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get stripe settlement report pdf by', req.token.user);

    let fromDate, toDate;
    let fileType: ReturnFileType;
    try {
      const filters = asFromAndTillDate(req.query.fromDate, req.query.toDate);
      fromDate = filters.fromDate;
      toDate = filters.tillDate;
      // asReturnFileType returns undefined rather than throwing when the query
      // param is absent, which would otherwise silently fall through to the
      // raw/TeX branch below and produce a "....undefined" filename.
      fileType = asReturnFileType(req.query.fileType) ?? ReturnFileType.PDF;
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    try {
      const report = await this.stripeService.getStripeSettlementReport(fromDate, toDate);

      const buffer = fileType === 'PDF' ? await report.createPdf() : await report.createRaw();
      const from = `${fromDate.getFullYear()}${fromDate.getMonth() + 1}${fromDate.getDate()}`;
      const to = `${toDate.getFullYear()}${toDate.getMonth() + 1}${toDate.getDate()}`;
      const fileName = `stripe-settlement-report-${from}-${to}.${fileType}`;

      res.setHeader('Content-Type', 'application/pdf+tex');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error) {
      this.logger.error('Could not get stripe settlement report pdf:', error);
      if (error instanceof PdfError) {
        res.status(502).json('PDF Generator service failed.');
        return;
      }
      res.status(500).json('Internal server error.');
    }
  }
}
