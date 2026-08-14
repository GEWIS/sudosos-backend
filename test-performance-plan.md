# SudoSOS Backend Test Suite — Speed Analysis & Action Plan

**Baseline:** 6m 29s total (vitest run, 104 files, 2,444 tests). Setup time alone is 74s; tests 271s.

---

## Root Causes (Why the suite is slow)

### #1 — Cross-test imports re-register `describe` blocks

The biggest oddity in the test output: tests like `AuthenticationService > Hash Authentication > should set and verify a user local password (721ms)` appear in the slow-test report of **6 different test files**, and `InvoiceService > createInvoice function > should create Invoice...` appears in **3 files**. This isn't a reporter quirk — those tests actually run that many times.

The cause: test files import small helpers from other test files. Because the imported test file has top-level `describe()` calls, vitest registers and runs every test in it inside the importer's file as well.

| Importer | Imports from | What it imports |
|---|---|---|
| `test/unit/controller/authentication-controller.ts:40` | `../service/authentication-service` | `userIsAsExpected` |
| `test/unit/gewis/controller/gewis-authentication-controller.ts:41` | `../../service/authentication-service` | `userIsAsExpected` |
| `test/unit/gewis/gewis.ts:33` | `../service/authentication-service` | `userIsAsExpected` |
| `test/unit/service/ad-service.ts:33` | `./authentication-service` | `userIsAsExpected` |
| `test/unit/service/transaction-service.ts:49` | `./invoice-service` | `createInvoiceWithTransfers` |
| `test/unit/service/invoice-pdf-service.ts:41` | `./invoice-service` | `createInvoiceWithTransfers` |

Each of the imported files contains heavy `beforeAll` blocks that seed the DB. So the `authentication-service.ts` 12.6s suite effectively runs 5 times (≈63s consumed). Similarly, the `invoice-service.ts` setup runs 3 times.

**Cumulative waste: ~50–60 seconds.**

### #2 — Bcrypt at 12 rounds for every seeded user

`test/seed/user-seeder.ts:126` hardcodes `private BCRYPT_ROUNDS = 12` — production strength — for test data seeding. The dev-seed path right below uses 4 rounds, but the unit-test path uses 12.

`seedDatabase()` calls `seedHashAuthenticator` **twice, sequentially** (`test/seed/all.ts:101–102`) — once for `PinAuthenticator`, once for `LocalAuthenticator`. With ~20 users hashed twice at 12 rounds ≈ 150 ms/hash -> **~6s per test file that calls `seedDatabase()`**.

Bonus bug in `user-seeder.ts:143`:
```ts
const toMap: User[] = count >= users.length ? users : users.slice(count);
```
The intent is "hash the first `count` users", but `slice(count)` actually drops the first `count` users and hashes the rest. Doubles the work for no reason.

Also, `process.env.BCRYPT_ROUNDS` is **never set in `test/setup.ts`**, so `AuthenticationService` itself defaults to 12 rounds for any test that hashes through the service.

### #3 — Kitchen-sink `seedDatabase()` for tests that need a slice of the data

`test/seed/all.ts:95–150` runs **~20 seeders sequentially**, producing 30 users, 96+ products with revisions, containers, POS revisions, events, transactions, transfers, fines, inactive admin costs, payout requests, invoices, stripe deposits, write-offs, banners, QR authenticators, and notification preferences — even when the test only needs users + transactions.

5 test files call the full `seedDatabase()`: `transaction-controller.ts`, `user-controller.ts`, `gewis.ts`, `authentication-service.ts`, `pos-token-flow.ts`. Each pays the full ~12s tax.

### #4 — `transfer-subscriber.ts` uses `nrMultiplier=10` for 3 trivial tests

`test/unit/subscribe/transfer-subscriber.ts:53`:
```ts
await new TransactionSeeder().seed(users, undefined, new Date('2020-02-12'), new Date('2021-11-30'), 10);
```
The `10` is `nrMultiplier`. `transaction-seeder.ts:195` multiplies transaction count by it — so this file creates 10× the transactions just to run 3 short assertions. **Result: 13s for 3 tests = 4.3s/test.**

### #5 — Per-file fork startup tax

Vitest config: `pool: 'forks'`, `fileParallelism: false`, `singleFork: false`. That spawns **a fresh fork for each of the 104 test files**. Each fork:
- Loads `setup.ts`
- Generates a 2048-bit RSA keypair (`setup.ts:75–94`) — ~200–500ms
- Runs TypeORM `synchronize: true` over 219 entities — ~100–300ms
- Loads chai/sinon plugins

`setup 74.14s` ≈ 104 forks × ~700ms.

### #6 — Sequential seeder execution

`seedDatabase()` `await`s every seeder in sequence even though many are independent (products/categories/VAT can run in parallel; banners, notifications, QR authenticators, deposits, write-offs all run after user creation but don't depend on each other).

---

## Action Plan (Ordered by Impact)

| # | Action | Est. Saving | Effort | Risk |
|---|---|---|---|---|
| 1 | Move shared test helpers out of test files (fix cross-test imports) | ~60s | Low | None |
| 2 | Lower bcrypt rounds + fix the slice bug + parallelize PIN/Local hashing | ~30s | Low | None |
| 3 | Reduce `transfer-subscriber.ts` `nrMultiplier` to 1–2 | ~10s | Trivial | None |
| 4 | Switch fork strategy to `singleFork: true` (or cache JWT key) | ~50s | Trivial | Medium (test pollution) |
| 5 | Make `seedDatabase()` modular — let tests opt in | ~40s | Med-High | Low |
| 6 | Parallelize independent seeders in `seedDatabase()` | ~5–10s | Low | Low |

**Conservative total: ~150–200s saved.** Realistic target: **6m 29s -> ~3m 30s (~45% faster)**.

---

### Action 1 — Stop importing helpers from test files (~60s saved)

Move the helpers to `test/helpers/` (already excluded from vitest's `include` glob):

- `userIsAsExpected` — currently in `test/unit/service/authentication-service.ts:48`. Move to `test/helpers/authentication-helpers.ts`.
- `createInvoiceWithTransfers` — currently in `test/unit/service/invoice-service.ts:69`. Move to `test/helpers/invoice-helpers.ts`.
- Update the 6 importers listed in the table above.

**Verification:** after the change, the slow-tests blocks for `AuthenticationService > Hash Authentication` and `InvoiceService > createInvoice` should each appear in **exactly one** file's output, not 5–6.

### Action 2 — Lower bcrypt rounds & fix the seeder (~30s saved)

In `test/seed/user-seeder.ts:126`:
```ts
private BCRYPT_ROUNDS = 4;  // was 12
```

Fix the slice bug in `test/seed/user-seeder.ts:143`:
```ts
const toMap: User[] = count >= users.length ? users : users.slice(0, count);
```

Parallelize the two hash batches in `test/seed/all.ts:101–102`:
```ts
const [pinUsers, localUsers] = await Promise.all([
  new UserSeeder().seedHashAuthenticator(users, PinAuthenticator),
  new UserSeeder().seedHashAuthenticator(users, LocalAuthenticator),
]);
```

Force test-mode rounds in `test/setup.ts`:
```ts
if (!process.env.BCRYPT_ROUNDS) process.env.BCRYPT_ROUNDS = '4';
if (!process.env.BCRYPT_ROUNDS_PIN) process.env.BCRYPT_ROUNDS_PIN = '1';
```

### Action 3 — Fix `transfer-subscriber.ts` (~10s saved)

Change `test/unit/subscribe/transfer-subscriber.ts:53` from `..., 10)` to `..., 1)`.

### Action 4 — Reuse the test fork (~50s saved)

Switch `vitest.config.js.mts:25` to `singleFork: true`. Verify no test pollution by running suite 3×.

Safer fallback: keep `singleFork: false` but cache the JWT key path with a stable name across forks (~15–20s saved, no pollution risk).

### Action 5 — Modular seeding (~40s saved)

Replace `seedDatabase()` with a builder so callers pick what they need (`gewis.ts`, `transaction-controller.ts`, `user-controller.ts` need only a subset).

### Action 6 — Parallelize independent seeders (~5–10s saved)

In `test/seed/all.ts`, `Promise.all` independent seeders (banners, QR auth, notifications, write-offs, deposits, payouts, etc.).

---

## Suggested Implementation Order

1. **Day 1 PR — Quick wins (Actions 1, 2, 3):** ~100s saved, zero risk.
2. **Day 2 PR — Fork reuse (Action 4):** ~50s if no flakes.
3. **Follow-up PR — Modular seeding (Action 5):** ~40s.
4. **Polish PR — Parallel seeders (Action 6):** ~5–10s.

Total realistic outcome: **6m 29s -> ~3m**.
