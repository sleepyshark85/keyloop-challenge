# Slice 09 — design, as built

Slice file: [`09-observability.md`](09-observability.md). Gate D folded slices 10 and 11 into it,
`O-59` admitted a sixth inherited obligation, and on 2026-09-08 the human ruled `A-09-4`: **slice 10
reopens** and takes the contract half. What follows is the record after step 7 — arc42 §3.1, §5.2,
§5.3, §8.4, §8.5, §8.6, §10.2 and §11 now carry the architecture, and this file keeps only what is
cited from them, plus the rulings and the debt this slice booked.

*The full step-1 to step-5 reasoning is on PR #20 and in the event log, which is its home (§4).*

## What was designed, and what merged

| Decided | As built |
|---|---|
| **The API facade is free; the SDK is confined.** Spans are emitted where the work happens, because §8.4's window *is* the gap between two span boundaries and a wrapper would place them at one remove. `@opentelemetry/api` is importable anywhere; the SDK, its exporters and its instruments are `src/platform` plus `main.ts` | Shipped, with `otel-sdk-only-in-platform` and **its plant** — a new forbidden rule arrives with one or it does not arrive (§5.3, QS-10) |
| **`booking_conflicts_total` is incremented from exactly one module.** §8.4 fixes *what* increments it; this fixes *where*, because `pg` auto-instrumentation plus a repository span plus a use-case span is how one conflict comes to be counted three times | Shipped. **Restated at step 5**: the step-1 wording said *one increment site*, which the merged code breaks harmlessly at two `.add` expressions in one file; what it protects is that one conflict is counted once. The QS-12 marker anchors on the binding imported from `platform/telemetry` and asserts the file set by equality |
| **Timing and counting are two measurements.** Statement spans make AC-13 and AC-14 mechanical and cost time on the path being timed, so the figures are measured with them off and the `INSERT` count with them on | Shipped |
| **The document is emitted by a callable function**, not only a script — `D-08-1`'s seven `description` mutants are killable from a contract test and still not killed, the mutation config including `tests/unit/**` only | Shipped, and **measured at 88.10 %**, the projection exactly. `D-08-1` closes |
| **`D-07-1` is split**: in, the pool ceiling as one value; out, what a saturated pool *answers* | Shipped, with the remedy **inverted at step 5** — an outside-in test may not import `src/`, so it dictates `DB_POOL_MAX` rather than deriving it |
| **`T-06-5` accepted**: `ResourceLock` carries the `Db` it was taken on | **Not built.** Ruled at step 7 — see `D-09-2` |

**Data-model delta: none.**

## Rulings — mid-slice authority, provisional until the gate

- **AC-5b added** (`R-08-2` named it at slice 08 and it was never written down).
- **One red set as a property, not a count** (`T-09-2`, bounded by `T-09-4`): every criterion whose
  subject this slice *introduces* fails in an observed red run, with a **closed** exclusion — a
  criterion may sit outside only where it asserts a property of already-merged code and is named.
  Exactly one does.
- **AC-12 is a standing guard, not a criterion this slice earns** (`T-09-4`), threshold and fixture
  unchanged. Cost if wrong: QS-14's availability half is asserted by a test only a 22× regression can
  fail — recorded as `D-09-6`.
- **The document is `docs/api/openapi.json`** (`T-09-1`), from `buildOpenApiDocument()`;
  **`tests/performance/**` runs alone** in its own `perf` project and container (`T-09-3`);
  **AC-10's `type` is an error-response word** — a `200` has none.
- **`O-70` is ruled in for diagnosis and out as a test shape.** Bounding racer counts to the runner's
  CPU count is refused: QS-1 fixes *N* = 20 and QS-3 asserts (20,8) and (8,20), so on a two-vCPU
  runner that bound takes *N* to 2 and QS-1's *"the other 19 receive `409`"* stops being asserted.
  §10.2 already bounds in-flight requests by the pool (`R-07-4`); a second, smaller bound un-races
  what the first exists to race. What is owed is that the next occurrence is **diagnosable**.
- **`I-04-5` declined, not deferred** (step 5): the bias's warrant was that AC-13 follows deductively,
  and AC-13 has since been measured passing without it (§11.1).
- **`T-06-5` declined, not deferred** (step 7): `D-09-2`.
- **The slice splits** (step 7, on the human's `A-09-4`): AC-9, AC-10 and AC-11 and the `A-06-2`
  obligation move to [slice 10](10-openapi-and-curl-harness.md); AC-7, AC-8 and AC-5b stay, being
  green, assertable and standing guards over a document that merges here.

## Step 5 — the first `(c)` of the project

**Ruling: (c), design defect. Loopback 1 of 2.** Named, because §6 requires it: **AC-9** and **QS-11**
— the document declares `application/problem+json` on **zero** of its 25 responses while
`problem.ts:76` has sent it since slice 03 — and **AC-6**, *given any request* being false when one
log call in a whole request sits inside a span. Both have a **design** cause: §8.6 never mapped a
`type` to the operations that can produce it, and §8.4 declared a server span *"(auto)"* that decision
1 never gave an instrumentation to. Fifteen findings, three BLOCKING; four adjudication rounds before
it, eight objections and one DISAGREE (`I-09-4`, ruled (b), ADR-0035).

**All three BLOCKING findings sat on the contract half**, which is the evidence Gate D's fold was
wrong and the ground the human reopened slice 10 on. The telemetry half was remediated here and the
contract half was not.

## The debt this slice booked

Each is stated in full in arc42 §11.1, which is where a reader should follow it. Defined here because
that is where a design-local identifier lives (`docs:refs`).

- **`D-09-1` — the contract describes a media type it does not send.** All 25 responses declare
  `application/json`; AC-9's test reads the `type` strings rather than `content[…]`. Slice 10.
- **`D-09-2` — `ResourceLock` still does not carry the `Db` it was taken on.** The design accepted
  the type remedy because `F-06-1`'s extraction made it a one-signature change; the extraction landed
  and the change did not. Declined at step 7 on the test that made it (b) at slice 06 — nothing
  nameable fails without it, and slice 06's negative result still holds: no black-box test observes
  the hole, the exclusion constraint backstopping correctness either way.
- **`D-09-3` — `@opentelemetry/instrumentation-http` does not patch under this entry point.**
  Measured, not assumed: registered in the SDK it left `http.Server.prototype.emit` alone and
  produced no span, `require-in-the-middle` never seeing a native ESM `import`. The fallback the
  step-5 ruling named — *measure it, do not choose in advance* — is what shipped.
- **`D-09-4` — `I-09-7` is resolved on evidence, not disproved.** Three green CI runs against a
  two-of-three local rate; the mechanism stays plausible and unrefuted.
- **`D-09-5` — ADR-0035 is `proposed` and §6(b) has no terminal case.** Its remedy is a `proposed`
  ADR plus a backlog slice, and a project's last slice cannot cut one. A retro item, not a defect
  here.
- **`D-09-6` — QS-14's headroom is the regression baseline**, ≈9 ms against a 200 ms ceiling.

## Assumptions and open questions

- **A-09-1** — `O-70` is runner starvation. Untested; nothing in this design depends on it, and
  `D-09-4` is the same shape one slice later.
- **A-09-2** — the CI container's class is stable enough for a threshold to mean anything between
  runs. The recorded machine class is what would falsify it.
- **OQ-09-1** — `D-07-1` has **no log ref**, so the bidirectional inherited-scope guard cannot see it
  and it travels inside `R-07-12`'s bullet instead. That is the `R-05-2` shape once more, and it is
  the orchestrator's to fix rather than mine.
