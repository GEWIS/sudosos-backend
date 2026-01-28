# Documentation writing checklist

Use this checklist when editing docs in `docs/content/`.

## Style

- Write short sentences in British English.
- Start with facts. Avoid filler (for example: “robust”, “comprehensive”, “this document explains…”).
- Prefer concrete nouns: name the controller/service/entity you mean.
- Use the same term everywhere (e.g. “point of sale”, “transaction”, “transfer”).

## Structure

- Put a one-sentence purpose at the top.
- Add a short “After reading this page…” line.
- One idea per paragraph. Use lists when it scans better.
- Do not repeat “Next steps” boilerplate across pages; link instead.

## Correctness

- If you describe behaviour, tie it to something verifiable:
  - an endpoint (`POST /transactions`)
  - an entity (`Balance`, `Invoice`)
  - a file path (`src/service/transaction-service.ts`)
- If you are not sure, check the code before writing the claim.

## Examples and code

- Avoid template code that does not exist in this repo.
- Prefer links to Swagger/TypeDoc over copying large snippets.
- If an example is needed, keep it small and explain what it proves.

## Diagrams

- Only keep diagrams that add new understanding.
- Prefer one diagram per page, maximum.
- Avoid HTML in Mermaid labels; keep node ids simple.
