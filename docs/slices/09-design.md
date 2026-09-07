# Slice 09 — design

Slice file: [`09-observability.md`](09-observability.md). Gate D folded slices 10 and 11 into it and
`O-59` admitted a sixth inherited obligation. arc42 §3.1, §8.4, §8.6, §10.2 and §11.1 are *proposed*
here and edited at step 7.

## One slice, and the seam is more false than when the gate ruled it

`A-06-4` declined a split on evidence that *telemetry · contract · budget* are not independent. Three
further couplings turned up writing this design, all in the same direction:

- **The trace is the query counter.** AC-13's *exactly one `INSERT`* and AC-14's *no N+1* are
  assertions over statement spans. Without the telemetry half they are a code reading.
- **`F-06-1` is what makes the counter's one-site rule checkable.** A marker scan over two attempt
  loops is a list; over one it is a fact.
- **`A-06-2` is asserted over the emitted document**, so a persistence-layer property is discharged by
  the contract half.

Cutting anywhere separates a change from the only thing that proves it. **Not split.**

## Building blocks

| Block | Delta |
|---|---|
| `src/platform/telemetry.ts` *(new)* | The OTel SDK, its exporters and §8.4's instruments. A leaf, as `platform-is-a-leaf` requires |
| `src/platform/logger.ts` | `pino` binds `trace_id` / `span_id` from the active context |
| `src/application/` | The extracted attempt loop (`F-06-1`), carrying `appointment.insert` / `appointment.update` and the one conflict increment |
| `src/persistence/db.ts` | The pool ceiling becomes one named value rather than `pg`'s default by omission (`R-07-12`) |
| `src/http/server.ts` | The document is emitted by a **callable function**, not only by a script |
| `src/main.ts` | Starts and shuts the SDK down; the only module that may see it |
| `.dependency-cruiser.js` | `otel-sdk-only-in-platform`, with QS-10's plant for it |
| `openapi.json`, `harness/` | The committed document and the cURL scripts |

**Data-model delta: none.** Nothing here adds a behaviour; each part puts a number or a document
against behaviour that already exists.

## Decisions

**1 — The API facade is free; the SDK is confined.** Spans are emitted where the work happens, because
§8.4's window *is* the gap between two span boundaries and a wrapper would place them at one remove.
`@opentelemetry/api` is importable by `src/application` and `src/persistence`; the SDK, its exporters
and its instruments are `src/platform` plus `src/main.ts`, on the shape
`http-framework-only-in-the-edge` already uses. **A new forbidden rule arrives with its plant or it
does not arrive** — QS-10's claim is that the rules *fire*, and a fifth confinement asserted by
nothing weakens the four that are.

**2 — `booking_conflicts_total` has exactly one increment site.** §8.4 fixes *what* increments it —
SQLSTATE `23P01`, never a status code; this fixes *where*. `pg` auto-instrumentation, plus a
hand-written span in the repository, plus one in the use case is how a conflict comes to be counted
twice, and `dependency-cruiser` is per file and cannot see it. The control is a QS-12 marker, the
shape already used for `contended-resource-cast`, whose file list is **one file after `F-06-1`'s
extraction and two before it**.

**3 — Timing and counting are two measurements.** Statement spans make AC-13 and AC-14 mechanical and
they cost time on the path being timed. AC-12 and AC-13's *figures* are measured with them off; the
`INSERT` count and the N+1 assertion are a second run with them on. Conflated, the budget measures its
own instrument.

**4 — The document is emitted by a function**, not only written to a file by a script. Why, below.

**5 — `D-07-1` is split.** In: the pool ceiling as one named value, which is all `R-07-12` needs. Out:
what a saturated pool *answers*. A `503` is a new row in a closed taxonomy (ADR-0024) and QS-11
requires every row to be reached end to end, so deterministic pool saturation is new behaviour in the
slice whose premise is that it adds none. §11 keeps it, with that reason instead of *"nobody decided
it"*.

**6 — `T-06-5` accepted.** `ResourceLock` carries the `Db` it was taken on, so a write cannot be
issued on a different handle. Slice 06 declined it as (b) and was right to; the price has since
fallen, because after `F-06-1` the signature changes once rather than twice.

## AC-7 does not kill the seven `description` mutants

`D-08-1` books them as *unobservable until slice 09 emits the document*. That is half true.
`vitest.mutation.config.ts` includes `tests/unit/**` only (§11 R-12), so a byte-for-byte assertion in
`tests/contract/` leaves them **killable and still not killed** — the score would not move and
`routes/availability.ts` would merge a second time under §10's 0.75. Hence decision 4: the document
comes from a function the unit layer can also call. The arithmetic, so step 5 can falsify it rather
than re-derive it — 30 / 42 → **37 / 42 = 88.1 %**. The three `DISCLAIMER` mutants are a runtime body
value and not a schema description; **nothing here kills them** and they stay in `D-08-1` with the two
unkillable `default:`-arm mutants at `159`.

## What makes QS-14 assertable rather than aspirational

A budget is a threshold, so what it measures is pinned before anyone measures it.

- **Boundary:** the HTTP request, end to end. Measuring the use case hides pool acquisition, which is
  `D-07-1`'s subject.
- **Serially.** *Uncontended* means one request in flight, or the figure describes the pool.
- **Warm.** A stated warm-up count is discarded, or p95 over 100 runs describes Node's start-up.
- **p95 is nearest-rank over 100 samples** — the fifth worst. Three estimators differ by more than the
  margin this budget has.
- **A seeded fixture, with the seed recorded beside the figure.**
- **The machine class is recorded with the figure** — CPU count, memory, image, PostgreSQL version.
  Also `O-70`'s missing datum.

## O-70 — ruled in for diagnosis, out as a test shape

Bounding racer counts to the runner's CPU count is **refused**. QS-1 fixes *N* = 20 and QS-3 asserts
(20,8) and (8,20); on a two-vCPU runner that bound takes *N* to 2, and QS-1's *"the other 19 receive
`409`"* stops being asserted. §10.2 already bounds in-flight requests **by the connection pool**
(`R-07-4`), which is the bound that preserves simultaneity; a second, smaller one un-races what the
first exists to race. The diff implicates no `src/` or `tests/` file either.

What this slice does owe is that the next occurrence is **diagnosable**: the failed insert carries
`db.sqlstate` on its span, and the machine class is recorded with every budget run — so *a starved
runner* and *a retry inside an aborted transaction* (§11 `R-7e`, which a `500` at the edge is equally
consistent with) stop being indistinguishable from a test message. Recorded as an assumption rather
than a finding: *almost certainly* is still doing real work in `O-70`'s own sentence.

## No ADR

Every decision above implements one already taken. Vendor confinement is ADR-0008 and the ruleset
header; *what* increments the counter is §8.4; generating the document from the route schemas is
ADR-0005; free-first ordering is a `proposed` decision the human deliberately moved out of the ADR
corpus into `08-design.md`, and this slice accepts or supersedes it **on measurement**, there.
Decision 1 is the one I would have minted a week ago. Under the bar set on 2026-09-07 it is a rule,
not a decision, and minting it is the shape seventeen files were retired for.

## Rulings — mid-slice authority, provisional until the gate

- **AC-5b added: seventeen criteria, not sixteen.** `R-08-2` named it at slice 08 and it was never
  written down. Cost if wrong: the largest slice grows again.
- **One red commit** (§7), three test files, one observed red run. The slice file said *"three reds if
  they need three"*, which contradicts §7; corrected. One run failing seventeen criteria is also the
  stronger baseline, because it proves none was passing beforehand — which is why `AC-7` was withdrawn
  at slice 08.
- **`D-07-1` split** (decision 5); **`T-06-5` accepted** (decision 6).

## Proposed arc42 edits, made at step 7

§8.4 gains the one-increment-site rule and loses the sentence `A-04-15` says slice 04 made false.
§10.2's QS-11 loses *"the OpenAPI half is slice 09's and unasserted"*, and QS-14 gains the measurement
protocol above. §3.1 gains the harness as the stubbed client. §11 gains R-1's measured figure and
`D-07-1`'s stated reason. **§8, §10 and §11 are over budget: every addition names its deletion.**

## Assumptions and open questions

- **A-09-1** — `O-70` is runner starvation. Untested; nothing in this design depends on it.
- **A-09-2** — the CI container's class is stable enough for a threshold to mean anything between
  runs. The recorded machine class is what would falsify it.
- **OQ-09-1** — `D-07-1` has **no log ref**, so the bidirectional inherited-scope guard cannot see it
  and it travels inside `R-07-12`'s bullet instead. That is the `R-05-2` shape once more, and it is
  the orchestrator's to fix rather than mine.
