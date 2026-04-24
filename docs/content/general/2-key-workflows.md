# Key Workflows

This chapter shows how SudoSOS behaves in practice. It does not try to document every endpoint; it explains the flows that keep the system correct.

**After reading this page, you should know** which entities and services are involved when money moves.

## Purchase (create a transaction)

**Trigger + actor**
- Member buys items (self-service) or a cashier enters the purchase (cashier mode).

**API surface**
- `POST /transactions` (create)
- `POST /transactions/validate` (validate without creating; used by some clients)
- `GET /transactions` and `GET /transactions/:id` (read)

**Entities touched**
- `Transaction`, `SubTransaction`, `SubTransactionRow`
- product/container/POS revisions referenced by rows and sub-transactions
- `Balance` cache (updated from transaction rows and transfers)

**Critical checks**
- product revisions exist and match the request
- container/POS configuration matches (what is available where)
- debt rules (`canGoIntoDebt` for the buyer)
- POS token restrictions for “lesser” POS tokens

**Who receives the money**
- Revenue is split by `SubTransaction`: the **container owner is the seller** for that part of the purchase.
  The POS owner and product creator are not used to decide who is paid.

**Side effects**
- receipts/notifications may be sent by subscribers after persistence

```mermaid
flowchart TD
  Client[Frontend] -->|POST_/transactions| Controller[TransactionController]
  Controller --> Service[TransactionService]
  Service -->|DB_transaction| Persist[Create_entities]
  Persist --> Cache[Balance_cache_updated]
  Persist --> Response[Transaction_response]
  Response --> Client
```

## Invoice

**Trigger + actor**
- Finance/admin groups eligible purchase rows into an invoice. Conceptually this is a **top-up** paid via bank transfer.

**API surface**
- `GET /invoices/eligible-transactions` (discover what can be invoiced)
- `POST /invoices` (create)
- `GET /invoices/:id` and `GET /invoices` (read)
- `GET /invoices/:id/pdf` (PDF)
- `PATCH /invoices/:id` (state changes, updates)
- `DELETE /invoices/:id` (delete/cancel invoice)

**Entities touched**
- `Invoice` (and invoice entries)
- `SubTransactionRow` links to invoices (to prevent double invoicing)
- an invoice transfer (void → user) that increases the user balance

**Critical checks**
- which rows are eligible (and for which user)
- linking/unlinking rows is consistent (no row belongs to multiple invoices)

**VAT note**
- VAT does not live on the invoice transfer. VAT is recorded via the underlying transactions and is reflected in seller-side settlement (seller payouts).

## Deposit (Stripe top-up)

**Trigger + actor**
- Member tops up their balance via Stripe.

**API surface**
- `POST /stripe/deposit` (create a Stripe payment intent; checks min/max top-up rules)
- `POST /stripe/webhook` (Stripe notifies the backend about payment intent updates)
- `GET /stripe/public` (frontend fetches Stripe public key and return URL)

**Entities touched**
- Stripe payment intent records (backend-owned representation)
- a top-up transfer (void → user) that credits the user when the payment succeeds
- balance cache (derived from transfers)

**Critical checks**
- webhook event authenticity (signature verification)
- event routing: only accept events intended for this service
- idempotency: the same Stripe event may be delivered multiple times

## Payment request (shareable payment link)

**Trigger + actor**
- Treasurer (or a user for themself) creates a fixed-amount top-up request with an expiry. The recipient opens a share link (no login), pays via Stripe, and the money is credited to the linked user's balance.

**API surface**
- `POST /payment-requests` (create; admin can create for anyone, regular users only for themselves)
- `GET /payment-requests` and `GET /payment-requests/:id` (read; admin sees all, user sees own)
- `POST /payment-requests/:id/cancel` (cancel a PENDING request)
- `POST /payment-requests/:id/start` (authenticated: start a Stripe session)
- `POST /payment-requests/:id/mark-fulfilled` (admin escape hatch for out-of-band payment)
- `GET /payment-requests-public/:id` (unauthenticated: fetch a trimmed view via share link)
- `POST /payment-requests-public/:id/start` (unauthenticated: start a Stripe session via share link)

**Entities touched**
- `PaymentRequest` (UUID pk, immutable amount, derived status)
- `StripePaymentIntent.paymentRequest?` — one request can have many intents (retries)
- on success: the standard Stripe deposit `Transfer` (void → user) already created by the deposit flow also settles the payment request

**Lifecycle (derived status)**
- `PENDING` → `PAID` when a linked Stripe intent succeeds.
- `PENDING` → `CANCELLED` when an authorized user cancels.
- `PENDING` → `EXPIRED` when `expiresAt` passes without payment.
- Status is derived from `paidAt` / `cancelledAt` / `expiresAt`; precedence is `PAID` > `CANCELLED` > `EXPIRED` > `PENDING`.

**Critical checks**
- amount is fixed at creation — a corrected amount means cancelling and creating a fresh request
- `startPayment` rejects non-`PENDING` requests
- the Stripe webhook flow idempotently calls `markPaid`: already-paid requests are left unchanged, cancelled requests refuse to flip, and expired-but-settled requests still become `PAID` (the money arrived, the clock is secondary)

**Invoices vs. payment requests**
- Invoices create their own credit transfer on behalf of the user (a "paper-trail top-up").
- Payment requests do not pre-create a credit transfer — the Stripe deposit is the single settlement event. A future "invoice via payment link" flow will compose by leaving the settlement to the payment request.

## Payout request (withdraw balance)

**Trigger + actor**
- Member requests a payout of part of their balance; admin approves and processes it.

**API surface**
- `POST /payoutrequests` (create request)
- `POST /payoutrequests/:id/status` (cancel, approve, process, etc.)
- `GET /payoutrequests` and `GET /payoutrequests/:id` (read)
- `GET /payoutrequests/:id/pdf` (PDF)

**Entities touched**
- `PayoutRequest` and `PayoutRequestStatus` records
- payout transfers (user → void) that move money out of the user account

**Critical checks**
- user has sufficient balance at request time and at approval time
- only admins can move a request to non-cancel states
- only the requesting user can cancel their own request

## Next pages

- **[System Architecture](/general/3-system-architecture)**
- **[External Integrations](/general/4-external-integrations)**
- **[Understanding the Codebase](/general/5-understanding-codebase)**
