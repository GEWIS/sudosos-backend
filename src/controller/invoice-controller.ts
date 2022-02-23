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
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { PaginatedInvoiceResponse } from './response/invoice-response';
import InvoiceService, { InvoiceFilterParameters, parseInvoiceFilterParameters } from '../service/invoice-service';
import { parseRequestPagination } from '../helpers/pagination';
import { CreateInvoiceParams, CreateInvoiceRequest } from './request/invoice-request';
import verifyCreateInvoiceRequest from './request/validators/invoice-request-spec';
import { isFail } from '../helpers/specification-validation';

export default class InvoiceController extends BaseController {
  private logger: Logger = log4js.getLogger('InvoiceController');

  /**
    * Creates a new product controller instance.
    * @param options - The options passed to the base controller.
    */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
    * @inhertidoc
    */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Invoices', ['*']),
          handler: this.getAllInvoices.bind(this),
        },
        POST: {
          body: { modelName: 'CreateInvoiceRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Invoices', ['*']),
          handler: this.createInvoice.bind(this),
        },
      },
    };
  }

  /**
   * Returns all invoices in the system.
   * @route GET /\
   * @group invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} toId.query - Filter on Id of the debtor
   * @param {invoiceId} invoiceId.query - Filter on invoice ID
   * @param {InvoiceState} state.query - Filter based on Invoice State
   * @param {boolean} returnEntries.query - Boolean if invoice entries should be returned
   * @returns {PaginatedInvoiceResponse.model} 200 - All existing invoices
   * @returns {string} 500 - Internal server error
   */
  public async getAllInvoices(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all invoices', body, 'by user', req.token.user);

    let take;
    let skip;
    try {
      const pagination = parseRequestPagination(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    let filters: InvoiceFilterParameters;
    try {
      filters = parseInvoiceFilterParameters(req);
    } catch (e) {
      res.status(400).json(e.message);
      return;
    }

    // Handle request
    try {
      const invoices: PaginatedInvoiceResponse = await InvoiceService.getInvoices(
        filters, { take, skip },
      );
      res.json(invoices);
    } catch (error) {
      this.logger.error('Could not return all invoices:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * Adds an invoice to the system.
   * @route POST /invoices
   * @group invoices - Operations of the invoices controller
   * @security JWT
   * @param {CreateInvoiceRequest.model} invoice.body.required -
   * The invoice which should be created
   * @returns {BaseInvoiceResponse.model} 200 - The created invoice entity
   * @returns {string} 400 - Validation error
   * @returns {string} 500 - Internal server error
   */
  public async createInvoice(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateInvoiceRequest;
    this.logger.trace('Create Invoice', body, 'by user', req.token.user);

    // handle request
    try {
      // If no byId is provided we use the token user id.
      const params: CreateInvoiceParams = {
        ...body,
        byId: body.byId ?? req.token.user.id,
      };

      const validation = await verifyCreateInvoiceRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      res.json(await InvoiceService.createInvoice(params));
    } catch (error) {
      this.logger.error('Could not create invoice:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
