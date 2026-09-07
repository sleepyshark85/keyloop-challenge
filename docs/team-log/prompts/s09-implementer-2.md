# Prompt · slice 09 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 4 green
- Sent: 2026-09-07T19:18:17.253Z

---

# Slice 09 · step 4 — GREEN. Make seventeen criteria pass, small commits, each one green.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, **PR #20 open**. Pull first — the red is at `46729f3` and the `perf` project plumbing at `82139ef`.

Read `docs/slices/09-design.md` and `docs/slices/09-observability.md` as amended at step 2, then the red tests. **This is the last slice in the project**; nothing after it absorbs what you leave.

## What the red commit expects of you

`red-proof` confirmed six files red with **no unit test failing**: `tests/architecture/ambiguity-containment.test.ts`, `tests/architecture/layering.test.ts`, `tests/acceptance/empty-body-content-type.test.ts`, `tests/acceptance/harness.test.ts`, `tests/contract/openapi-document.test.ts`, `tests/integration/telemetry-booking.test.ts`. Plus `tests/performance/availability-budget.test.ts`, which CI had not exercised at that commit — it does now.

**The test-engineer defined three interfaces that did not exist**, each documented in its file's header as an assumption that fails loudly rather than silently. Read those headers before you build against them, and **object if one is wrong** rather than contorting the implementation to match:
- the OTLP wire contract, in `tests/support/otelCollector.ts` — measured against `@opentelemetry/exporter-trace-otlp-http@0.222.0`;
- `npm run docs:openapi -- --check`'s flag shape;
- `harness/`'s two script names and their environment variables.

## Your work, and your own step-2 verifications are the spec

You verified four of these empirically at step 2. Build what you measured:

1. **The OTel SDK confined to `src/platform`** — you proved the `dependency-cruiser` rule fires on a planted import and reports nothing when the rule is removed. The architect deliberately did **not** mint an ADR: it arrives as a rule with its QS-10 plant or it does not arrive. The rule lives in the ruleset table at arc42 §5.3.
2. **Spans** — the candidate read and the insert as separate spans. You established context flows by `AsyncLocalStorage`, so no forbidden import edge is needed; note the Node SDK's `AsyncLocalStorageContextManager` must be registered in `src/platform`.
3. **`booking_conflicts_total{resource}`** — you read both application files and confirmed the increment site is genuinely two today, one arm each in `bookAppointment` and `rescheduleAppointment`, and becomes one after **F-06-1's extraction into a shared parameterised attempt loop** (parameterised, not lifted: reschedule tries the incumbent pair first per ADR-0027). The QS-12 marker asserts the single site.
4. **`POOL_MAX`** — `createPool` passes no `max` at all and relies on `pg`'s default of 10. Name it explicitly beside `CONNECTION_TIMEOUT_MS`. That is `D-07-1`'s in-half; **what a saturated pool answers is out of scope** and stays out.
5. **`buildOpenApiDocument()` + `npm run docs:openapi`**, emitting to **`docs/api/openapi.json`** — the path ADR-0005 already names, ruled at `T-09-1`. AC-7 diffs the committed file byte for byte.

## The mutation number, which is yours to land honestly

You measured that the architect's 37/42 used a mechanism `@fastify/swagger` does not have — a querystring object's `description` is dropped when Fastify explodes it into `in: query` parameters. The design now records **34/42 = 80.95 % as the floor** and **37/42 = 88.1 % with the relocation** to an operation-level `schema.description`, and says the mechanism is measured while the figure is a projection.

**Do the relocation you proposed**, and when you are done, **measure rather than project**. If it lands at 34/42, say so — slice 08 merged at 71.43 % under a human override given on the understanding this slice repays it, so the number matters and a claimed one is worthless.

## Discipline

- `src/` and `tests/unit/` are yours. **Do not touch** `tests/acceptance|contract|property|concurrency|performance|architecture/` — if a red test is wrong, raise a DCR (§6); do not edit it.
- **Every commit green**, small, Conventional, `(09)`. §7: over ~150 lines it should probably have been two.
- The design notes the empty-body `400` is pinned at `tests/unit/http/appointments.test.ts:381` — that moves at green, and it is yours.
- **Explicit pathspecs, never `git add -A`.**
- Post one PR comment on #20 when done, `**implementer · step 4 — GREEN**`, ~150 words, short and self-contained: one italic framing line, a gloss at every reference, the measured mutation figure, and anything you objected to. Cut narration.

## Return

The structured report, the **measured** per-file mutation score for `src/http/routes/availability.ts`, and any interface the test-engineer defined that you had to work around rather than build to.
