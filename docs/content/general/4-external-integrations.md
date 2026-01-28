# External Integrations

SudoSOS is not a closed system. It depends on GEWIS infrastructure for identity and structure, and on Stripe for payments.

**After reading this page, you should know** which system is the source of truth for which data, where the integration code lives, and how to debug typical failures.

## System context

The system-level diagram lives in **[System Architecture](/general/3-system-architecture)**. This page focuses on what each integration does and how to debug it.

## GEWISDB (members and membership data)

- **Source of truth**: GEWIS member database.
- **What we sync**: member identity and lifecycle (active/expired), plus fields used by SudoSOS.
- **Where the code lives**: `src/gewis/service/gewisdb-sync-service.ts`
- **How it runs**: through the user sync manager; in development, `src/maintenance.ts` runs the same tasks that are typically cron-triggered.

**Debugging**
- Check the configured API URL/key.
- Check logs for sync decisions (users created/updated/deactivated).
- Verify that the synced user type matches the expected use (member vs local user, etc.).

## LDAP/AD (organs, groups, roles)

- **Source of truth**: GEWIS LDAP / Active Directory groups.
- **What we sync**: organ accounts and role assignments based on group membership.
- **Where the code lives**: `src/service/sync/user/ldap-sync-service.ts`
- **How it runs**: enabled via environment config (`ENABLE_LDAP=true`) and run by the sync manager (see `src/maintenance.ts` for development).

**Debugging**
- Confirm LDAP connectivity and bind credentials.
- Verify the group-to-role mapping (unexpected permissions are usually a group membership issue).

## Stripe (deposits)

Stripe is used for top-ups. The backend owns the rules around allowed amounts and the effect on the ledger.

- **Source of truth**: Stripe for payment state; SudoSOS for the resulting transfers/balance.
- **Deposit entry point**: `POST /stripe/deposit` (`src/controller/stripe-controller.ts`)
- **Webhook receiver**: `POST /stripe/webhook` (`src/controller/stripe-webhook-controller.ts`)
- **Public key**: `GET /stripe/public`

**Debugging**
- If deposits do not complete: check whether webhook events reach the backend and whether signature verification succeeds.
- If events are ignored: check that Stripe events carry metadata for this service (the backend ignores events not meant for it).
- If a deposit is applied twice: check idempotency/duplicate delivery handling in the Stripe service.

## Mail (notifications and receipts)

Mail is used for user-facing notifications (receipts, debt notifications, invoice emails, etc.).

- **Where the code lives**: `src/mailer/` and `src/notifications/`
- **Typical triggers**: subscribers after transactions/transfers, and scheduled tasks.

**Debugging**
- Check the configured mail transport.
- Check whether the event that should trigger mail actually occurred (e.g. a transaction persisted).
- Check notification preferences if a user is not receiving mail.

## Configuration

Do not embed secrets in documentation. Configuration is done via environment variables; use `.env.example` as the canonical list and document behaviour (not values).

## Next pages

- **[Understanding the Codebase](/general/5-understanding-codebase)**
