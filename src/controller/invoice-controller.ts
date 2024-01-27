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
import InvoiceService, {
  InvoiceFilterParameters,
  parseInvoiceFilterParameters,
  PdfGenerator,
} from '../service/invoice-service';
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
import FileService from '../service/file-service';
import { INVOICE_PDF_LOCATION } from '../files/storage';
// @ts-ignore
import { Client } from 'pdf-generator-client';
import fs from 'fs';

// const loggingFetch = async (url: any, options: any) => {
//   try {
//     const response = await fetch(url, options);
//
//     // Clone the response for logging
//     const clonedResponse = response.clone();
//
//     // Log the response headers for the PDF
//     console.error(`Received response from ${url}`);
//     for (let [key, value] of clonedResponse.headers.entries()) {
//       console.error(`${key}: ${value}`);
//     }
//
//
//     // console.error(clonedResponse);
//     // // Check if the response is a PDF
//     // if (response.headers.get('content-type') === 'application/pdf') {
//     //   // Extract the filename from the Content-Disposition header
//     //   const contentDisposition = response.headers.get('content-disposition');
//     //   let filename;
//     //
//     //   if (contentDisposition) {
//     //     const matches = contentDisposition.match(/filename=".+\/tmp\/([^"]+)"/);
//     //     filename = matches && matches[1];
//     //   }
//     //
//     //   // If filename is set, construct the new URL and make another call
//     //   if (filename) {
//     //     const fileUrl = `http://localhost:3001/${filename}`;
//     //     console.error(fileUrl);
//     //     // const fileResponse = await fetch(fileUrl);
//         const blob = await fileResponse.blob();
//         const buffer = Buffer.from(await blob.arrayBuffer());
//     //     //
//     //     // // Write the file
//         fs.writeFileSync('./data/invoices/test2.pdf', buffer);
//         // console.log('PDF saved');
//     //   }
//     // }
//
//     return response;
//   } catch (error) {
//     console.error('Fetch error:', error);
//     throw error;
//   }
// };


export default class InvoiceController extends BaseController {
  private logger: Logger = log4js.getLogger('InvoiceController');

  private pdfGenerator: PdfGenerator;

  /**
    * Creates a new Invoice controller instance.
    * @param options - The options passed to the base controller.
    */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
    this.pdfGenerator = {
      client: new Client('http://localhost:3001/pdf', { fetch }),
      fileService: new FileService(INVOICE_PDF_LOCATION),
    };
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

      const invoices: PaginatedInvoiceResponse = await InvoiceService.getInvoices(
        { invoiceId, returnInvoiceEntries }, { },
      );

      if (!invoices.records[0]) {
        res.status(404).json('Unknown invoice ID.');
        return;
      }

      res.json(invoices.records[0]);
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

      res.json(await InvoiceService.updateInvoice(params));
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
   * @return {SimpleFileResponse} 200 - The invoice pdf information.
   * @return {string} 500 - Internal server error
   */
  public async getInvoicePDF(req: RequestWithToken, res: Response): Promise<void> {
    const { id } = req.params;
    const invoiceId = parseInt(id, 10);
    this.logger.trace('Get Invoice PDF', id, 'by user', req.token.user);

    try {
      const invoice = await InvoiceService.getOrCreatePDF(invoiceId, this.pdfGenerator);
      if (!invoice) {
        res.status(404).json('Invoice not found.');
        return;
      }

      res.status(200).json(invoice);
    } catch (error) {
      this.logger.error('Could get invoice PDF:', error);
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
    console.error(invoice);
    if (invoice.to.id === req.token.user.id) return 'own';
    return 'all';
  }
}
