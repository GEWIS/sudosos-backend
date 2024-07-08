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
 */

import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { PaginatedInvoiceResponse } from './response/invoice-response';
import InvoiceService, { InvoiceFilterParameters, parseInvoiceFilterParameters } from '../service/invoice-service';
import { parseRequestPagination } from '../helpers/pagination';
import {
  CreateInvoiceParams,
  CreateInvoiceRequest,
  UpdateInvoiceParams,
  UpdateInvoiceRequest,
} from './request/invoice-request';
import verifyCreateInvoiceRequest, { verifyUpdateInvoiceRequest } from './request/validators/invoice-request-spec';
import { isFail } from '../helpers/specification-validation';
import { asBoolean, asInvoiceState } from '../helpers/validators';
import Invoice from '../entity/invoices/invoice';
import User, { UserType } from '../entity/user/user';
import { UpdateInvoiceUserRequest } from './request/user-request';
import InvoiceUser from '../entity/user/invoice-user';
import { parseInvoiceUserToResponse } from '../helpers/revision-to-response';
import FileService from '../service/file-service';

export default class InvoiceController extends BaseController {
  private logger: Logger = log4js.getLogger('InvoiceController');

  /**
    * Creates a new Invoice controller instance.
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
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Invoice', ['*']),
          handler: this.getAllInvoices.bind(this),
        },
        POST: {
          body: { modelName: 'CreateInvoiceRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Invoice', ['*']),
          handler: this.createInvoice.bind(this),
        },
      },
      '/users/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Invoice', ['*']),
          handler: this.getSingleInvoiceUser.bind(this),
        },
        PUT : {
          body: { modelName: 'UpdateInvoiceUserRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Invoice', ['*']),
          handler: this.updateInvoiceUser.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Invoice', ['*']),
          handler: this.deleteInvoiceUser.bind(this),
        },
      },
      '/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await InvoiceController.getRelation(req), 'Invoice', ['*']),
          handler: this.getSingleInvoice.bind(this),
        },
        PATCH: {
          body: { modelName: 'UpdateInvoiceRequest' },
          policy: async (req) => this.roleManager.can(req.token.roles, 'update', 'all', 'Invoice', ['*']),
          handler: this.updateInvoice.bind(this),
        },
        DELETE: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'delete', 'all', 'Invoice', ['*']),
          handler: this.deleteInvoice.bind(this),
        },
      },
      '/:id(\\d+)/pdf': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', await InvoiceController.getRelation(req), 'Invoice', ['*']),
          handler: this.getInvoicePDF.bind(this),
        },
      },
    };
  }

  /**
   * GET /invoices
   * @summary Returns all invoices in the system.
   * @operationId getAllInvoices
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} toId.query - Filter on Id of the debtor
   * @param {number} invoiceId.query - Filter on invoice ID
   * @param {Array<string|number>} currentState.query enum:CREATED,SENT,PAID,DELETED - Filter based on Invoice State.
   * @param {boolean} returnEntries.query - Boolean if invoice entries should be returned
   * @param {string} fromDate.query - Start date for selected invoices (inclusive)
   * @param {string} tillDate.query - End date for selected invoices (exclusive)
   * @param {integer} take.query - How many entries the endpoint should return
   * @param {integer} skip.query - How many entries should be skipped (for pagination)
   * @return {PaginatedInvoiceResponse} 200 - All existing invoices
   * @return {string} 500 - Internal server error
   */
  public async getAllInvoices(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all invoices', body, 'by user', req.token.user);

    let take;
    let skip;
    let filters: InvoiceFilterParameters;
    try {
      const pagination = parseRequestPagination(req);
      filters = parseInvoiceFilterParameters(req);
      take = pagination.take;
      skip = pagination.skip;
    } catch (e) {
      res.status(400).send(e.message);
      return;
    }

    // Handle request
    try {
      const invoices: PaginatedInvoiceResponse = await InvoiceService.getPaginatedInvoices(
        filters, { take, skip },
      );
      res.json(invoices);
    } catch (error) {
      this.logger.error('Could not return all invoices:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /invoices/{id}
   * @summary Returns a single invoice in the system.
   * @operationId getSingleInvoice
   * @param {integer} id.path.required - The id of the requested invoice
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {boolean} returnEntries.query -
   * Boolean if invoice entries should be returned, defaults to true.
   * @return {InvoiceResponse} 200 - All existing invoices
   * @return {string} 404 - Invoice not found
   * @return {string} 500 - Internal server error
   */
  public async getSingleInvoice(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const invoiceId = parseInt(id, 10);
    this.logger.trace('Get invoice', invoiceId, 'by user', req.token.user);

    // Handle request
    try {
      const returnInvoiceEntries = asBoolean(req.query.returnEntries) ?? true;

      const invoices: Invoice[] = await InvoiceService.getInvoices(
        { invoiceId, returnInvoiceEntries },
      );

      if (!invoices[0]) {
        res.status(404).json('Unknown invoice ID.');
        return;
      }

      res.json(InvoiceService.toResponse(invoices[0], returnInvoiceEntries));
    } catch (error) {
      this.logger.error('Could not return invoice:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * POST /invoices
   * @summary Adds an invoice to the system.
   * @operationId createInvoice
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {CreateInvoiceRequest} request.body.required -
   * The invoice which should be created
   * @return {InvoiceResponse} 200 - The created invoice entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async createInvoice(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as CreateInvoiceRequest;
    this.logger.trace('Create Invoice', body, 'by user', req.token.user);

    // handle request
    try {
      const userDefinedDefaults = await InvoiceService.getDefaultInvoiceParams(body.forId);

      // If no byId is provided we use the token user id.
      const params: CreateInvoiceParams = {
        ...userDefinedDefaults,
        ...body,
        byId: body.byId ?? req.token.user.id,
      };

      const validation = await verifyCreateInvoiceRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const invoice: Invoice = await InvoiceService.createInvoice(params);
      res.json(InvoiceService.toResponse(invoice, true));

    } catch (error) {
      this.logger.error('Could not create invoice:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PATCH /invoices/{id}
   * @summary Adds an invoice to the system.
   * @operationId updateInvoice
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the invoice which should be updated
   * @param {UpdateInvoiceRequest} request.body.required -
   * The invoice update to process
   * @return {BaseInvoiceResponse} 200 - The updated invoice entity
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async updateInvoice(req: RequestWithToken, res: Response): Promise<void> {
    const body = req.body as UpdateInvoiceRequest;
    const { id } = req.params;
    const invoiceId = parseInt(id, 10);
    this.logger.trace('Update Invoice', body, 'by user', req.token.user);

    try {
      // Default byId to token user id.
      const params: UpdateInvoiceParams = {
        ...body,
        invoiceId,
        state: asInvoiceState(body.state),
        byId: body.byId ?? req.token.user.id,
      };

      const validation = await verifyUpdateInvoiceRequest(params);
      if (isFail(validation)) {
        res.status(400).json(validation.fail.value);
        return;
      }

      const invoice: Invoice = await InvoiceService.updateInvoice(params);

      res.json(InvoiceService.toResponse(invoice, false));
    } catch (error) {
      this.logger.error('Could not update invoice:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /invoices/{id}
   * @summary Deletes an invoice.
   * @operationId deleteInvoice
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the invoice which should be deleted
   * @return {string} 404 - Invoice not found
   * @return 204 - Deletion success
   * @return {string} 500 - Internal server error
   */
  // TODO Deleting of invoices that are not of state CREATED?
  public async deleteInvoice(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const invoiceId = parseInt(id, 10);
    this.logger.trace('Delete Invoice', id, 'by user', req.token.user);

    try {
      const invoice = await InvoiceService.deleteInvoice(invoiceId, req.token.user.id);
      if (!invoice) {
        res.status(404).json('Invoice not found.');
        return;
      }
      res.status(204).send();
    } catch (error) {
      this.logger.error('Could not delete invoice:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /invoices/{id}/pdf
   * @summary Get an invoice pdf.
   * @operationId getInvoicePdf
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the invoice to return
   * @return {string} 404 - Invoice not found
   * @return {string} 200 - The pdf location information.
   * @return {string} 500 - Internal server error
   */
  public async getInvoicePDF(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const invoiceId = parseInt(id, 10);
    this.logger.trace('Get Invoice PDF', id, 'by user', req.token.user);

    try {
      const invoice = await Invoice.findOne({ ...InvoiceService.getOptions({ invoiceId }) });
      if (!invoice) {
        res.status(404).json('Invoice not found.');
        return;
      }

      const pdf = await FileService.getOrCreatePDF(invoice);

      res.status(200).json({ pdf: pdf.downloadName });
    } catch (error) {
      this.logger.error('Could get invoice PDF:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * DELETE /invoices/users/{id}
   * @summary Delete invoice user defaults.
   * @operationId deleteInvoiceUser
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the invoice user to delete.
   * @return {string} 404 - Invoice User not found
   * @return 204 - Success
   * @return {string} 500 - Internal server error
   */
  public async deleteInvoiceUser(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    this.logger.trace('Delete Invoice User', id, 'by user', req.token.user);

    try {
      const invoiceUser = await InvoiceUser.findOne({ where: { userId } });
      if (!invoiceUser) {
        res.status(404).json('Invoice User not found.');
        return;
      }

      await InvoiceUser.delete(userId);
      res.status(204).json();
    } catch (error) {
      this.logger.error('Could not get invoice user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * GET /invoices/users/{id}
   * @summary Get invoice user defaults.
   * @operationId getSingleInvoiceUser
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the invoice user to return.
   * @return {string} 404 - Invoice User not found
   * @return {string} 404 - User not found
   * @return {string} 400 - User is not of type INVOICE
   * @return {InvoiceUserResponse} 200 - The requested Invoice User
   * @return {string} 500 - Internal server error
   */
  public async getSingleInvoiceUser(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    this.logger.trace('Get Invoice User', id, 'by user', req.token.user);

    try {
      const user = await User.findOne({ where: { id: userId, deleted: false } });
      if (!user) {
        res.status(404).json('User not found.');
        return;
      }

      if (user.type !== UserType.INVOICE) {
        res.status(400).json(`User is of type ${UserType[user.type]} and not of type INVOICE.`);
        return;
      }

      const invoiceUser = await InvoiceUser.findOne({ where: { userId }, relations: ['user'] });
      if (!invoiceUser) {
        res.status(404).json('Invoice User not found.');
        return;
      }

      res.status(200).json(parseInvoiceUserToResponse(invoiceUser));
    } catch (error) {
      this.logger.error('Could not get invoice user:', error);
      res.status(500).json('Internal server error.');
    }
  }

  /**
   * PUT /invoices/users/{id}
   * @summary Update or create invoice user defaults.
   * @operationId putInvoiceUser
   * @tags invoices - Operations of the invoices controller
   * @security JWT
   * @param {integer} id.path.required - The id of the user to update
   * @param {UpdateInvoiceUserRequest} request.body.required - The invoice user which should be updated
   * @return {string} 404 - User not found
   * @return {string} 400 - User is not of type INVOICE
   * @return {InvoiceUserResponse} 200 - The updated / created Invoice User
   * @return {string} 500 - Internal server error
   */
  public async updateInvoiceUser(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const body = req.body as UpdateInvoiceUserRequest;
    const userId = parseInt(id, 10);
    this.logger.trace('Update Invoice User', id, 'by user', req.token.user);

    try {
      const user = await User.findOne({ where: { id: userId, deleted: false } });
      if (!user) {
        res.status(404).json('User not found.');
        return;
      }

      if (!([UserType.INVOICE, UserType.ORGAN].includes(user.type))) {
        res.status(400).json(`User is of type ${UserType[user.type]} and not of type INVOICE or ORGAN.`);
        return;
      }

      let invoiceUser = Object.assign(new InvoiceUser(), {
        ...body,
        user,
      }) as InvoiceUser;

      invoiceUser = await InvoiceUser.save(invoiceUser);

      res.status(200).json(parseInvoiceUserToResponse(invoiceUser));
    } catch (error) {
      this.logger.error('Could not update invoice user:', error);
      res.status(500).json('Internal server error.');
    }
  }


  /**
   * Function to determine which credentials are needed to get invoice
   * all if user is not connected to invoice
   * own if user is connected to invoice
   * @param req
   * @return whether invoice is connected to used token
   */
  static async getRelation(req: RequestWithToken): Promise<string> {
    const invoice: Invoice = await Invoice.findOne({ where: { id: parseInt(req.params.id, 10) }, relations: ['to'] });
    if (!invoice) return 'all';
    if (invoice.to.id === req.token.user.id) return 'own';
    return 'all';
  }
}
