# Prompt · slice 08 · test-engineer · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Unname the actor in contract tests
- Sent: 2026-09-07T14:07:00.931Z

---

# Unname the actor in `tests/contract/` — 3 comment lines

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `chore/adr-readability` (checked out, clean). Pull first.

## Why

The human audited the requirements trace and found `Requirements.md` says *"Allow **a user** to request a service appointment"* — it never says "service advisor". That term was our interpretation, recorded as Gate A's OQ-2 and ruled by ADR-0002. The human has now withdrawn the reading: *"directly mention a service advisor in the ADRs as an actor for the system is limiting."*

**ADR-0034 supersedes ADR-0002**: the caller is *a user*, the system does not name the human behind it, and authentication stays out of scope on the argument ADR-0002 already contained — a credential check in front of a stubbed client is a mechanism no test can exercise, which holds whoever is holding the phone. `customer_id`-in-body and ownership-as-validation are **unchanged**.

arc42, the ADRs and the slice designs are done. What remains is prose quoting arc42 §8.6's justification for its `500` row, which propagated verbatim into test comments. §8.6 now says *"the caller"*; these still say *"a service advisor"*.

## Your three lines

`tests/contract/` is yours under §5.

```
tests/contract/error-taxonomy.test.ts:224
tests/contract/error-taxonomy.test.ts:403
tests/contract/error-taxonomy.test.ts:532
```

Line 532 is the sharpest case: it **quotes §8.6 explicitly** — *"§8.6 justifies its `500` row with …"* — so it is a quotation that no longer matches its source. Read §8.6's current wording and make the quote true again.

## Boundaries

- **Comments only. No assertions, no test names, no fixtures.** If neutralising a comment would require changing what a test asserts, stop and report it — that would mean the assertion depended on the role, which is a finding rather than an edit.
- Do not touch `tests/unit/` or `src/` — seven lines there are the implementer's and are being done in parallel.
- Do not touch `docs/`.
- **The word "advisory" is unrelated** — advisory locks, advisory reads, the advisory availability query. Leave every one alone. Match `advisor` only where it names a person.

## Verify and land

`npx vitest run --project nodb` must stay green; nothing here should be able to change it, which is the point.

Commit `docs(adr):` or `test(08):` as fits — comment-only, no behaviour change. **Explicit pathspecs, never `git add -A`.** Push. No PR — #19 is open and this lands in it.

Return the structured report, and say whether any comment resisted neutralising.

One thing worth your eye while you are in there: nothing in this project checks a code comment against the prose it quotes, which is why §8.6's wording propagated into eight files unnoticed. If you can see a cheap check for that, name it — do not build it here.
