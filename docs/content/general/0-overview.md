# Overview

SudoSOS is GEWIS’ point-of-sale and internal financial system. It records purchases, deposits, invoices, payouts, and the audit trail around them. This repository contains the backend API that enforces the rules.

**After reading this page, you should know** what SudoSOS is for, who uses it, and which terms show up throughout the docs.

::: tip Looking for API details?
- **Swagger API**: `https://sudosos.gewis.nl/api/api-docs/`
- **TypeDoc**: `/typedoc/`
:::

## What SudoSOS is

At its core, SudoSOS does two things:
- **Point of sale**: fast purchases at borrels and activities (self-service or cashier-driven).
- **Ledger and settlement**: track who owes what, generate invoices, and process deposits and payouts.

It integrates with GEWIS organisational data so that members, organs, and roles do not need to be managed twice.

## Who uses it

- **Members**: buy items, top up, view their history.
- **Cashiers**: enter purchases for members.
- **Organs/committees**: act as sellers; manage products and points of sale.
- **Finance/admin**: generate invoices, handle exceptions, approve payouts, and report.

## What the backend owns

- **Authoritative business rules**: validation, pricing rules via revisions, debt limits.
- **Audit trail**: transactions, transfers, invoices, and balance snapshots.
- **Authorisation**: role-based access control (RBAC).
- **Integrations**: sync of users/roles, Stripe deposit entry points, and mail notifications.

The backend does **not** provide a user interface. The dashboard and POS UI live in the separate frontend repository.

::: tip Frontend code
The dashboard and POS UI are in `https://github.com/GEWIS/sudosos-frontend`.
:::

## Terms you will see everywhere

- **Transaction**: a purchase event (one buyer, one or more sellers).
- **Transfer**: money movement that is not a purchase (deposit, payout, invoice, fine, write-off).
- **Balance**: cached snapshot derived from transactions and transfers. We treat balance as a **multi-purpose voucher** (MPV), which is the basis for our VAT reasoning (see [Directive (EU) 2016/1065](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016L1065)).
- **Invoice**: groups outstanding purchases for settlement.
- **Revision**: historical snapshot of product/container/POS configuration.
- **Point of sale (POS)**: where purchases happen (and how permissions/config are scoped).
- **Container**: a group of products of a single seller shown together at a POS (e.g. fridge, bar).

## Next pages

- **[Core Concepts](/general/1-core-concepts)**
- **[Key Workflows](/general/2-key-workflows)**
- **[System Architecture](/general/3-system-architecture)**
- **[External Integrations](/general/4-external-integrations)**
- **[Understanding the Codebase](/general/5-understanding-codebase)**
