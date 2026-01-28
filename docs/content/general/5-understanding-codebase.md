# Understanding the Codebase

This chapter is a map. It points you to the places you need when you are changing behaviour.

**After reading this page, you should know** where controllers/services/entities live, and where money, RBAC, and integrations are implemented.

## File organisation

```
src/
├── controller/          # HTTP routes, RBAC policy, request/response DTOs
├── service/             # Domain logic and orchestration
├── entity/              # Database models (including revisions)
├── middleware/          # Auth/token and request shaping
├── rbac/                # Roles, permissions, enforcement
├── gewis/               # GEWIS-specific integrations
├── subscriber/          # Side effects on data changes
├── notifications/       # Notification routing
├── mailer/              # Email templates and sending
└── start/               # Application startup
```

## Where money logic lives

When money moves, you will most often end up in:
- `src/service/transaction-service.ts` (purchases)
- `src/service/invoice-service.ts` (invoicing)
- `src/service/balance-service.ts` (balance cache and reporting)
- `src/service/stripe-service.ts` (deposit flow and webhook handling)
- `src/service/payout-request-service.ts` (payout requests)

Controllers show the public API surface:
- `src/controller/transaction-controller.ts` (`/transactions`)
- `src/controller/invoice-controller.ts` (`/invoices`)
- `src/controller/stripe-controller.ts` (`/stripe/deposit`)
- `src/controller/stripe-webhook-controller.ts` (`/stripe/webhook`)
- `src/controller/payout-request-controller.ts` (`/payoutrequests`)

## Where RBAC lives

RBAC is enforced in controller policies:
- each controller implements `getPolicy()` and uses `roleManager.can(...)`
- relation (`all/organ/own`) is computed per request, often by loading a resource first

Core RBAC definitions and helpers live in `src/rbac/`.

## Where integrations live

- GEWISDB: `src/gewis/service/gewisdb-sync-service.ts`
- LDAP: `src/service/sync/user/ldap-sync-service.ts`
- Stripe webhook entry point: `src/controller/stripe-webhook-controller.ts`

In development, `src/maintenance.ts` runs maintenance tasks that are normally cron-triggered in production (role sync, balance updates, user sync, etc.).

## Common tasks (practical checklists)

### Add or change an endpoint

- **Controller**: add/adjust a route and its policy in `getPolicy()`.
- **Service**: implement domain behaviour (keep controllers thin).
- **DTOs**: if request/response shapes change, update request/response types.
- **Docs**: add or update Swagger JSDoc on the controller method.
- **Tests**: add controller/service tests as appropriate.

### Add or change a domain rule

- Put the rule in the relevant service.
- Ensure it is covered by a test (ideally a failing test first).
- Update the relevant “concept” in **[Core Concepts](/general/1-core-concepts)** if the rule changes how the system should be understood.

### Change catalogue behaviour (products/containers/POS)

Remember that revisions are immutable. If you need to change what is offered or how it is priced, you likely need a **new revision**, not an update.

## Next step

If you are changing behaviour, keep the relevant General docs in sync.
