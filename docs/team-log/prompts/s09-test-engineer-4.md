# Prompt · slice 09 · test-engineer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 remediation — test-engineer
- Sent: 2026-09-07T21:41:47.140Z

---

# Slice 09 · (c) remediation — the assertions that must exist

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, PR #20. Pull first — the adjudication is at `92d78bb`, its table with an owner per remedy is in `docs/slices/09-design.md` § "Step 5 adjudication". **Read it first.**

The reviewer blocked with fifteen findings; the architect ruled **(c) — design defect**, the first of the project, on AC-9, QS-11 and AC-6 being nameable. It explicitly declined to soften to (a) to protect the loopback counter. Loopbacks are **1 of 2**.

**Scope.** The contract half — AC-9's media type per operation, A-06-2's assertion over the emitted document, the harness binding — is **on hold** pending a human scope ruling (`A-09-4`: the architect recommends reopening slice 10 for it, and says it is not its call). **Do not build those yet.** Everything below is needed either way.

**(c) re-enters at step 1, which licenses a second red commit** — §7 forbids that within one pass and the ruling lifts it. So new outside-in assertions here are committed red first, observed, then made green.

## Your work

**1. AC-6 must be true for a whole request, not one log line (`R-09-6`).** The reviewer's finding: `telemetry.ts:122` is `instrumentations: []` and `server.ts` starts no span, so **no server span exists at all** — the mixin returns `{}` outside an active span, and exactly one log call sits inside a span callback. `booking.conflict`, `booking.refused`, the deadlock line, `server.ts`'s `request.failed` on every 500, and Fastify's own request/response lines all carry **no `trace_id`**. Your current assertion is `withTrace.length >= 1`, which certifies one line out of a request. **Strengthen it to what AC-6 actually says: given any request, its logs are correlated.** The architect ruled §8.4's first row absent rather than untested, so this is a real gap the implementer is filling — your assertion is what makes it stay filled.

**2. The span attributes and ERROR status (`R-09-5`, part).** `booking.attempt`, `bay.id`, `technician.id` and the failed span's ERROR status are asserted by nothing; AC-2 reads only `db.sqlstate` and `db.constraint`. Blank all three attribute names and the retry waterfall — §1.2 goal 4, and this slice's own Definition of Done screenshot — loses which bay and which attempt each bar was, with every test green. One mutant also stamps `db.sqlstate=23P01` on a **foreign-key** failure; that one is a correctness claim, not a label.

**3. Anchor the QS-12 marker to the counter (`R-09-11`).** It currently matches a `.add(…)` call whose text contains the bare identifiers `resource` and `outcome` — a **label spelling**, not the counter. Its own docblock argues the concept must not be "one spelling of it", then recognises exactly two. The reviewer's falsification: a `labels` object in a second file gives two increment sites, every refusal double-counted, and "incremented from exactly one file" still reports length 1. **The architect found a second thing while checking that**: `attemptLoop.ts:185,224` are already **two** `.add` sites in one file — a violation present in the code the control was written to guard, invisible to a file-granular marker. The implementer is collapsing them; your marker must be able to see it if they come back.

**4. `DB_POOL_MAX` (`R-09-10`).** The remedy was **inverted**. `tests/concurrency/refused-move-leaves-original.test.ts:161` declares its own `const POOL_MAX = 10`, and ADR-0013 forbids an outside-in test importing `src/` — so the test cannot derive the ceiling. **It dictates it instead**, via `DB_POOL_MAX`. The implementer is adding the env var; you set it and drop the duplicated literal.

## Discipline

- Your directories only — `tests/acceptance|contract|property|concurrency|performance|architecture/` and database-invariant `tests/integration/`. **`tests/unit/` and `src/` are the implementer's**, working in parallel.
- Commit red first for anything new and outside-in, observed, then green. `test(09):`, **explicit pathspecs**.
- `npm run test:tools` must stay green.

## Return

The structured report, plus: whether AC-6 as you can now assert it actually covers "any request" or only the paths you could reach, and anything in the adjudication table you disagree with. You objected three times at step 2 and all three were agreed — the same standard applies here.
