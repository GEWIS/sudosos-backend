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
 * This is the module page of the payment-request-controller.
 *
 * Authenticated endpoints for managing {@link stripe/payment-request!PaymentRequest | PaymentRequest}
 * rows. The unauthenticated share-link surface lives in
 * {@link ./payment-request-public-controller | PaymentRequestPublicController}.
 *
 * @module stripe/payment-request
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import Dinero from 'dinero.js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { parseRequestPagination, toResponse } from '../helpers/pagination';
import PaymentRequestService, {
  IllegalPaymentRequestTransitionError,
  InvalidPaymentRequestBeneficiaryError,
  PaymentRequestFilterParameters,
} from '../service/payment-request-service';
import PaymentRequest from '../entity/payment-request/payment-request';
import User from '../entity/user/user';
import {
  BasePaymentRequestResponse,
  PaymentRequestStartResponse,
} from './response/payment-request-response';
import {
  CreatePaymentRequestRequest,
  MarkFulfilledExternallyRequest,
} from './request/payment-request-request';
import { parseUserToBaseResponse } from '../helpers/revision-to-response';
import { PaymentRequestStatus } from '../entity/payment-request/payment-request-status';

export default class PaymentRequestController extends BaseController {
  private logger: Logger = log4js.getLogger('PaymentRequestController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.configureLogger(this.logger);
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/': {
        GET: {
          // Both `get:all` (admin) and `get:own` (regular user) pass. The
          // handler inspects the caller's permissions and — for `get:own`
          // only — forces `forId` to the caller's user id so users see only
          // their own requests.
          policy: async (req) => (
            await this.roleManager.can(req.token.roles, 'get', 'all', 'PaymentRequest', ['*'])
          ) || (
            await this.roleManager.can(req.token.roles, 'get', 'own', 'PaymentRequest', ['*'])
          ),
          handler: this.returnAllPaymentRequests.bind(this),
        },
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'create',
            await PaymentRequestController.getRelation(req),
            'PaymentRequest', ['*'],
          ),
          handler: this.createPaymentRequest.bind(this),
          body: { modelName: 'CreatePaymentRequestRequest' },
        },
      },
      '/:id': {
        GET: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'get',
            await PaymentRequestController.getRelation(req),
            'PaymentRequest', ['*'],
          ),
          handler: this.returnSinglePaymentRequest.bind(this),
        },
      },
      '/:id/cancel': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update',
            await PaymentRequestController.getRelation(req),
            'PaymentRequest', ['*'],
          ),
          handler: this.cancelPaymentRequest.bind(this),
        },
      },
      '/:id/start': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update',
            await PaymentRequestController.getRelation(req),
            'PaymentRequest', ['*'],
          ),
          handler: this.startPaymentAuthenticated.bind(this),
        },
      },
      '/:id/mark-fulfilled': {
        POST: {
          policy: async (req) => this.roleManager.can(
            req.token.roles, 'update', 'all', 'PaymentRequest', ['*'],
          ),
          handler: this.markFulfilledExternally.bind(this),
          body: { modelName: 'MarkFulfilledExternallyRequest' },
        },
      },
    };
  }

  /**
   * Load the PaymentRequest for the current `/:id` request, caching on `req`
   * so the policy + handler together only hit the DB once.
   *
   * The full relation set (`for`, `createdBy`, `cancelledBy`, `fulfilledBy`)
   * is loaded so that handlers can serialize the response directly from
   * the cached entity without re-querying.
   *
   * Returns `null` when there is no `:id` param or the request doesn't exist.
   */
  public static async loadPaymentRequest(
    req: RequestWithToken & { paymentRequest?: PaymentRequest | null },
  ): Promise<PaymentRequest | null> {
    if (req.paymentRequest !== undefined) {
      return req.paymentRequest;
    }
    const { id } = req.params;
    if (!id) {
      req.paymentRequest = null;
      return null;
    }
    req.paymentRequest = await new PaymentRequestService().getPaymentRequest(id);
    return req.paymentRequest;
  }

  /**
   * Determine "own" vs "all" for RBAC. Creation takes the `forId` from the
   * body; state transitions look up the request by id and compare against
   * the caller. The lookup is cached on `req` via
   * {@link loadPaymentRequest} so the subsequent handler does not re-query.
   */
  public static async getRelation(req: RequestWithToken): Promise<string> {
    const body = req.body as Partial<CreatePaymentRequestRequest> | undefined;
    if (body && body.forId != null) {
      return body.forId === req.token.user.id ? 'own' : 'all';
    }

    const request = await PaymentRequestController.loadPaymentRequest(
      req as RequestWithToken & { paymentRequest?: PaymentRequest | null },
    );
    return (request != null && request.for.id === req.token.user.id) ? 'own' : 'all';
  }

  /**
   * Convert a PaymentRequest entity into the standard response shape.
   */
  public static asBasePaymentRequestResponse(request: PaymentRequest): BasePaymentRequestResponse {
    return {
      id: request.id,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      version: request.version,
      for: parseUserToBaseResponse(request.for, false),
      createdBy: parseUserToBaseResponse(request.createdBy, false),
      amount: request.amount.toObject(),
      expiresAt: request.expiresAt.toISOString(),
      paidAt: request.paidAt ? request.paidAt.toISOString() : null,
      cancelledAt: request.cancelledAt ? request.cancelledAt.toISOString() : null,
      cancelledBy: request.cancelledBy ? parseUserToBaseResponse(request.cancelledBy, false) : null,
      fulfilledBy: request.fulfilledBy ? parseUserToBaseResponse(request.fulfilledBy, false) : null,
      description: request.description,
      status: request.status,
    };
  }

  /**
   * GET /payment-requests
   * @summary List PaymentRequests (paginated, with filtering by beneficiary, creator, and status)
   * @operationId getAllPaymentRequests
   * @tags paymentRequests - Operations of the payment-request controller
   * @security JWT
   * @param {integer} forId.query - Filter by beneficiary user id.
   * @param {integer} createdById.query - Filter by creator user id.
   * @param {string} status.query - enum:PENDING,PAID,EXPIRED,CANCELLED - Comma-separated list of derived statuses.
   * @param {string} fromDate.query - Filter requests created on or after this ISO date (inclusive).
   * @param {string} tillDate.query - Filter requests created strictly before this ISO date (exclusive).
   * @param {integer} take.query - How many rows the endpoint should return
   * @param {integer} skip.query - How many rows to skip (for pagination)
   * @return {PaginatedBasePaymentRequestResponse} 200 - All existing payment requests
   * @return {string} 400 - Validation error
   * @return {string} 500 - Internal server error
   */
  public async returnAllPaymentRequests(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get all payment requests by user', req.token.user);

    let filters: PaymentRequestFilterParameters;
    let pagination;
    try {
      filters = PaymentRequestController.parseFilters(req);
      pagination = parseRequestPagination(req);
    } catch (e) {
      res.status(400).send(e instanceof Error ? e.message : String(e));
      return;
    }

    // Scope the listing: callers with only `get:own` can see their own
    // requests, regardless of any `forId` they pass in the query string.
    const canSeeAll = await this.roleManager.can(
      req.token.roles, 'get', 'all', 'PaymentRequest', ['*'],
    );
    if (!canSeeAll) {
      filters.forId = req.token.user.id;
    }

    try {
      const service = new PaymentRequestService();
      const [rows, count] = await service.getPaymentRequests(filters, pagination);
      const records = rows.map((r) => PaymentRequestController.asBasePaymentRequestResponse(r));
      res.status(200).json(toResponse(records, count, pagination));
    } catch (e) {
      this.logger.error('Could not list payment requests:', e);
      res.status(500).send('Internal server error.');
    }
  }

  private static parseFilters(req: RequestWithToken): PaymentRequestFilterParameters {
    const q = req.query || {};
    const filters: PaymentRequestFilterParameters = {};
    if (typeof q.forId === 'string') {
      const forId = parseInt(q.forId, 10);
      if (Number.isNaN(forId)) throw new Error('Invalid forId');
      filters.forId = forId;
    }
    if (typeof q.createdById === 'string') {
      const createdById = parseInt(q.createdById, 10);
      if (Number.isNaN(createdById)) throw new Error('Invalid createdById');
      filters.createdById = createdById;
    }
    if (typeof q.status === 'string' && q.status.length > 0) {
      const allowed = Object.values(PaymentRequestStatus) as string[];
      const tokens = q.status.split(',').map((s) => s.trim().toUpperCase());
      for (const t of tokens) {
        if (!allowed.includes(t)) throw new Error(`Invalid status: ${t}`);
      }
      filters.status = tokens as PaymentRequestStatus[];
    }
    if (typeof q.fromDate === 'string') {
      const d = new Date(q.fromDate);
      if (Number.isNaN(d.getTime())) throw new Error('Invalid fromDate');
      filters.fromDate = d;
    }
    if (typeof q.tillDate === 'string') {
      const d = new Date(q.tillDate);
      if (Number.isNaN(d.getTime())) throw new Error('Invalid tillDate');
      filters.tillDate = d;
    }
    return filters;
  }

  /**
   * GET /payment-requests/{id}
   * @summary Fetch a single PaymentRequest by id.
   * @operationId getSinglePaymentRequest
   * @tags paymentRequests - Operations of the payment-request controller
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @security JWT
   * @return {BasePaymentRequestResponse} 200 - Single payment request
   * @return {string} 404 - Unknown id
   */
  public async returnSinglePaymentRequest(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Get single payment request by user', req.token.user, 'id', req.params.id);

    try {
      const request = await PaymentRequestController.loadPaymentRequest(
        req as RequestWithToken & { paymentRequest?: PaymentRequest | null },
      );
      if (!request) {
        res.status(404).send();
        return;
      }
      res.status(200).json(PaymentRequestController.asBasePaymentRequestResponse(request));
    } catch (e) {
      this.logger.error('Could not get payment request:', e);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /payment-requests
   * @summary Create a new PaymentRequest.
   * @operationId createPaymentRequest
   * @tags paymentRequests - Operations of the payment-request controller
   * @param {CreatePaymentRequestRequest} request.body.required - The request to create
   * @security JWT
   * @return {BasePaymentRequestResponse} 200 - The created payment request
   * @return {string} 400 - Validation error
   * @return {string} 404 - Beneficiary user not found
   */
  public async createPaymentRequest(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Create payment request by user', req.token.user, 'body', req.body);
    const body = req.body as CreatePaymentRequestRequest;

    const forUser = await User.findOne({ where: { id: body.forId } });
    if (!forUser) {
      res.status(404).send('Beneficiary user not found.');
      return;
    }

    let expiresAt: Date;
    try {
      expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) throw new Error('Invalid expiresAt');
    } catch {
      res.status(400).send('Invalid expiresAt; must be a valid ISO-8601 timestamp.');
      return;
    }

    try {
      const service = new PaymentRequestService();
      const request = await service.createPaymentRequest({
        for: forUser,
        createdBy: req.token.user,
        amount: Dinero(body.amount),
        expiresAt,
        description: body.description ?? null,
      });
      res.status(200).json(PaymentRequestController.asBasePaymentRequestResponse(request));
    } catch (e) {
      if (e instanceof InvalidPaymentRequestBeneficiaryError) {
        res.status(400).send(e.message);
        return;
      }
      if (e instanceof Error) {
        res.status(400).send(e.message);
        return;
      }
      this.logger.error('Could not create payment request:', e);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /payment-requests/{id}/cancel
   * @summary Cancel a PENDING PaymentRequest.
   * @operationId cancelPaymentRequest
   * @tags paymentRequests - Operations of the payment-request controller
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @security JWT
   * @return {BasePaymentRequestResponse} 200 - The cancelled payment request
   * @return {string} 404 - Unknown id
   * @return {string} 409 - Request is not in PENDING state
   */
  public async cancelPaymentRequest(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Cancel payment request by user', req.token.user, 'id', req.params.id);

    try {
      const request = await PaymentRequestController.loadPaymentRequest(
        req as RequestWithToken & { paymentRequest?: PaymentRequest | null },
      );
      if (!request) {
        res.status(404).send();
        return;
      }
      const service = new PaymentRequestService();
      const cancelled = await service.cancelPaymentRequest(request, req.token.user);
      res.status(200).json(PaymentRequestController.asBasePaymentRequestResponse(cancelled));
    } catch (e) {
      if (e instanceof IllegalPaymentRequestTransitionError) {
        res.status(409).send(e.message);
        return;
      }
      this.logger.error('Could not cancel payment request:', e);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /payment-requests/{id}/start
   * @summary Start a Stripe payment session for the given PaymentRequest while authenticated.
   * @operationId startPaymentRequestAuthenticated
   * @tags paymentRequests - Operations of the payment-request controller
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @security JWT
   * @return {PaymentRequestStartResponse} 200 - Stripe client secret
   * @return {string} 404 - Unknown id
   * @return {string} 409 - Request is not in PENDING state
   */
  public async startPaymentAuthenticated(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Start payment (authenticated) by user', req.token.user, 'id', req.params.id);

    try {
      const request = await PaymentRequestController.loadPaymentRequest(
        req as RequestWithToken & { paymentRequest?: PaymentRequest | null },
      );
      if (!request) {
        res.status(404).send();
        return;
      }
      const service = new PaymentRequestService();
      const { deposit, clientSecret } = await service.startPayment(request);
      const response: PaymentRequestStartResponse = {
        paymentRequestId: request.id,
        stripeId: deposit.stripePaymentIntent.stripeId,
        clientSecret,
      };
      res.status(200).json(response);
    } catch (e) {
      if (e instanceof IllegalPaymentRequestTransitionError) {
        res.status(409).send(e.message);
        return;
      }
      if (e instanceof InvalidPaymentRequestBeneficiaryError) {
        res.status(400).send(e.message);
        return;
      }
      this.logger.error('Could not start payment for payment request:', e);
      res.status(500).send('Internal server error.');
    }
  }

  /**
   * POST /payment-requests/{id}/mark-fulfilled
   * @summary Admin escape hatch: mark a PaymentRequest paid out-of-band (e.g. bank transfer).
   *   Creates a void->user credit Transfer manually.
   * @operationId markPaymentRequestFulfilledExternally
   * @tags paymentRequests - Operations of the payment-request controller
   * @param {string} id.path.required - UUID v4 of the payment request.
   * @param {MarkFulfilledExternallyRequest} request.body.required - The audit reason
   * @security JWT
   * @return {BasePaymentRequestResponse} 200 - The marked-paid payment request
   * @return {string} 404 - Unknown id
   * @return {string} 409 - Request is not in PENDING state
   */
  public async markFulfilledExternally(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Mark fulfilled externally by user', req.token.user, 'id', req.params.id);
    const body = req.body as MarkFulfilledExternallyRequest;

    if (!body?.reason || body.reason.trim().length === 0) {
      res.status(400).send('reason is required.');
      return;
    }

    try {
      const request = await PaymentRequestController.loadPaymentRequest(
        req as RequestWithToken & { paymentRequest?: PaymentRequest | null },
      );
      if (!request) {
        res.status(404).send();
        return;
      }
      const service = new PaymentRequestService();
      const updated = await service.markFulfilledExternally(request, body.reason, req.token.user);
      res.status(200).json(PaymentRequestController.asBasePaymentRequestResponse(updated));
    } catch (e) {
      if (e instanceof IllegalPaymentRequestTransitionError) {
        res.status(409).send(e.message);
        return;
      }
      if (e instanceof Error) {
        res.status(400).send(e.message);
        return;
      }
      this.logger.error('Could not mark payment request fulfilled:', e);
      res.status(500).send('Internal server error.');
    }
  }
}
