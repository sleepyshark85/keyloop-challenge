# Slice 09 — design

Slice file: [`09-observability.md`](09-observability.md). Gate D folded slices 10 and 11 into it and
`O-59` admitted a sixth inherited obligation. arc42 §3.1, §5.3, §8.4, §8.6, §10.2 and §11.1 are
*proposed* here and edited at step 7.

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
| `docs/api/openapi.json`, `harness/` | The committed document — emitted by `buildOpenApiDocument()`, written by `npm run docs:openapi` (`T-09-1`) — and the cURL scripts |
| `vitest.config.ts`, `tools/ci/run-tests.mjs` | A third `perf` project, run alone (`T-09-3`). Test-engineer's files: specified here, built there |

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
comes from a function the unit layer can also call. The arithmetic was stated so step 5 could falsify
it rather than re-derive it, and `I-09-1` falsified it — with a live `@fastify/swagger` 9.8.1 harness
where I had only read. **The response body's object-level `description` survives into the document;
the querystring's does not**, the object being exploded into `in: query` parameters and the wrapper's
own description dropped. So the floor is 30 / 42 → **34 / 42 = 80.95 %**, which still clears §10's
0.75 and still closes `D-08-1`. An **operation-level `schema.description`** — Fastify's field sibling
to `querystring` and `response` — *is* preserved, so relocating the querystring's prose there carries
the same three literals onto a property the document keeps: **37 / 42 = 88.1 %**. It touches no
criterion (AC-5b names the response schema) and renders text that today renders nowhere. The
*mechanism* is now measured; the *figure* is still a projection over seven literals, and step 5
falsifies it. The three `DISCLAIMER` mutants are a runtime body
value and not a schema description; **nothing here kills them** and they stay in `D-08-1` with the two
unkillable `default:`-arm mutants at `159`.

## What makes QS-14 assertable rather than aspirational

A budget is a threshold, so what it measures is pinned before anyone measures it.

- **Boundary:** the HTTP request, end to end. Measuring the use case hides pool acquisition, which is
  `D-07-1`'s subject.
- **Serially.** *Uncontended* means one request in flight, or the figure describes the pool.
- **Exclusively.** *Uncontended* is a property of the runner too, not only of the test.
  `tests/performance/**` leaves the `db` project for its own `perf` project and its own sequential
  `run-tests.mjs` invocation, so it holds its own container (`T-09-3`).
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
- **One red commit** (§7), **one observed red run**, and the file set is a *property* rather than a
  count — a count is precisely what `T-09-2` found wrong, and `T-09-4` bounds it. **Every criterion
  and control whose subject this slice *introduces* fails in that run — sixteen of seventeen, plus
  both controls; AC-12 is the one exception and is named below.** The five files the decisions above commit:
  `tests/integration/telemetry-booking.test.ts` (QS-13), the contract file over the emitted document
  (QS-11's second half, `A-06-2`), `tests/performance/availability-budget.test.ts` (QS-14),
  `tests/architecture/layering.test.ts` (decision 1's plant, QS-10) and `ambiguity-containment.test.ts`
  (decision 2's marker, QS-12). AC-6b, AC-10 and AC-11 need homes the test-engineer places. The slice
  file said *"three reds if they need three"*, which contradicts §7; corrected. One run failing
  seventeen criteria is also the stronger baseline, because it proves none was passing beforehand —
  which is why `AC-7` was withdrawn at slice 08.
- **The document is `docs/api/openapi.json`** (`T-09-1`) — ADR-0005's path, which three files in the
  tree already name. Emitted by `buildOpenApiDocument()`, written by `npm run docs:openapi`.
- **`tests/performance/**` runs alone** (`T-09-3`): its own project, its own invocation, its own
  container.
- **AC-12 is a standing guard, not a criterion this slice earns** (`T-09-4`); threshold and fixture
  unchanged, and §11 records the headroom as the regression baseline. Cost if wrong: QS-14's
  availability half is asserted by a test only a 22× regression can fail.
- **`D-07-1` split** (decision 5); **`T-06-5` accepted** (decision 6).

## Step 2 adjudication — four objections, none deferred

| # | Verdict | Rule | Why |
|---|---|---|---|
| `I-09-1` | **AGREE**; remedy taken | (a) | It ran `@fastify/swagger` where I read it. A falsifiable figure that gets falsified is the mechanism working |
| `T-09-1` | **AGREE**; remedy taken verbatim | (a) | §4 already decides it — the ADR wins over a slice file, and three files in the tree agree with the ADR. Ruling root-level would supersede an accepted ADR to move a file for no reason I can state, which is the shape the 2026-09-07 bar retired seventeen files for. **No ADR minted, none superseded** |
| `T-09-2` | **AGREE**, both halves; it does not get to concede | (a) | Neither control is optional. A fifth `dependency-cruiser` rule asserted by nothing is what QS-10 exists to prevent, in decision 1's own words; `dependency-cruiser` is per file and cannot see a one-increment-site rule, so decision 2's marker is its only executable form. **Checking it turned up the same class once more, and mine rather than theirs: `arc42:` was missing §5.3**, where the fifth rule's row lives |
| `T-09-3` | **AGREE** the finding entire; exclusivity accepted, **mechanism changed**; the §11 alternative **refused** | (a) | Below |

### `T-09-3` — the budget runs alone, and why this is (a)

Every file re-read confirms the measurement. What the (c) test asks to be named is **AC-13's own
word**: a booking measured while `no-spurious-refusal` drives 20 racers at the same PostgreSQL is not
*uncontended*. The protocol above pinned the test's own concurrency and said nothing about the
runner's.

**The §11 alternative is refused on the objector's own reasoning.** `A-09-1`'s machine class
discriminates a starved runner because starvation is visible *in the class*; it cannot discriminate a
contended run from a clean one on the *same* class. A "noisy upper bound" is `O-70`'s trade with the
discriminating half removed — and §11 would record it as a number.

**The mechanism changes.** `fileParallelism: false` on `db` serialises 21 files to isolate one, on
every run of every future slice. A third `perf` project instead: `run-tests.mjs` already spawns
projects strictly sequentially, and per-project `globalSetup` hands it its own container —
exclusivity at the container rather than at the file, stronger than what was asked, for one container
start. That file's *"a project that did not run is a loud, distinct failure"* then covers the budget
for free, which is the same failure class one layer up. Two things to **demonstrate rather than
assume**, per its own `globalSetup` precedent: that three projects merge into the single
`test-results.json` `red-proof` reads, and that `perf` genuinely runs alone.

**Not (c).** (c) loops back to step 1, supersedes the ADR at fault and revises prior work. No ADR is
at fault, and at step 2 there is no prior work — this amendment *is* the loop back. The decision was
right and stated; the mechanism making it true was missing, which is a specification gap. The counter
measures slicing pressure, and spending one of two here would report this slice to the gate as three
designs deep when it is one. **The gate should check me on that**; `gate: light` is the human's to
keep or revoke and I have not touched the field.

## Step 3 adjudication — `T-09-4`, the criterion that cannot fail

| # | Verdict | Rule | Why |
|---|---|---|---|
| `T-09-4` | **AGREE** entire — **the false claim was mine**, not the test. AC-12 kept and reclassified; both offered remedies refused, and a third | (a) | Below |

**The refusal is the finding.** Lowering the threshold or bolting on unrelated assertions would each
have bought a red by making AC-12 describe something else; reporting the hole instead is the
behaviour §2.4 exists to produce, and it is recorded here as correct. **A third route is refused on
the same ground: inflating the fixture until 200 ms bites.** §10.2 names the fixture — 5 bays, 20
technicians, 500 appointments, one dealership, one week — *inside* the scenario, so fixture and
threshold are two operands of one ratio and moving either manufactures a red identically. It would be
honest only as a *different* scenario, which §1.2's ranking and this slice's Out of scope both bar.

**Is a budget already met evidence?** Of two things, and only one is §2.4's. It is **not** evidence
that slice 09 built anything, and nothing may claim it is. It **is** evidence of the measurement: a
real p95 over 100 samples against a stated fixture with the machine class printed beside it, every
sample asserting `200` (`tests/performance/availability-budget.test.ts:124,130,135`). That test fails
today on an absent, broken or erroring endpoint and on a 22× regression. A passing test with a live
oracle is not the vacuous test §2.4 is aimed at.

**Why not withdrawal, given slice 08 withdrew AC-7 on exactly this ground.** The two acts differ in
what they cost. AC-7's guarantee stayed asserted after it went — `ambiguity-containment.test.ts`
holds the permitted-file list by exact equality on every commit — so a duplicate was dropped. Nothing
else asserts AC-12; withdrawing it returns goal 5 to a goal with no number, which is the state §10.2
minted QS-14 to end. So AC-12 is **reclassified, not reshaped**. A floor at the measured figure is
refused too: on `A-09-2`'s own terms the class is only *assumed* stable, so a tight floor fails
ordinary refactors on the goal §1.2 ranks last — the ranking inverted to buy a red.

**The property is restated, because it was stated as covering everything.** Every criterion and
control whose subject this slice introduces failed in the one observed red run, and nothing outside
that set failed (`red-proof`: six files red, no unit test failing). **The exclusion is closed, not
open**: a criterion may sit outside the red set only where it asserts a property of already-merged
code, and only where it is named. Exactly one does.

**Not (c), and §2.4 is answered rather than passed over.** §2.4 is breached by a *claim*, and the
claim was my universal quantifier — the test-engineer's work is correct, safe and shippable byte for
byte as committed, so no clause names it. (c) loops back to step 1, supersedes the ADR at fault and
revises prior work: no ADR is at fault, and there is nothing to revise, because **(c) and (a) here
produce the identical diff** — this one. The difference is a counter that measures slicing pressure,
and I decline to spend it on a sentence of my own. **No test changes; step 3 stands and step 4 is not
interrupted.** The gate is shown this as an AC ruling.

## Proposed arc42 edits, made at step 7

§8.4 gains the one-increment-site rule and loses the sentence `A-04-15` says slice 04 made false.
§5.3's ruleset table gains `otel-sdk-only-in-platform` and QS-10's row its fifth plant (`T-09-2`).
§10.2's QS-11 loses *"the OpenAPI half is slice 09's and unasserted"*, and QS-14 gains the measurement
protocol above, exclusivity included. §3.1 gains the harness as the stubbed client. §11 gains R-1's measured figure, AC-12's headroom beside it (`T-09-4`) and
`D-07-1`'s stated reason. **§8, §10 and §11 are over budget: every addition names its deletion.**

## Assumptions and open questions

- **A-09-1** — `O-70` is runner starvation. Untested; nothing in this design depends on it.
- **A-09-2** — the CI container's class is stable enough for a threshold to mean anything between
  runs. The recorded machine class is what would falsify it.
- **OQ-09-1** — `D-07-1` has **no log ref**, so the bidirectional inherited-scope guard cannot see it
  and it travels inside `R-07-12`'s bullet instead. That is the `R-05-2` shape once more, and it is
  the orchestrator's to fix rather than mine.
