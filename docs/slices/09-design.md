# Slice 09 — design

Slice file: [`09-observability.md`](09-observability.md). Gate D folded slices 10 and 11 into it and
`O-59` admitted a sixth inherited obligation. arc42 §3.1, §5.3, §8.4, §8.6, §10.2 and §11.1 are
*proposed* here and edited at step 7.

*Sections above step 5 were compressed to pay for it under `docs:budget`; the full step-1 to step-4
reasoning is on PR #20 and in the event log, which is its home (§4).*
## One slice — argued at step 1, falsified at step 5

`A-06-4` declined a split on evidence that *telemetry · contract · budget* are not independent, and
three couplings turned up writing this design: AC-13 and AC-14 are assertions over statement spans;
`F-06-1` makes the counter's one-site rule checkable; `A-06-2` is asserted over the emitted document.
Each is true, and **none survived the review** — they bind the telemetry half to itself, not to the
contract half. See step 5.
## Building blocks

| Block | Delta |
|---|---|
| `src/platform/telemetry.ts` *(new)* | The OTel SDK, its exporters, its **instrumentations** (finding 6) and §8.4's instruments. A leaf |
| `src/platform/logger.ts` | `pino` binds `trace_id` / `span_id` from the active context |
| `src/application/` | The extracted attempt loop (`F-06-1`), carrying `appointment.insert` / `appointment.update` and the one conflict increment |
| `src/persistence/db.ts`, `config.ts` | The pool ceiling becomes one value, read from `DB_POOL_MAX` (`R-07-12`, finding 10) |
| `src/http/server.ts` | The document is emitted by a **callable function**, not only by a script |
| `src/main.ts` | Starts and shuts the SDK down; the only module that may see it |
| `.dependency-cruiser.js` | `otel-sdk-only-in-platform`, with QS-10's plant for it |
| `docs/api/openapi.json`, `harness/` | The committed document, from `buildOpenApiDocument()` via `npm run docs:openapi` (`T-09-1`), and the cURL scripts |
| `vitest.config.ts`, `tools/ci/run-tests.mjs` | A third `perf` project, run alone (`T-09-3`) — test-engineer's files, specified here |

**Data-model delta: none.**

## Decisions

**1 — The API facade is free; the SDK is confined.** Spans are emitted where the work happens, because
§8.4's window *is* the gap between two span boundaries and a wrapper would place them at one remove.
`@opentelemetry/api` is importable by `src/application` and `src/persistence`; the SDK, its exporters
and its instruments are `src/platform` plus `src/main.ts`, on the shape
`http-framework-only-in-the-edge` already uses. **A new forbidden rule arrives with its plant or it
does not arrive** — QS-10's claim is that the rules *fire*, and a fifth confinement asserted by
nothing weakens the four that are.

**2 — `booking_conflicts_total` is incremented from exactly one module.** §8.4 fixes *what*
increments it — SQLSTATE `23P01`, never a status code; this fixes *where*. `pg` auto-instrumentation,
plus a hand-written span in the repository, plus one in the use case is how a conflict comes to be
counted twice, and `dependency-cruiser` is per file and cannot see it. The control is a QS-12 marker,
the shape already used for `contended-resource-cast`. *Restated at step 5 (finding 11): the step-1
wording said "one increment site", which the merged code breaks harmlessly and the marker could not
see either way.*

**3 — Timing and counting are two measurements.** Statement spans make AC-13 and AC-14 mechanical and
cost time on the path being timed. The *figures* are measured with them off; the `INSERT` count and
the N+1 assertion are a second run with them on. Conflated, the budget measures its own instrument.

**4 — The document is emitted by a function**, not only by a script. Why, below.

**5 — `D-07-1` is split.** In: the pool ceiling as one value — *at step 5 (finding 10), one the test
dictates rather than restates*. Out: what a saturated pool *answers*, a `503` being a new row in a
closed taxonomy (ADR-0024) that QS-11 requires reached end to end. §11 keeps it with that reason.

**6 — `T-06-5` accepted.** `ResourceLock` carries the `Db` it was taken on, so a write cannot be
issued on a different handle. Slice 06 declined it as (b) and was right to; the price has fallen,
because after `F-06-1` the signature changes once rather than twice.

## AC-7 does not kill the seven `description` mutants

`D-08-1` books them as *unobservable until slice 09 emits the document*, but the mutation config
includes `tests/unit/**` only (§11 R-12), so a contract-test assertion leaves them **killable and
still not killed** — hence decision 4, and hence relocating the prose to an operation-level
`schema.description` once `I-09-1` falsified the first projection on a live harness. **Measured at
step 4: 88.10 %, the projection exactly. `D-08-1` closes.**
## What makes QS-14 assertable rather than aspirational

A budget is a threshold, so what it measures is pinned before anyone measures it. **Boundary:** the
HTTP request end to end — measuring the use case hides pool acquisition, `D-07-1`'s subject.
**Serially**, or the figure describes the pool. **Exclusively**: `tests/performance/**` takes its own
`perf` project, invocation and container (`T-09-3`) — *uncontended* is a property of the runner too.
**Warm**, a stated warm-up discarded. **p95 nearest-rank over 100 samples.** **A seeded fixture and
the machine class recorded beside the figure** — CPU count, memory, image, PostgreSQL version, also
`O-70`'s missing datum.
## O-70 — ruled in for diagnosis, out as a test shape

Bounding racer counts to the runner's CPU count is **refused**: QS-1 fixes *N* = 20 and QS-3 asserts
(20,8) and (8,20), so on a two-vCPU runner that bound takes *N* to 2 and QS-1's *"the other 19 receive
`409`"* stops being asserted. §10.2 already bounds in-flight requests by the connection pool
(`R-07-4`), and a second, smaller bound un-races what the first exists to race. What the slice owes is
that the next occurrence is **diagnosable**: `db.sqlstate` on the failed insert's span and the machine
class beside every budget run. `A-09-1` records *almost certainly* as an assumption.
## No ADR

Every decision above implements one already taken: vendor confinement is ADR-0008, *what* increments
the counter is §8.4, generating the document from route schemas is ADR-0005, and free-first ordering
is a `proposed` decision the human moved into `08-design.md` — where step 5 rules it. Decision 1 is
the one I would have minted a week ago; under the 2026-09-07 bar it is a rule, not a decision.
## Rulings — mid-slice authority, provisional until the gate

- **AC-5b added: seventeen criteria, not sixteen.** `R-08-2` named it at slice 08 and it was never
  written down. Cost if wrong: the largest slice grows again.
- **One red commit, one observed red run, and the file set is a *property* rather than a count**
  (`T-09-2`, bounded by `T-09-4`): every criterion and control whose subject this slice *introduces*
  fails in that run — sixteen of seventeen plus both controls, AC-12 excepted and named. **The
  exclusion is closed**: a criterion may sit outside the red set only where it asserts a property of
  already-merged code, and only where it is named. Exactly one does.
- **The document is `docs/api/openapi.json`** (`T-09-1`) — ADR-0005's path — emitted by
  `buildOpenApiDocument()`, written by `npm run docs:openapi`.
- **`tests/performance/**` runs alone** (`T-09-3`): its own project, invocation and container.
- **AC-12 is a standing guard, not a criterion this slice earns** (`T-09-4`); threshold and fixture
  unchanged, §11 recording the headroom as the regression baseline. Cost if wrong: QS-14's
  availability half is asserted by a test only a 22× regression can fail.
- **`D-07-1` split** (decision 5); **`T-06-5` accepted** (decision 6); **AC-10's `type` is an
  error-response word** (step 5, finding 7).
## Steps 2–4 adjudication — eight objections, eight AGREEs, no loopback spent

**The reasoning is on PR #20 and in the event log, which is where an argument lives (§4).** Four of
the eight changed this design and are recorded where they landed: `T-09-3` moved exclusivity from
`fileParallelism` to a third `perf` project with its own container, and **refused** the §11
alternative — a machine class cannot tell a contended run from a clean one on the same class;
`T-09-4` reclassified AC-12 as a standing guard and **refused all three offered remedies**, each of
which bought a red by making AC-12 describe something else, *the false claim having been mine rather
than the test's*; `I-09-2` was agreed with the remedy **changed** — the fixture, not the seed;
`I-09-4` is the one **DISAGREE**, ruled (b), because §8.4 fixes the counter's trigger and never its
arity — ADR-0035, `proposed`. The other four (`I-09-1`, `T-09-1`, `T-09-2`, `I-09-3`) were agreed
with their remedies taken and left no standing design content.

Each was (a) or (b) on one test: (c) loops back to step 1 and supersedes an ADR at fault, and in none
of the eight was an ADR at fault or prior work wrong. **Step 5 is where that stops being true.**
## Step 5 adjudication — fifteen findings, and the first (c)

**Ruling: (c), design defect. Loopback 1 of 2.** Named, because §6 requires it: **AC-9** and
**QS-11** — the document declares `application/problem+json` on **zero** of its 25 responses while
`problem.ts:76` has sent it since slice 03, and QS-11 says *"as `application/problem+json`"* and
asserts the emitted document. And **AC-6** — *given any request* is false when one log call in a whole
request sits inside a span. Both have a **design** cause, not only a coding one: §8.6 never mapped a
`type` to the operations that can produce it, and §8.4 declares a server span *"(auto)"* that decision
1 never gave an instrumentation to. That is what (c) is for, and I decline to reach for (a) to protect
a counter I have already three times declined to spend.

| # | Verdict | Remedy — and who builds it |
|---|---|---|
| **1** | **AGREE**, both halves, verified | Error responses declared with explicit `content: application/problem+json`; **§8.6 gains a `type` × operation matrix** and each route declares only its own, so `GET /availability` stops claiming `vehicle-not-owned`. The test reads `content[…].schema` and asserts each operation's set **by equality** — deleting a `422` must fail. *Implementer (`src/http`); test-engineer* |
| **2** | **AGREE** the finding; **DISAGREE** it is separately nameable | A-06-2 is an assumption and no AC or QS asserts it, so alone §6 makes it (b) — and (b)'s backlog slice does not exist. It rides finding 1's (c): **the assertion is built, not the claim softened.** No `requestBody` schema carries an appointment id under any name; the only id `parameters` are path ids on the three operations addressing an appointment that already exists. The `appointmentId`-on-`BookingBody` falsification is the red. *Test-engineer* |
| **3** | **AGREE** finding and classification; **no §10 override** | Read the report, not the summary; the survivors are killable and I decline to argue slice 08's case twice. `server.ts`: AC-7 reads the seven `OPENAPI_INFO`/`openapi` literals byte for byte outside Stryker's scope and `tests/unit/http/availability.test.ts` **already calls** `buildOpenApiDocument()` — asserting `doc.info`/`doc.openapi` there gives 57/72, and deleting finding 14's dead branch **0.80**. `telemetry.ts`: a unit test registering a real in-memory `MeterProvider` **before the first `.add()`** and reading §8.4's table back kills ~25 of 34 — the executable form of the docblock's own laziness measurement, prose today. `attemptLoop.ts`: an in-memory span exporter plus that meter kills the 3 attribute names, the 14 classification/`db.sqlstate` mutants, the `ERROR` status, `span.end()`, both increment sites and the success line — **+38 → 0.89**. Left standing and **named**: the strategy arm, L189/L288's structural bound (the reviewer's own arithmetic) and `server.ts`'s eleven `unreachable()` mutants. *Implementer, `tests/unit/`* |
| **4** | **AGREE** | Folded into 3: a unit test calls the loop directly and drives the capped exit against a real meter. The cap stays 16 and **no fixture is widened**. *Implementer* |
| **5** | **AGREE** | Same test asserts `booking.attempt`, `bay.id`, `technician.id`, the `ERROR` status and sqlstate-per-classification by name; the foreign-key mutant dies with them. §1.2 goal 4's own screenshot, unasserted. *Implementer* |
| **6** | **AGREE**, and the cause is mine | `instrumentations: []` makes the server span **absent**, not untested. Register `@opentelemetry/instrumentation-http` in `startTelemetry()` — the only mechanism that opens the span before Fastify writes its own request line, which is what makes AC-6 say *any*. If its dependency surface proves unacceptable the fallback is an `onRequest`/`onResponse` span in `src/http` and AC-6 narrows to application lines: **measure it, do not choose in advance.** *Implementer; test-engineer asserts `trace_id` on `booking.conflict`, `booking.refused` and Fastify's own lines* |
| **7** | **AGREE**; two remedies, one an **AC ruling** | (i) The harness checks each response's status against the status that operation must answer, failing on the first mismatch. (ii) **AC-10's `type` is an error-response word** — a `200` `AppointmentView` has none, and printing its domain status labelled `type=` is a false label, not a missing one. AC-10 reads: *each response's HTTP status, and its `type` where the response is a problem document.* Cost if wrong: one field fewer than the gate expected. *Implementer (`harness/`); test-engineer binds each status to its operation* |
| **8** | **AGREE** on `I-04-5`; **DISAGREE** on ADR-0035 | **`I-04-5` — ruled here, and the answer is no.** The bias's whole warrant was *"AC-13 then follows deductively"*; AC-13 has since been **measured** and passes without it. A premise replaced by a measurement does not carry an optimisation onto the booking path on the last slice of a project whose scope says *goal 3 beats goal 5*. **Declined, not deferred**, in `08-design.md` where the human put it, with the figure that retired it; §11 gains the row and `9d2daf5`'s deleted sentence returns shorter. **ADR-0035 is ruled, and `proposed` *is* the ruling** — raised at step 4, ruled (b), whose remedy is exactly a `proposed` ADR plus a backlog slice. The ADR exists and the register carries it; the missing slice is **§6(b) having no terminal case**, not a defect here. *Architect* |
| **9** | **AGREE** — one finding with 6 | §8.4 declares four things `src/` never emits. **Implement** `booking_attempts` at the shared loop's exit (its §8.4 note calls the tail §11 R-1's answer, and `F-06-1` has already made one place to record it) and `appointment.cancel`, one `startActiveSpan`. **Delete from §8.4** `availability_query_duration_seconds` — QS-14 measures it and §11 now carries the figure, so a second home is a duplicate — and `booking.validate`, whose attributes the insert span's parent covers. *Implementer for `src/`; the §8.4 edit is mine and is deletion-net on a section over budget* |
| **10** | **AGREE**; the remedy runs the **other way** | The test cannot derive the ceiling — `outside-in-tests-do-not-import-src`, and `tests/support/service.ts` spawns the built server. So it **dictates** it: `config.ts` reads `DB_POOL_MAX` (default 10), the spawn helper sets it, the test asserts the value it set. Raising the default cannot then make the comment lie. *Implementer; test-engineer* |
| **11** | **AGREE**, and decision 2 is **restated** | Checking the falsification found a second thing: the merged code has **two `.add` sites in one file** (`attemptLoop.ts:185,224`), which decision 2's words forbid and its file-granular control could never see. What it protects is that one conflict is counted once, not that one call expression exists. **Restated: incremented from exactly one module, at most once per attempt loop.** The marker anchors on the **binding imported from `platform/telemetry.js`**, not on label spellings, and asserts `{src/application/attemptLoop.ts}` by equality — the containment its docblock declined because `F-06-1`'s filename was unpinned at step 1. It is pinned now. *Test-engineer* |
| **12** | **AGREE** | `date -u -d` becomes `node -e`; `npm run harness:seed` and the ids it prints land in `package.json` and the README run section, which AC-11's *without the test suite* names. *Implementer; scribe* |
| **13** | **AGREE** | The description states the rule — `to` at or after `from`, a violation is `400 /problems/malformed-request` — and drops TypeBox and the schema. The three literals stay killable. *Implementer* |
| **14** | **AGREE**, remedy verbatim: **delete**. Removing a mutant beats testing unreachable code | *Implementer* |
| **15** | **AGREE**, and nothing is remediable | History is not rewritten to make a rule look kept. **Recorded: §7's every-implementer-commit-is-green was not observed on this slice**, verified by reading the test at `d657966`; the ownership half was clean. *Orchestrator, in the log* |

### What must land before this reaches a gate

AC-9 met on the wire **and** per operation (1, 13) · A-06-2 asserted (2) · AC-6 true for a whole
request, so §8.4's server-span row is too (6) · §8.4 and `src/` agreeing, two implemented and two
deleted (9) · three changed files at or above 0.75 with **no override**, residue named (3, 4, 5, 14) ·
`I-04-5` ruled and §11's row restored (8) · AC-10 bound to its four operations, the harness runnable
from a terminal (7, 12) · the marker anchored on the counter (11) and `DB_POOL_MAX` dictated by the
test (10).

Items 1, 2, 7 and part of 5 are **new outside-in assertions and must be committed red first** — a
second red commit, which §7 forbids *within one pass* and which (c) licenses, because (c) re-enters at
step 1 and step 3 follows. Read any other way, (c) is unperformable.

### Is this still one slice — no, and for the human at the gate

§6 escalates a third loopback as a **slicing** problem. Four adjudication rounds, then fifteen findings
with three BLOCKING, on a slice carrying seventeen criteria and six inherited obligations, is that
signal arriving louder. **Gate D's fold of slices 10 and 11 into 09 was wrong and this review is the
evidence** — all three blocking findings sit on the contract half, which was separable all along.
Unfolding is not mine, so:

- **`gate: light` is revoked** by the front matter's own condition; I have not touched the field.
- **The scope question**: repair inside 09 — one loopback spent, one more red, the largest slice grows
  again — or **reopen slice 10** for the contract half and merge 09's telemetry, pool and budget work
  once 3–6 and 9–11 clear. I recommend the second and it is the human's to rule.
- **§6(b) has no terminal case.** ADR-0035 points at a backlog that will never run. A retro sentence,
  not a blocker.

## Proposed arc42 edits, made at step 7 — revised by step 5

§8.4 gains the one-module rule (finding 11), **loses `booking.validate` and
`availability_query_duration_seconds`** (finding 9) and loses the sentence `A-04-15` says slice 04
made false. §8.6 gains the **`type` × operation matrix** (finding 1). §5.3's ruleset table gains
`otel-sdk-only-in-platform` and QS-10's row its fifth plant (`T-09-2`). §10.2's QS-11 loses *"the
OpenAPI half is slice 09's and unasserted"*; QS-14 gains the measurement protocol above. §3.1 gains
the harness as the stubbed client. §11 gains R-1's figure, AC-12's headroom (`T-09-4`), `D-07-1`'s
stated reason, ADR-0035's under-count and **`I-04-5`'s declined bias**, and restores the retired-
`proposed` sentence `9d2daf5` deleted. **§8, §10 and §11 are over budget: every addition names its
deletion, and finding 9 makes §8.4 deletion-net.**

## Assumptions and open questions

- **A-09-1** — `O-70` is runner starvation. Untested; nothing in this design depends on it.
- **A-09-2** — the CI container's class is stable enough for a threshold to mean anything between
  runs. The recorded machine class is what would falsify it.
- **OQ-09-1** — `D-07-1` has **no log ref**, so the bidirectional inherited-scope guard cannot see it
  and it travels inside `R-07-12`'s bullet instead. That is the `R-05-2` shape once more, and it is
  the orchestrator's to fix rather than mine.
