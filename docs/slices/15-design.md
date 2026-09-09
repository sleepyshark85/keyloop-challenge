# Slice 15 — design

**No `src/` change, no data-model delta, no migration.** Everything here is `harness/**`, one new
acceptance file, and docs: this slice adds no behaviour, it makes an already-proven claim
*demonstrable from a terminal*. The gap is stated once, in the slice file's Goal — QS-3 is proven by
`tests/concurrency/no-spurious-refusal.test.ts` and shown by nothing a reader can run, because
`harness/seed.mjs` seeds **one** bay and **one** technician.

## Building blocks touched · data-model delta: none

`harness/seed.mjs` (reads a fixture; SQL unchanged in kind) · **new** `harness/fixture.json` ·
**new** `harness/spurious-refusal.sh` · **new** `tests/acceptance/harness-fixture.test.ts` ·
`docs/WALKTHROUGH.md`, `README.md` (scribe). `src/`, `docs/api/openapi.json`,
`.dependency-cruiser.js` and every migration are untouched. `harness/` is outside `lint:arch`'s roots
(`src tests`), so no layering rule is in play.

## 1 — The trap, ruled first: the scarcity demo is not amended, it is left alone

Raising the default capacity would make `harness/double-booking.sh`'s assertion (*exactly one* `201`)
false, turn Scenario 2's transcript into a lie, and fail slice 10's AC-4/AC-5/AC-6 in
`tests/acceptance/harness.test.ts` — the **test-engineer's** file, and a merged contract.

- **(A) one dealership, *M* > 1 bays, `double-booking.sh` learning *M*.** Rejected: it amends a merged
  acceptance contract to buy a demonstration that does not need it.
- **(B) `double-booking.sh` generalised with a `CAPACITY` parameter defaulting to 1.** Rejected on a
  different ground — the default path survives, but one script then carries two claims, and
  `double-booking.sh` names a *hazard*. A demo audience reads the filename before the flags.
- **(C, ruled) two subtrees, two scripts, and the existing exported names preserved by
  construction.** The fixture declares a **scarce** subtree — today's shape, 1 bay, 1 qualified
  technician — exporting the five unprefixed names slice 10 pinned, and an **abundant** subtree
  exporting the same names under a `CAPACITY_` prefix. `double-booking.sh` and `harness.test.ts` are
  not edited at all.

Bays and technicians are `dealership_id`-scoped (§8.1), so the two subtrees **must** be two
dealerships: abundant bays inside the scarce dealership would be candidates for the scarcity demo and
destroy it. Service types are the global catalogue (*"one catalogue, every site"*), so they are
declared once at the fixture's top level — the JSON's shape is a third transcription of that scoping.

**No ADR for this ruling.** It closes off no alternative anyone takes twice and reverses by deleting a
file; the evidence is that `harness.test.ts` is byte-unchanged (AC-9).

## 2 — The fixture carries **data**, never **schema** — ADR-0038

`harness/seed.mjs`'s docblock states that it is a **second, independent transcription** of arc42
§8.1's reference-data shape in raw SQL — `tests/support/seed.ts` is the first — so a renamed or
dropped column fails loudly with PostgreSQL's own `42703`. The refactor a maintainer reaches for
twice is to drive `INSERT` generation from the JSON. **That collapses two transcriptions into one.**

**Ruling: the nine `INSERT` statements stay hand-written, naming every column literally.** The fixture
supplies rows, not tables. A fixture that could add a column would be a schema; this one cannot
express a column at all. Three things it therefore does not carry:

- **No uuids and no VINs.** The fixture names entities by **key** (`"bays": ["bay-1"]`) and the seeder
  maps key → a fresh `crypto.randomUUID()` per invocation: the `db` project shares one un-truncated
  Testcontainer and the seed runs once per acceptance case, so fresh ids are what keep
  `vehicle.vin`'s global `UNIQUE` clear.
- **No instants.** `STARTS_AT` stays tomorrow 09:00Z, rolled forward in `seed.mjs`, with 08:00–18:00
  opening hours on all seven days so the weekday never matters and
  `book-read-reschedule-cancel.sh`'s `+2 hours` convention keeps its headroom. A `"startsAt"` in data
  invites a pinned literal that ages into the past.
- **No export *names*.** They derive mechanically from a subtree's `exportPrefix`, so a new subtree
  cannot invent its own env vocabulary.

### ADR-0038 (draft — **not yet written to `docs/adr/`**)

> **Title:** The harness fixture carries data, never schema. **Status:** proposed → accepted at step 7
> · **arc42:** §3.1 · **proposed-by:** architect · **decided-by:** architect.
> **Options:** (A) keep the data hard-coded in `seed.mjs`; (B) a generic `{table, columns, rows}`
> document the seeder replays; (C, chosen) a domain-shaped fixture of keys and attributes, replayed by
> hand-written per-table `INSERT`s; (D) generate the fixture from the migrations.
> **Why:** (A) cannot describe a second subtree without duplicating the file. (B) and (D) make the
> seeder's SQL a function of a schema description — the independence arc42 §8.1 leans on. Under (B) a
> dropped column disappears from the fixture too and the `42703` never fires.
> **Consequences:** adding a *column* is a two-file edit, deliberately; adding a *row* is a one-file
> edit. The seeder must validate references the JSON alone cannot, because half the fixture's
> integrity is cross-reference rather than shape.

## 3 — The fixture, its schema and its validation

`harness/fixture.json`, overridable by `HARNESS_FIXTURE=<path>`. Shape, in one pass:

```
serviceTypes[]  : { key, name, durationMinutes }                  — the global catalogue
subtrees[]      : { key, purpose, exportPrefix, timeZone,
                    openingHours: { days[], opensAt, closesAt },
                    serviceTypes[]  (keys, ORDERED — first is the exported one),
                    bays[]          (keys),
                    technicians[]   : { key, qualifiedFor[] (serviceType keys) },
                    customers[]     (keys),
                    vehicles[]      : { key, owner (customer key) } }
```

**Exports per subtree**, prefix `P`: `${P}DEALERSHIP_ID`, `${P}STARTS_AT`, `${P}BAY_COUNT`,
`${P}QUALIFIED_TECHNICIAN_COUNT` (qualified for the *first* service type), and — for every entity the
API can **name** — `${P}SERVICE_TYPE_ID`, `${P}CUSTOMER_ID`, `${P}VEHICLE_ID`, with `_2`, `_3` … for
the second and later. Bays and technicians get **counts only**: the line between an indexed export and
a count is *"can a caller put this id in a body"*.

The subtree carrying `exportPrefix: ""` — exactly one, by validation, **wherever it sits in the
array** — reproduces slice 10's five names exactly under that first-of-each rule. That is the
mechanism by which the merged contract survives, not a promise.

**Validation runs to completion before the first `INSERT`, and the insert sequence runs inside a
transaction** (ruling 2 below: validate-first is *not* atomicity). Validate-first bounds the failures
the validator **models**, and buys a message naming the JSON path; `BEGIN`/`COMMIT` with `ROLLBACK` on
error bounds the rest, because a partial seed into a shared, never-truncated container is worse than
none. The validator is hand-written, ~40 lines, no new dependency: the harness's independence from
`src/`'s stack is its purpose, and — the real argument — **half the rules are cross-references a JSON
Schema could not express anyway**. Failure writes to **stderr**, prints **nothing** on stdout (stdout
is `eval`'d; a diagnostic there is executed), and exits non-zero.

The rules: **unknown keys are rejected** — a `qualifiedfor` typo would otherwise seed an unqualified
technician and make the capacity demo fail mysteriously, the "subtly wrong world" this validation
exists to prevent; keys unique within their collection; `qualifiedFor` and `serviceTypes` naming
declared service types; `vehicles[].owner` naming a customer in the **same** subtree; exactly one
subtree with `exportPrefix: ""` and prefixes otherwise unique and `^[A-Z][A-Z0-9_]*_$`; every subtree
declaring ≥ 1 service type, customer and vehicle, so the five names always exist; `days ⊆ 0..6`,
`opensAt < closesAt`, `durationMinutes` a positive integer; `purpose` present and non-empty, because a
subtree that cannot say what it is for is one nobody can maintain.

## 4 — "Enough data for all the important test cases", enumerated

Named, because a fixture justified by *"enough"* grows without argument.

| Case | Needs | Where |
|---|---|---|
| Book / read / reschedule / cancel (Scenarios 1, 4, 5) | a slot with +2 h headroom | scarce, unchanged |
| Double-booking, exactly one wins (Scenario 2) | **1** bay, **1** qualified technician | scarce, unchanged |
| Back-to-back, no buffer (§8.2 consequence 1) | 1 bay, two calls 60 min apart | scarce, already possible |
| Availability advisory and stale (Scenario 3) | any dealership | either |
| Outside opening hours `400` (Scenario 6) | a known 08:00–18:00 window | scarce, unchanged |
| Telemetry / Loki–Tempo join (Scenario 9) | Scenario 2's shape | scarce, unchanged |
| **No spurious refusal, `min(N,M)`** | *M* bays, *M* qualified technicians | **abundant (new)** |
| **`422 vehicle-not-owned`** | a **second** customer + vehicle | **scarce (new)** — WALKTHROUGH §7 today tells the reader to *"seed a second dealership"* and mix ids by hand |
| **`422 unknown-reference` for a service type no technician there is qualified for** (§8.6's wording) | a **second** service type, unqualified at the scarce dealership | **scarce (new)** — today reachable only via a random uuid, the *other* half of that row |

**Out of scope, named rather than left to be noticed.** QS-9's DST transition needs a pinned date in a
specific zone, contradicting the rolled-forward instant. ADR-0009's cap-exceeded refusal needs > 16
candidate pairs. QS-14's shape belongs to `tests/support/perfFixture.ts`. `409
appointment-not-confirmed` needs no fixture at all.

**Abundant defaults: *M* = 3 bays and 3 technicians, all qualified for its first service type;
`REQUEST_COUNT` defaults to 10.** (5,3) is a QS-3 cell that *discriminates* — simulated at 80.3 %
failure against a no-retry build, where (2,1) fails 0 % — and (10,3) discriminates harder.

## 5 — `harness/spurious-refusal.sh` learns *M* from the fixture, never from the answers

Named for the hazard, as its sibling is. It reads `CAPACITY_*`, derives `CAPACITY = min(BAY_COUNT,
QUALIFIED_TECHNICIAN_COUNT)` from **declared** counts, fires `REQUEST_COUNT` concurrent bookings, and
exits non-zero unless it saw exactly `min(N, CAPACITY)` confirmations and the rest refused. A script
that inferred *M* from the responses would be asserting whatever happened — slice 10's AC-5 defect
verbatim, *"a script that always exits 0 regardless of what it saw is not a demonstration, it is a
print statement"*.

It also asserts, from the response bodies alone, that the confirmed appointments name `min(N,
CAPACITY)` **distinct** `bayId`s and as many distinct `technicianId`s — the same claim
`no-spurious-refusal.test.ts` makes, and a cross-check that the bodies report the allocation the table
holds (**not** evidence of contention: see A-15-1). No `jq`, for the reason its sibling states.

Three guards, each a usage error (exit 2) before any request is fired:

- `REQUEST_COUNT < 2` — `R-10-5`'s reason: one racer demonstrates no contention.
- `CAPACITY < 2` — that demonstration is `double-booking.sh`'s, and this script would silently become it.
- `BAY_COUNT ≠ QUALIFIED_TECHNICIAN_COUNT` — outside QS-3's proven shape. With unequal counts the
  attainable number is a maximum bipartite matching, not `min`, and ADR-0009's greedy allocator is
  proven to attain it only at *B = T*. (QS-3's `CELLS` set `m` as both counts, so every cell including
  (8,20) is *B = T*; the guard is consistent with the suite.) `N ≤ M` is **allowed** — (8,20) is *N*
  racers all confirming, the purest form of the claim.

**No `npm run harness:*` script is added**: neither sibling has one, and adding one drags slice 10's
README set-equality case red for a path `bash harness/spurious-refusal.sh` already gives.

## 6 — Ownership, and what is not being amended

| Artifact | Owner |
|---|---|
| `harness/seed.mjs`, `harness/fixture.json`, `harness/spurious-refusal.sh` | **implementer** (`harness/**`) |
| `tests/acceptance/harness-fixture.test.ts` (**new**) | **test-engineer** |
| `tests/acceptance/harness.test.ts`, `harness/double-booking.sh` | **nobody — unchanged by this slice** |
| `README.md`, `docs/WALKTHROUGH.md` (a new scenario; §7's "seed a second dealership" corrected) | **scribe** (§4) |
| `docs/slices/15-seed-fixtures-and-capacity-harness.md` | **orchestrator** (§4) — see the ruling-1 correction below |
| arc42 §3.1, §11.1 · ADR-0038 | **architect**, step 7 |

A **new** acceptance file, not growth onto slice 10's: slice 14's precedent, and here it carries a
second load — the new criteria live where they cannot silently loosen the old ones. **No acceptance
criterion of slice 10 is amended**; ruling (C) exists so that none needs to be.

## Acceptance criteria

- **AC-1** — `npm run --silent harness:seed` reads `harness/fixture.json` and prints, on stdout,
  export-shaped lines carrying non-empty `DEALERSHIP_ID`, `SERVICE_TYPE_ID`, `CUSTOMER_ID`,
  `VEHICLE_ID`, `STARTS_AT` — unprefixed — and nothing that is not an export line.
- **AC-2** — the same run prints `CAPACITY_DEALERSHIP_ID`, `CAPACITY_SERVICE_TYPE_ID`,
  `CAPACITY_CUSTOMER_ID`, `CAPACITY_VEHICLE_ID`, `CAPACITY_STARTS_AT`, `CAPACITY_BAY_COUNT` and
  `CAPACITY_QUALIFIED_TECHNICIAN_COUNT`; the two counts are equal and ≥ 2; and **the database agrees** —
  that dealership holds exactly that many `service_bay` rows and that many technicians qualified for
  the exported service type. *A count asserted from stdout alone is a claim about a `console.log`.*
- **AC-3** — an invalid fixture fails **loudly and atomically**. For each of: an unknown key; a
  `qualifiedFor` naming an undeclared service type; a `vehicles[].owner` naming an undeclared
  customer; **a duplicate key within a collection**; no subtree with an empty `exportPrefix`; a
  duplicate prefix — the seed exits non-zero, names the offending JSON path on **stderr**, prints
  **nothing** on stdout, and **inserts no row**. *Six of the validator's ten rules, chosen by a stated
  test — a rule earns a case when its breach is **silent**. `days ⊆ 0..6`, `opensAt < closesAt` and
  `durationMinutes > 0` are refused loudly by CHECK constraints at
  `src/persistence/migrations/0002_reference_data.sql:21,25,31`, so a case for each buys no
  discrimination; `purpose` and the ≥ 1-per-collection minimums fail at AC-1/AC-2's own exports.*
- **AC-4** — `harness/spurious-refusal.sh` with `REQUEST_COUNT=10` against the capacity subtree exits
  0, prints one line per racer, and sees exactly `min(N, M)` confirmations and `N - min(N, M)`
  refusals, with *M* taken from the exported counts.
- **AC-5** — and the confirmed appointments name `min(N, M)` **distinct** bay ids and `min(N, M)`
  distinct technician ids, read from the response bodies; the database holds exactly `min(N, M)`
  non-cancelled appointments for that dealership.
- **AC-6** — *(negative control)* with `CAPACITY` overridden to any value other than the true
  capacity, the script exits non-zero. *This is what makes AC-4 an assertion rather than a print
  statement, and it needs no fault injected into the service to prove it.*
- **AC-7** — *(negative control)* with the capacity subtree's interval already fully taken, `N` racers
  see zero confirmations and the script exits non-zero.
- **AC-8** — *(guards)* `REQUEST_COUNT < 2`, `CAPACITY < 2`, and `BAY_COUNT ≠
  QUALIFIED_TECHNICIAN_COUNT` each exit 2 **without firing a request**, each naming which guard fired.
- **AC-9** — *(guard; passes today, and is the no-amendment claim made mechanical)*
  `tests/acceptance/harness.test.ts` and `harness/double-booking.sh` are **unchanged** by this slice's
  diff, and every case in that file still passes. Verified by the **reviewer** against
  `git diff main --stat`, plus CI for the second half.
- **AC-10** — from the default fixture and **one** seed run: booking `VEHICLE_ID_2` with `CUSTOMER_ID`
  answers `422 /problems/vehicle-not-owned`, and booking `SERVICE_TYPE_ID_2` at `DEALERSHIP_ID`
  answers `422 /problems/unknown-reference`. *This is "enough data for the important cases" as a
  criterion rather than a claim.*

**The red set: AC-1 to AC-8 and AC-10 must all fail in the one red commit** — no `fixture.json`, no
`CAPACITY_*` export, no script, no second customer or service type. **AC-9 is the named exception**: it
passes today and exists to fail if this slice breaks it.

## Step 2 — objections ruled

Replies were given before any edit (§6), and each finding was judged apart from its remedy.

- **Objection 1 (test-engineer), A-15-1's rationale — AGREE, remedy taken as offered, outcome (a).**
  No AC, script or fixture moves; the wording below is corrected, by an argument stronger than the
  objection's own — the *constraint*, not the allocator, is why. The identical correction is owed to
  the slice file's Known limits, which is the **orchestrator's** document (§4) and which I have not
  edited: replace A-15-1's second sentence with *"No response-only assertion discriminates a
  serialised run, AC-5's distinctness included; A-15-1 rests on the captured `double-booking.sh`
  transcript, where racer 4 wins."*
- **Objection 2 (implementer), validate-first ≠ atomicity — AGREE on the finding; the remedy is
  discretion, and it is right.** `BEGIN`/`COMMIT`/`ROLLBACK` changes no interface, no export, no data
  model, and leaves ADR-0038 untouched — that ADR governs whether SQL is **generated** from the JSON,
  not how hand-written statements execute. The *claim* was design text, so §3 is amended and the
  mechanism is step 4's. **No new AC**, deliberately: see D-15-3.
- **Coverage note (implementer) — PARTLY DISAGREE. AC-3 grows by one case, not five.** Three of the
  five "uncovered" rules are enforced by CHECK constraints, cited in AC-3. The interlock is worth
  seeing: objection 2's transaction is what makes leaving them to the database safe, because a
  mid-insert CHECK failure now rolls back rather than stranding rows.

## What cannot fail, and what this does not prove

- **Nothing response-only discriminates *how* the answers came about**, and two things fall under
  that. **A-15-1 — closed at step 2.** *N* concurrent `curl` processes do interleave: WALKTHROUGH's
  captured `double-booking.sh` transcript has racer 4 winning, not racer 1. But AC-5's distinctness
  would **not** have noticed had they serialised — the step-1 claim that it would was wrong.
  Distinctness among confirmed *overlapping* appointments is **implied by the exclusion constraints**:
  two live rows cannot share a bay or a technician over one interval, under any interleaving. The
  deeper reason, which also covers **ADR-0004's rejected global mutex** (it too confirms `min(N, M)`):
  this demo's contention is over **persisted rows, not instants** — a sequential run collides with
  rows already committed, retries and prunes identically. `no-spurious-refusal.test.ts` needs its
  conflict lines and `max(attempt) ≥ 2` for exactly this reason, and a script sees responses, not the
  log stream. So A-15-1's failure would cost the demonstration its rhetoric, never its correctness,
  which is §2.1 restated. (A wall-clock threshold would discriminate; rejected — QS-14 is the only
  performance scenario, and a timing assertion in a shell script is flake.)
- **D-15-1** — ADR-0009's cap of 16 is not encoded in the harness: that constant has one home, in
  `src/`, and a copy in a shell script goes stale. *M* must satisfy `2M − 1 ≤ 16`; at *M* = 3 the worst
  case is 5 attempts. A fixture author setting *M* = 9 gets an unwarned flaky demo.
- **D-15-2** — `REQUEST_COUNT` above `DB_POOL_MAX` (default 10) demonstrates queueing rather than
  contention. The default *N* = 10 sits exactly at it.
- **D-15-3** — the `ROLLBACK` path is asserted by nothing. Any fixture built to pass validation and
  fail at insert can later be moved *into* the validator, at which point the control passes for the
  wrong reason — no rows because nothing was attempted, `R-10-5`'s vacuity pattern. Booked rather than
  criterion-ised; the test-engineer may add a case at step 3 if it makes the failure's **cause**
  assertable (stderr naming a SQLSTATE, not a JSON path). Its call, not an obligation.
- **No mutation evidence exists for this slice.** Nothing under `src/` changes, and Stryker mutates
  neither `harness/**` nor tests. AC-3, AC-6, AC-7 and AC-8 are the substitute, and the reviewer
  should weigh those rather than read a vacuous green score.

**Scope: one slice.** Split, slice A merges an abundant subtree nothing consumes — data with no
demonstration, which §10's Definition of Done exists to refuse.
