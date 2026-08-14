# Invoice PDF migration: from `pdf-generator` to `pdf-compiler`

Tracking issue: [#926](https://github.com/GEWIS/sudosos-backend/issues/926).

This plan covers (a) wiring the **F6c** invoice template in as the definitive template, and (b) using that as the foothold to **delete the entire `pdf-generator` flow** once all 7 PDFs in the issue are migrated. The Invoice migration is its own PR; the `pdf-generator` removal is a follow-up PR that requires the other 6 to land first.

The design has been locked: **F6c** -- two-page invoice (Factuur cover + Line items spec). The English variant. Full reference output lives at `/tmp/invoice-1-variant-f6c.pdf` after running `cli/dev-invoice-variants.ts`; the template itself is in `src/html/invoice.html.ts` (extracted from the variants harness as part of this plan's prework).

---

## 0. Where we are today

| Concern | Current state |
|---|---|
| Invoice PDF endpoint | `GET /v1/invoices/{id}/pdf` -> `Invoice.getOrCreatePdf()` -> `InvoicePdfService.createPdfWithEntity()` -> `pdf-generator-client.generateInvoice(...)` |
| Active services | `BasePdfService` (LaTeX via `pdf-generator-client`, hits `PDF_GEN_URL`); `BaseHtmlPdfService` (HTML via `@gewis/pdf-compiler-ts`, hits `HTML_PDF_GEN_URL`) |
| Already on HTML flow | `TransactionPdfService`, `TransferPdfService`, `InactiveAdministrativeCostReportPdfService` |
| Still on LaTeX flow (this is issue #926's list) | Invoice, PayoutRequest, FineReport, SellerPayout, UserReport (Sales), UserReport (Purchases), WriteOff |
| Prework already done (see section 1) | `src/html/invoice.html.ts` carries the F6c template; `src/files/templates/bac-letterhead.ts` carries the BAC sender constants; `cli/dev-invoice-pdf.ts` exercises the template end-to-end against the seeded DB |
| Selected design direction | **F6c** -- locked. See `cli/dev-invoice-variants.ts` for the original exploration (this file gets deleted as part of section 1) |

---

## 1. PR scope: "Migrate Invoice PDF to pdf-compiler"

The first PR is invoice-only. The aim is to delete `InvoicePdfService` (the LaTeX one) and introduce `InvoiceHtmlPdfService` behind the existing controller endpoint, with no behaviour change visible to API clients beyond the PDF visual style.

### 1.1 What's already done (prework)

Already in place on this branch as untracked files:

- **`src/html/invoice.html.ts`** -- the F6c template as a clean module. Exports `createInvoicePdf(options: IInvoicePdf): string`. Includes the F6c CSS inline (slim band, BTW spec table, line items table, page-break for the spec page). Reads the BAC logo SVG at module load.
- **`src/files/templates/bac-letterhead.ts`** -- the BAC sender constants (name, postbus, street, postal city, country, phone, email, IBAN, VAT, KvK, payment term days). Single source of truth.
- **`cli/dev-invoice-pdf.ts`** -- updated to call the new clean template. Run it against the seeded local DB to produce the canonical F6c output (`/tmp/invoice-1.pdf`). Use this as the visual baseline when reviewing the migration PR.

### 1.2 Write `InvoiceHtmlPdfService`

The data interface (`IInvoicePdf`) and aggregation logic are already in `src/html/invoice.html.ts` and `cli/dev-invoice-pdf.ts` respectively. The new service is mostly plumbing:

```ts
// src/service/pdf/invoice-html-pdf-service.ts
import Invoice from '../../entity/invoices/invoice';
import InvoicePdf from '../../entity/file/invoice-pdf';
import { BaseHtmlPdfService } from './pdf-service';
import { createInvoicePdf, IInvoicePdf } from '../../html/invoice.html';
import InvoiceService from '../invoice-service';
import { InvoiceState } from '../../entity/invoices/invoice-status';
import SubTransactionRow from '../../entity/transactions/sub-transaction-row';
import { BAC } from '../../files/templates/bac-letterhead';

export default class InvoiceHtmlPdfService
  extends BaseHtmlPdfService<InvoicePdf, Invoice, IInvoicePdf> {
  pdfConstructor = InvoicePdf;
  htmlGenerator = createInvoicePdf;

  async getParameters(invoice: Invoice): Promise<IInvoicePdf> {
    // Lift the body of cli/dev-invoice-pdf.ts::main() into this method:
    //  - aggregate per-VAT-band breakdown
    //  - aggregate per-row line items, sorted by sub_transaction_row.id
    //  - compose addressee / address / customerNumber / etc.
    //  - compute dueDate (date + BAC.paymentTermDays days)
    return { /* IInvoicePdf */ };
  }
}
```

Mirrors `TransactionPdfService` so the diff is recognisable.

### 1.3 Switch the entity wiring

- `Invoice.getOrCreatePdf()` currently constructs an `InvoicePdfService`. Swap to `InvoiceHtmlPdfService`.
- The hash function lives on the `InvoicePdf` entity; already-cached PDFs become stale and regenerate on next request -- by design, since the visual contents are changing.

### 1.4 Delete the LaTeX path

- Remove `src/service/pdf/invoice-pdf-service.ts`.
- Audit helpers it imported from `src/helpers/pdf.ts` (`emptyIdentity`, `PDF_VAT_*`, `subTransactionRowToProduct`, `UNUSED_PARAM`):
  - If no other PDF still imports them, delete.
  - Otherwise leave alone; they fall when the last LaTeX PDF migrates.

### 1.5 Delete the design exploration scratch

- Delete `cli/dev-invoice-variants.ts`.
- Delete `cli/dev-invoice-pdf.ts`. The dev harness was useful for design iteration; once the production service is wired up, the real endpoint takes over. If anyone needs to debug locally, they hit `GET /v1/invoices/{id}/pdf` and look at `/tmp` via the file storage or attached test.

### 1.6 Tests

- Replace `test/unit/service/invoice-pdf-service.ts` with `test/unit/service/invoice-html-pdf-service.ts`. Equivalent coverage:
  - Generates a PDF for a normal invoice.
  - Generates one for a deleted invoice (uses `subTransactionRowsDeletedInvoice`).
  - Caching: same invoice yields same hash on second call.
  - Returns the right `pdfId` from `getOrCreatePdf`.
- Add a small content-regression test: render against a fixture invoice, assert that the output contains specific anchor strings (`Total including VAT`, `IBAN NL69 ABNA 062 05 77 770`, the addressee's name).
- `pnpm test` must stay green.

### 1.7 Manual verification

```bash
docker run -d --platform linux/amd64 -p 8001:80 --name sudosos-pdf-compiler \
  abc.docker-registry.gewis.nl/eou/pdf-compiler:latest
rm -f local.sqlite && pnpm run schema && pnpm exec ts-node --transpile-only cli/dev-seed.ts
pnpm run watch
# in a second shell:
curl -s -X POST http://localhost:3000/v1/authentication/local -d '...' # admin login
curl -s http://localhost:3000/v1/invoices/1/pdf -H 'Authorization: Bearer ...' -o /tmp/out.pdf
open /tmp/out.pdf
```

Compare against the F6c baseline (`/tmp/invoice-1-variant-f6c.pdf` from the variants harness, or `/tmp/invoice-1.pdf` from the prework's updated dev harness). Should be byte-identical or very close.

### 1.8 PR title and body

- Branch off `feat/issue-926-migrate-invoice-pdf` (already created from the issue).
- PR title: `Migrate Invoice PDF to pdf-compiler` (sentence case, no `feat:` prefix per the project rules).
- PR body should call out:
  - The visual change vs the old PDF (link to before/after).
  - That cached invoice PDFs will regenerate on next access.
  - That `InvoicePdfService` and the LaTeX-shaped helpers are removed.

---

## 2. Follow-up PRs: migrate the remaining 6

One PR per PDF, same shape as Invoice. Order suggested by dependency footprint (smallest first):

1. **PayoutRequest** -- `PayoutRequestPdfService` -- simplest entity, single line of data.
2. **WriteOff** -- `WriteOffPdfService` -- one user, one amount.
3. **FineReport** -- `FineReportPdfService` -- list of fined users.
4. **SellerPayout (Disbursement)** -- `SellerPayoutPdfService` -- per-seller payout summary.
5. **UserReport (Sales)** -- `UserReportPdfService(UserReportParametersType.Sales)`.
6. **UserReport (Purchases)** -- same class, other variant.

Each PR:
- Adds `src/html/<name>.html.ts` and `src/service/pdf/<name>-html-pdf-service.ts`.
- Swaps the entity's `getOrCreatePdf` wiring.
- Deletes the old LaTeX service.
- Updates / replaces the corresponding test file.

Reviewer hint: when reviewing #2-#7, expect the diff to look almost mechanical -- the interesting design work was in the Invoice PR.

---

## 3. The deletion PR: remove `pdf-generator` entirely

Only land this once #1-#6 of section 2 are merged. **Do not interleave** with the migration PRs -- it makes rollback impossible per migration.

### 3.1 Code deletions

- `src/service/pdf/pdf-service.ts`: delete `BasePdfService` and any LaTeX-specific helpers (`generator()`, `getRouteParams()`, `PdfService`, `Client` import).
- `src/helpers/pdf.ts`: delete `emptyIdentity`, `PDF_VAT_HIGH/LOW/ZERO`, `subTransactionRowToProduct`, `UNUSED_PARAM` (only if no consumer remains; grep first).
- `package.json`: remove `pdf-generator-client` dependency. Run `pnpm install` to update lockfile.
- `src/config.ts`: remove `pdfGeneratorUrl` from `pdf.*` and the `getOptionalString('PDF_GEN_URL')` line.
- `.env.example`: remove the `PDF_GEN_URL` line (keep `HTML_PDF_GEN_URL`).
- `.devcontainer/docker-compose.yml`: no `pdf` service exists there (only `pdf-compiler`), so no change.

### 3.2 K8s / infra

- Delete `k8s/base/pdf/deployment.yaml` and `k8s/base/pdf/service.yaml`.
- Remove the `pdf` reference from `k8s/base/kustomization.yaml` (or whatever rolls those up).
- Coordinate with whoever owns the cluster -- the LaTeX service container can be torn down once the new code is live in prod.

### 3.3 Docs

- `backend/docs/content/general/...` -- if any doc mentions the LaTeX generator, update.
- Update `CLAUDE.md` / `agent-backend.md` if they reference the dual PDF flow.

### 3.4 Tests

- Remove any leftover test fixtures that referenced `PDF_GEN_URL` or `pdf-generator-client`.
- `pnpm test` must stay green; no test should refer to the deleted classes.

### 3.5 Verification before merging

- Spin up a fresh local env without `PDF_GEN_URL` set; generate one of each of the 7 PDFs; confirm all 7 succeed.
- CI green.

---

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Visual diff vs production invoice surprises a stakeholder | F6c was iterated against the BAC team's existing AH-style reference; sign-off should be straightforward but still get it before opening the PR. The before/after sample lives at `/tmp/invoice-1-variant-f6c.pdf`. |
| Cached PDFs persist on disk under the same `pdfId` but with stale content | The hash on `InvoicePdf` is recomputed from the entity's data; `getOrCreatePdf` regenerates on hash mismatch. Verify by reading `Invoice.getOrCreatePdf()`'s hash check and confirming the inputs change enough that hashes differ. |
| `pdf-compiler` container outage in prod | Already a real risk for the migrated PDFs (Transaction, Transfer); this migration doesn't introduce it. Operationally separate. |
| `HTML_PDF_GEN_URL` defaults to `http://pdf-compiler:80/api/v1` -- only correct in k8s | Confirm prod env sets this explicitly. Local dev `.env` should set it to `http://localhost:8001/api/v1` (the host-bound port). |
| 25-row invoices fit on page 2 today, but `cli/seed.ts` invoices produce ~30 rows that might overflow | F6c handles overflow via `page-break-before:avoid` on the total row + tight row padding. Smoke-test against a 50+ row invoice (the heavy seed produces these). |
| BAC letterhead constants drift from reality | Single source of truth in `src/files/templates/bac-letterhead.ts`. If GEWIS moves office or changes IBAN, update there. |

---

## 5. Out of scope (deliberately)

- Multi-language support. F6c is English. A Dutch / mixed variant can come later via a `locale` field on `IInvoicePdf`.
- Per-product category grouping (e.g. AH's "Boodschappen / Verpakkingsmateriaal / Bezorgkosten"). The SudoSOS product model doesn't carry category labels suitable for grouping; out of scope.
- `Pagina X van Y` page numbering on the Line items page. Requires `@page { @bottom-center { content: counter(page) ... } }` plumbing; cosmetic, leave to a follow-up.
- Orange "Uw voordeel ..." discount call-out. We don't have discount data on Invoice.

---

## 6. Effort estimate

| Slice | Engineering effort |
|---|---|
| 1. Invoice migration PR (sections 1.2 - 1.8; prework already done) | ~half a day -- mostly plumbing |
| 2. Each follow-up PDF migration (section 2) | ~2-4 hours each, ~2 days total for all 6 |
| 3. `pdf-generator` removal PR (section 3) | ~half a day, plus infra coordination |
| **Total to "no more LaTeX"** | ~3 working days, spread over 2-3 weeks to let each PR review independently |

---

## 7. Done definition for issue #926

- [ ] All 7 PDFs render via `pdf-compiler`.
- [ ] `pdf-generator-client` is no longer in `package.json`.
- [ ] `PDF_GEN_URL` is no longer referenced in `src/config.ts`, `.env.example`, or any deployed config.
- [ ] `BasePdfService` and its LaTeX-shaped helpers are deleted.
- [ ] The `pdf` k8s deployment is removed.
- [ ] `pnpm test` is green.
- [ ] At least one human invoice (e.g. an internal kitchen invoice like the AH reference) has been rendered end-to-end via the new flow and matches expectations.
