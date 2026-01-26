# Core Concepts

This chapter defines the domain language used throughout SudoSOS. It is intentionally implementation-light, so non-developers can reason about the flows too.

**After reading this page, you should know** what “transaction”, “transfer”, “balance”, “invoice”, and “revision” mean in SudoSOS.

## Accounts and user types

Most “actors” in SudoSOS are represented as a `User`, but with different `UserType` values (members, organs, local admins, integration accounts, etc.).

In practice, this means:
- the buyer of a transaction is a `User`
- the seller of a sub-transaction is a `User` (often an organ)
- invoice recipients are `User`s as well (including dedicated invoice users)

## Money representation (Dinero)

Amounts are handled as integers via Dinero (no floating-point money). When you see fields like `amountInclVat` or `priceInclVat`, they are integer amounts including VAT.

VAT is explicit. A `ProductRevision` carries a VAT group, and transaction rows reference the product revision that was current when the purchase was made.

For reporting, VAT is calculated **per product (revision)**, not “per transaction” (see `ReportService.addSelectTotals`).

## Transactions (purchases)

A **transaction** is a purchase event.

The important structure is:

- **Transaction**: one buyer (`fromId`), created by a user (`createdById`), at a point of sale.
- **SubTransaction**: the part of the purchase sold by a single seller (`toId`) from a single container.
  **The container owner is the seller**. This is who receives the money for the rows in that sub-transaction.
  The transaction total is split by sub-transactions, so the sub-transaction structure defines how spent money is divided.
- **SubTransactionRow**: one product line. It references a **product revision**, not just a product id.

Why this structure exists:
- one purchase can involve multiple sellers (e.g. bar + committee snacks)
- containers control what is offered at a point of sale, and **who receives the revenue**
  (not the creator of the product, and not the owner of the point of sale)
- revisions ensure historical correctness (prices and availability should not change retroactively)

## Transfers (non-purchase money movement)

A **transfer** is money movement that is not a product purchase. Examples:
- deposits/top-ups (e.g. Stripe)
- payouts
- invoices and invoice payments
- fines and write-offs

Transfers can be **between two users**, but many transfers use a “void” side (represented as a missing `fromId`/`toId`, or a special system id).

- **Void → user**: money enters a user’s SudoSOS balance (e.g. top-ups, invoice transfers, write-offs, waived fines).
- **User → void**: money leaves a user’s SudoSOS balance (e.g. payouts, fines).

In day-to-day language we usually call:
- **Void → user** transfers a **top-up**.
- **User → void** transfers a **payout**.

  (A fine is effectively a payout in this sense: it is money leaving the user’s balance, even though it is not user-initiated.)

If you need to move money without a product row, you will almost always end up in the transfer model.

## Balance (cached snapshot)

SudoSOS stores a `Balance` record per user in the `balance` table. It is a **cache** derived from:
- transaction rows (purchases and sales)
- transfers (topups/payout money movement)

The cache is updated by the backend (see `BalanceService.updateBalances`). The audit trail lives in the event tables (`transaction`, `sub_transaction_row`, `transfer`), and the balance is the fast “current total” view.

Practical implications:
- do not add a “balance” column to `User`
- money-changing features must update the event tables correctly; the balance cache follows from that

## Revisions (historical truth)

Some catalogue configuration is immutable and versioned:
- `ProductRevision` (name, `priceInclVat`, VAT group, flags)
- `ContainerRevision` (name, which products it contains)
- `PointOfSaleRevision` (name, which containers it contains, authentication mode)

Revisions are immutable (updates are rejected). When configuration changes, a new revision is created. Transactions and their rows keep referencing the revision numbers that were current at the time.

## Invoices

An **invoice** is best understood as a **top-up with a paper trail**.

- The invoice creates a transfer that increases the user’s balance (think: “top-up by bank transfer”, instead of Stripe).
- The invoice entries (purchase rows) are the **reason** for the top-up amount.
- Those entries are not a self-updating truth source: if the underlying purchases change, the invoice must be updated to stay consistent.

**VAT note**: the invoice transfer itself is **not** VAT-applicable. VAT is handled by the underlying transactions and shows up in the relevant seller payouts.

## Seller payouts (settling sellers and recording VAT)

A **seller payout** is a payout transfer for a seller over a time range:

- pick a seller (`requestedById`) and a date range (`startDate` → `endDate`)
- take all sales in that range for that seller (across all transactions)
- create a **User → void** transfer for the total amount (`description: Seller payout: <reference>`)

This is where VAT is practically accounted for. A single transaction can contain multiple sellers, so VAT reporting is done **per seller payout** rather than “per transaction”.

## RBAC (who may do what)

Authorisation checks are expressed as permission strings of the form:

`<action>:<relation>:<resource>:<attributes>`

- **action**: `get`, `create`, `update`, `delete`
- **relation**: `all`, `organ`, `own`
- **resource**: e.g. `Transaction`, `Invoice`, `PayoutRequest`
- **attributes**: which fields may be accessed

Relation is computed per request (for example: “is this payout request requested by the current user?”). These checks live in controller policies.

## Deletion and audit trail

SudoSOS keeps financial history. Deletion is therefore conservative:
- many models are soft-deleted (or have a `deleted` flag)
- invoices and payouts keep records even when cancelled/deleted

When in doubt, prefer “make it inactive” over “remove it from the database”.

## Next pages

- **[Key Workflows](/general/2-key-workflows)**
- **[System Architecture](/general/3-system-architecture)**
- **[External Integrations](/general/4-external-integrations)**
- **[Understanding the Codebase](/general/5-understanding-codebase)**
