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
 * This is the module page of the payment-request-service.
 *
 * Service layer for {@link stripe/payment-request!PaymentRequest | PaymentRequest}.
 * Owns creation, lookup, cancellation, payment session bootstrap, and the
 * settlement-time hook invoked from the Stripe webhook flow in
 * {@link stripe!StripeService | StripeService}.
 *
 * @module stripe/payment-request-service
 */

import { Dinero } from 'dinero.js';
import { Brackets, EntityManager, SelectQueryBuilder } from 'typeorm';
import PaymentRequest from '../entity/payment-request/payment-request';
import { PaymentRequestStatus } from '../entity/payment-request/payment-request-status';
import User, { UserType } from '../entity/user/user';
import StripeDeposit from '../entity/stripe/stripe-deposit';
import StripePaymentIntent from '../entity/stripe/stripe-payment-intent';
import StripeService from './stripe-service';
import TransferService from './transfer-service';
import WithManager from '../database/with-manager';
import { PaginationParameters } from '../helpers/pagination';
import { toMySQLString } from '../helpers/timestamps';

/**
 * User types that are **never** allowed to be the beneficiary of a PaymentRequest.
 * Soft-deleted users are rejected at runtime regardless of type.
 *
 * Returned via a function (not a top-level const) to sidestep the circular
 * import chain (`stripe-service.ts` → `payment-request-service.ts` → `user.ts`
 * → ... → `stripe-service.ts`) that leaves `UserType` temporarily undefined
 * at module-evaluation time.
 */
export const invalidPaymentRequestBeneficiaryTypes = (): UserType[] => [
  UserType.POINT_OF_SALE,
];

export interface CreatePaymentRequestParams {
  /** The user whose balance will be credited on successful payment. */
  for: User;
  /** Audit: the user issuing this request (admin or the `for` user themselves). */
  createdBy: User;
  /** Fixed, immutable amount (Dinero). */
  amount: Dinero;
  /** When the request stops accepting payments. Must be in the future. */
  expiresAt: Date;
  /** Optional human-readable description (e.g. invoice reference). */
  description?: string | null;
}

export interface PaymentRequestFilterParameters {
  id?: string;
  forId?: number;
  createdById?: number;
  /**
   * Filter by one or more derived statuses. Status is derived from
   * `paidAt` / `cancelledAt` / `expiresAt`, but we translate each candidate
   * status into an equivalent SQL predicate so pagination happens in the DB.
   */
  status?: PaymentRequestStatus[];
  /** Only requests created on or after this date. */
  fromDate?: Date;
  /** Only requests created strictly before this date. */
  tillDate?: Date;
}

/**
 * Thrown when a PaymentRequest cannot be created or paid because the
 * beneficiary user is ineligible (soft-deleted, point-of-sale, etc.).
 */
export class InvalidPaymentRequestBeneficiaryError extends Error {
  public constructor(reason: string) {
    super(`Invalid PaymentRequest beneficiary: ${reason}`);
    this.name = 'InvalidPaymentRequestBeneficiaryError';
  }
}

/**
 * Thrown when a state transition on a PaymentRequest is illegal — e.g.
 * cancelling an already-paid request, or starting payment on a cancelled
 * or expired one.
 */
export class IllegalPaymentRequestTransitionError extends Error {
  public constructor(reason: string) {
    super(`Illegal PaymentRequest transition: ${reason}`);
    this.name = 'IllegalPaymentRequestTransitionError';
  }
}

/**
 * Service layer for {@link stripe/payment-request!PaymentRequest | PaymentRequest}.
 *
 * ## Creation & validation
 *
 * - `createPaymentRequest` validates the beneficiary user and persists a
 *   fresh PENDING request with a fixed amount and expiry.
 *
 * ## Lookup
 *
 * - `getPaymentRequest(id)` fetches a single request with its relations.
 * - `getPaymentRequests(filters, pagination)` is the paginated admin listing.
 *
 * ## Payment session bootstrap
 *
 * - `startPayment(request)` creates a Stripe payment intent linked to the
 *   request. Called by both the authenticated endpoint and the public
 *   (unauthenticated) endpoint. The linked intent carries the back-reference
 *   that {@link stripe!StripeService | StripeService} uses at SUCCEEDED
 *   time to flip the request to PAID.
 *
 * ## State transitions
 *
 * - `cancelPaymentRequest` moves PENDING → CANCELLED (rejects all other source states).
 * - `markFulfilledExternally` is the admin escape hatch when a user paid
 *   out-of-band (e.g. bank transfer). Creates the void→user credit Transfer
 *   manually and marks the request PAID.
 * - `markPaid` is called from the Stripe webhook when a linked payment intent
 *   reaches SUCCEEDED. Idempotent — already-PAID requests are left alone.
 */
export default class PaymentRequestService extends WithManager {
  public constructor(manager?: EntityManager) {
    super(manager);
  }

  /**
   * Validate a candidate beneficiary for a PaymentRequest.
   *
   * Rules:
   * - Soft-deleted users are always rejected.
   * - `UserType.POINT_OF_SALE` is rejected (POS users are synthetic).
   * - Inactive users and `UserType.INVOICE` users are **allowed** — the whole
   *   point is that alumni with a debt and invoice accounts can pay off their
   *   balance via a shareable link.
   *
   * @throws {InvalidPaymentRequestBeneficiaryError} when the user is ineligible.
   */
  public static validatePayable(user: User): void {
    if (!user) {
      throw new InvalidPaymentRequestBeneficiaryError('user is missing');
    }
    if (user.deleted) {
      throw new InvalidPaymentRequestBeneficiaryError('user is soft-deleted');
    }
    if (invalidPaymentRequestBeneficiaryTypes().includes(user.type)) {
      throw new InvalidPaymentRequestBeneficiaryError(
        `user type ${user.type} cannot be a payment-request beneficiary`,
      );
    }
  }

  /**
   * Create and persist a new PaymentRequest. Amount is immutable after this.
   * @throws {InvalidPaymentRequestBeneficiaryError} if `params.for` is ineligible.
   * @throws {Error} if `params.expiresAt` is not strictly in the future, or
   *   if `params.amount` is not strictly positive.
   */
  public async createPaymentRequest(params: CreatePaymentRequestParams): Promise<PaymentRequest> {
    PaymentRequestService.validatePayable(params.for);

    if (!params.expiresAt || params.expiresAt.getTime() <= Date.now()) {
      throw new Error('PaymentRequest expiresAt must be strictly in the future.');
    }
    if (!params.amount || params.amount.getAmount() <= 0) {
      throw new Error('PaymentRequest amount must be strictly positive.');
    }

    const request = new PaymentRequest();
    request.for = params.for;
    request.createdBy = params.createdBy;
    request.amount = params.amount;
    request.expiresAt = params.expiresAt;
    request.description = params.description ?? null;

    return this.manager.getRepository(PaymentRequest).save(request);
  }

  /**
   * Fetch a single PaymentRequest by id, including its relations. Returns
   * `null` when no request with that id exists.
   */
  public async getPaymentRequest(id: string): Promise<PaymentRequest | null> {
    return this.manager.getRepository(PaymentRequest).findOne({
      where: { id },
      relations: {
        for: true,
        createdBy: true,
        cancelledBy: true,
        fulfilledBy: true,
      },
    });
  }

  /**
   * Paginated filtered listing of PaymentRequests. Status is a derived
   * getter (see {@link PaymentRequest.status}), but we translate each
   * candidate status into an equivalent SQL predicate on the stored
   * `paidAt` / `cancelledAt` / `expiresAt` columns so pagination happens
   * in the database.
   *
   * Status → predicate mapping (precedence: PAID > CANCELLED > EXPIRED > PENDING):
   * - `PAID`      → `paidAt IS NOT NULL`
   * - `CANCELLED` → `paidAt IS NULL AND cancelledAt IS NOT NULL`
   * - `EXPIRED`   → `paidAt IS NULL AND cancelledAt IS NULL AND expiresAt < NOW()`
   * - `PENDING`   → `paidAt IS NULL AND cancelledAt IS NULL AND expiresAt >= NOW()`
   *
   * Multiple statuses are OR-combined inside the brackets so the `AND` with
   * the non-status predicates stays correct.
   */
  public async getPaymentRequests(
    filters: PaymentRequestFilterParameters = {},
    pagination: PaginationParameters = {},
  ): Promise<[PaymentRequest[], number]> {
    const { take, skip } = pagination;
    const qb = this.manager.getRepository(PaymentRequest)
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.for', 'pr_for')
      .leftJoinAndSelect('pr.createdBy', 'pr_createdBy')
      .leftJoinAndSelect('pr.cancelledBy', 'pr_cancelledBy')
      .leftJoinAndSelect('pr.fulfilledBy', 'pr_fulfilledBy');

    if (filters.id) qb.andWhere('pr.id = :id', { id: filters.id });
    if (filters.forId !== undefined) qb.andWhere('pr.forId = :forId', { forId: filters.forId });
    if (filters.createdById !== undefined) {
      qb.andWhere('pr.createdById = :createdById', { createdById: filters.createdById });
    }
    if (filters.fromDate) {
      qb.andWhere('pr.createdAt >= :fromDate', { fromDate: toMySQLString(filters.fromDate) });
    }
    if (filters.tillDate) {
      qb.andWhere('pr.createdAt < :tillDate', { tillDate: toMySQLString(filters.tillDate) });
    }

    if (filters.status && filters.status.length > 0) {
      PaymentRequestService.applyStatusFilter(qb, filters.status);
    }

    qb.orderBy('pr.createdAt', 'DESC');
    if (take !== undefined) qb.take(take);
    if (skip !== undefined) qb.skip(skip);

    return qb.getManyAndCount();
  }

  /**
   * Applies the OR-combined derived-status predicate group to `qb` in a
   * single bracketed clause so it composes correctly with the outer AND
   * filters. Each status is re-parameterised (`now_<i>`) because TypeORM
   * requires unique parameter names within a single query.
   */
  private static applyStatusFilter(
    qb: SelectQueryBuilder<PaymentRequest>,
    statuses: PaymentRequestStatus[],
  ): void {
    const nowSql = toMySQLString(new Date());
    qb.andWhere(new Brackets((inner) => {
      statuses.forEach((status, i) => {
        const paramKey = `now_${i}`;
        switch (status) {
          case PaymentRequestStatus.PAID:
            inner.orWhere('pr.paidAt IS NOT NULL');
            break;
          case PaymentRequestStatus.CANCELLED:
            inner.orWhere('(pr.paidAt IS NULL AND pr.cancelledAt IS NOT NULL)');
            break;
          case PaymentRequestStatus.EXPIRED:
            inner.orWhere(
              `(pr.paidAt IS NULL AND pr.cancelledAt IS NULL AND pr.expiresAt < :${paramKey})`,
              { [paramKey]: nowSql },
            );
            break;
          case PaymentRequestStatus.PENDING:
            inner.orWhere(
              `(pr.paidAt IS NULL AND pr.cancelledAt IS NULL AND pr.expiresAt >= :${paramKey})`,
              { [paramKey]: nowSql },
            );
            break;
          default:
            // Exhaustive: a new PaymentRequestStatus value must be added above.
            throw new Error(`Unknown PaymentRequestStatus: ${status as string}`);
        }
      });
    }));
  }

  /**
   * Bootstrap a Stripe payment session for the given request. Creates a
   * fresh {@link stripe!StripePaymentIntent | StripePaymentIntent} tied to
   * the request via its `paymentRequest` back-reference. Called by both the
   * authenticated "I want to pay my own request" endpoint and the public
   * (unauthenticated) share-link endpoint.
   *
   * Rejects requests not in PENDING state.
   *
   * @returns the created {@link stripe!StripeDeposit | StripeDeposit} and the
   *   Stripe `client_secret` the caller forwards to the browser.
   */
  public async startPayment(
    request: PaymentRequest,
  ): Promise<{ deposit: StripeDeposit; clientSecret: string }> {
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new IllegalPaymentRequestTransitionError(
        `cannot start payment on request in state ${request.status}`,
      );
    }
    PaymentRequestService.validatePayable(request.for);

    return new StripeService(this.manager).createStripePaymentIntent(
      request.for,
      request.amount,
      request,
    );
  }

  /**
   * Cancel a PENDING request. Rejects any other source state (PAID, already
   * CANCELLED, EXPIRED). Records `cancelledAt` and `cancelledBy` for audit.
   */
  public async cancelPaymentRequest(
    request: PaymentRequest,
    cancelledBy: User,
  ): Promise<PaymentRequest> {
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new IllegalPaymentRequestTransitionError(
        `cannot cancel request in state ${request.status}`,
      );
    }
    request.cancelledAt = new Date();
    request.cancelledBy = cancelledBy;
    return this.manager.getRepository(PaymentRequest).save(request);
  }

  /**
   * Admin escape hatch: the user paid out-of-band (e.g. bank transfer).
   * Creates the void→user credit Transfer manually and flips the request
   * to PAID. A `reason` is required for the audit description; the acting
   * admin is persisted on the request as `fulfilledBy` for audit.
   *
   * Rejects any non-PENDING source state.
   *
   * @param request - The PENDING PaymentRequest to fulfill.
   * @param reason - Non-empty audit reason (included in the Transfer description).
   * @param actor - The admin performing the escape hatch. Persisted as
   *   `fulfilledBy` so the audit trail shows who flipped the request.
   */
  public async markFulfilledExternally(
    request: PaymentRequest,
    reason: string,
    actor: User,
  ): Promise<PaymentRequest> {
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new IllegalPaymentRequestTransitionError(
        `cannot mark-fulfilled request in state ${request.status}`,
      );
    }
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error('markFulfilledExternally requires a non-empty reason for audit.');
    }
    if (!actor) {
      throw new Error('markFulfilledExternally requires an actor (the admin performing the action).');
    }

    await new TransferService(this.manager).createTransfer({
      amount: request.amount.toObject(),
      toId: request.for.id,
      description: `PaymentRequest ${request.id} fulfilled externally by ${actor.id}: ${trimmedReason}`,
      fromId: undefined,
    });

    request.paidAt = new Date();
    request.fulfilledBy = actor;
    return this.manager.getRepository(PaymentRequest).save(request);
  }

  /**
   * Called by {@link stripe!StripeService | StripeService} from the webhook
   * flow when a linked payment intent reaches SUCCEEDED. Idempotent:
   * already-PAID requests are left unchanged.
   *
   * Does **not** create a credit Transfer — the Stripe deposit flow is the
   * single settlement event and owns Transfer creation. This method only
   * records the `paidAt` timestamp.
   */
  public async markPaid(request: PaymentRequest): Promise<PaymentRequest> {
    if (request.status === PaymentRequestStatus.PAID) {
      return request;
    }
    if (request.status === PaymentRequestStatus.CANCELLED) {
      throw new IllegalPaymentRequestTransitionError(
        'cannot mark paid a request that is already CANCELLED',
      );
    }
    // EXPIRED requests that successfully settle via a late Stripe webhook
    // are still marked PAID — the money arrived, ignoring the clock.
    request.paidAt = new Date();
    return this.manager.getRepository(PaymentRequest).save(request);
  }

  /**
   * Helper used by the Stripe webhook ingestion path: given a payment-intent
   * row, resolve the linked PaymentRequest (if any) and call `markPaid`.
   * Returns `null` when no request is linked.
   *
   * Performs a minimal reload (no relations) — status is derived from stored
   * columns only, and the webhook hot-path has no need for
   * `for`/`createdBy`/`cancelledBy`/`fulfilledBy` joins.
   */
  public async markPaidFromStripeIntent(
    paymentIntent: StripePaymentIntent,
  ): Promise<PaymentRequest | null> {
    if (!paymentIntent.paymentRequest) return null;
    const fresh = await this.manager.getRepository(PaymentRequest).findOne({
      where: { id: paymentIntent.paymentRequest.id },
    });
    if (!fresh) return null;
    return this.markPaid(fresh);
  }
}
