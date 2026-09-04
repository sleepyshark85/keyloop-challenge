# Slice 01 — design

> Step 1 of the slice loop. Architect. Branch `slice/01-domain-policy-core`.
>
> arc42 scope declared by the slice: **§5.2 · §8.3 · §12** · quality scenarios: **QS-9, QS-12** ·
> ADRs in play: **ADR-0001** (opening hours as request validation), **ADR-0008** (module
> decomposition), and **ADR-0013**, drafted by this design.
>
> This is a design. It contains no TypeScript that anyone should copy verbatim into `src/`; the
> signature blocks below are the **contract** the test-engineer writes against, because
> `guard-paths.mjs` denies that role read access to `src/` and this document is therefore the only
> place it can learn what to call.

---

## 0. The rulings, up front

| # | Question | Ruling |
|---|---|---|
| 1 | Does this slice change the schema? | **No.** No migration, no data-model delta. §1 |
| 2 | Do the three domain modules import each other? | **Yes, type-only, and that is what `domain-is-pure` permits.** AC-5 and AC-6 are jointly unsatisfiable otherwise. §2.0 |
| 3 | How do opening hours reach a pure core? | A **7-slot tuple indexed by `day_of_week`**, `null` for a closed day. Absence is unrepresentable. §3 |
| 4 | Who owns the DST rule? | `openingHours.ts`, stated **once**, as *render both endpoints, then compare wall clock*. §4 |
| 5 | How does an outside-in property test reach a module with no boundary? | Through the **built artifact** `dist/domain/*.js`, loaded at runtime. `.dependency-cruiser.js` is **not** amended. §6, ADR-0013 |
| 6 | Does `tests/property/` pay the container cost? | **No — it splits.** `*.db.test.ts` runs in the `db` project; everything else under `tests/property/` runs in `nodb`. §6.3 |
| 7 | How does the red stay an assertion failure? | Measured: a **literal** dynamic-import specifier fails `tsc` and therefore fails `verify`; a **computed** one does not. §8 |

Two findings are raised rather than fixed here, because neither is mine to fix: **F-01-1** (arc42 §10
QS-9 still carries the transposition the human corrected in AC-2 under O-13) and **F-01-2** (AC-5's
`time_zone` clause collides with `referenceRepository` at a later slice). §11.

---

## 1. Data-model delta: none, and this is stated rather than left blank

`opening_hours(dealership_id, day_of_week, opens_at, closes_at)`, `dealership.time_zone` and
`service_type.duration_minutes` all landed in `0002_reference_data.sql` at slice 00. The table's own
comment already carries AC-4's rule — *"a day with no row is a day the dealership is closed"* — and
`CHECK (day_of_week BETWEEN 0 AND 6)` with `0 = Sunday` already fixes the encoding this slice's
`DayOfWeek` type mirrors.

**So slice 01 adds no migration, alters no table, and changes no column.** The section is empty on
purpose and says so, because a blank *Data model* heading reads as an oversight and an absent one
reads as a claim nobody made.

The one schema-adjacent fact this design *depends* on, and which is measured in the migration file
rather than assumed: `duration_minutes integer NOT NULL CHECK (duration_minutes > 0)` and
`CHECK (closes_at > opens_at)`. The domain still validates both. §2.1 explains why that is not
redundant.

---

## 2. The three modules

### 2.0 Do they import each other? Yes, and AC-6 still holds

`.dependency-cruiser.js`'s `domain-is-pure` is:

```js
from: { path: '^src/domain/' },
to:   { pathNot: '^src/domain/' },
```

An edge from `src/domain/interval.ts` to `src/domain/duration.ts` has a `to` that *does* match
`^src/domain/`, so the rule does not fire on it. Intra-domain edges are outside the rule by
construction, and always were.

AC-6 says *"`src/domain` imports nothing at all — the `domain-is-pure` rule holds with no
allowlist."* The operative half is the second clause, and it is satisfied exactly: `depcruise`
reports zero `domain-is-pure` violations and the rule keeps its empty allowlist. The first clause,
read with maximum literalness, would forbid intra-domain edges — and then **AC-5 and AC-6 could not
both be satisfied**, because AC-5 mandates three files each owning one concept and those concepts
compose: an interval is built *from* a duration, and an opening-hours verdict is taken *about* an
interval. The only ways out of a literal AC-6 are one file (AC-5 forbids it) or duplicated structural
types in three places (which is how `DurationMinutes` and a raw `number` come to be confused, which
is the entire reason the split exists).

Ruled: intra-`src/domain` type imports are permitted; §5.2's prose is corrected at step 7 from
*"imports nothing at all"* to *"imports nothing outside `src/domain`"* (§12.1). **Flagged for step 2**
— if the test-engineer or implementer reads AC-6 the other way, that is a DCR and the human decides,
because AC-6 is the human's.

Note that `import type` is visible to `dependency-cruiser` here: `tsPreCompilationDeps: true` is set
and 00a measured that it catches type-only edges. So these edges appear in the graph and are silent
because the rule permits them, not because the tool cannot see them.

### 2.1 `src/domain/duration.ts` — how many minutes

```ts
/** A-1. Branded so a bare number cannot be passed where minutes are meant. */
export type DurationMinutes = number & { readonly __brand: 'DurationMinutes' };

/** The shape this module needs from a service type, and nothing more. */
export type ServiceTypeDuration = { readonly durationMinutes: number };

/**
 * A-1: duration is an attribute of the service type. THE ONLY CONSTRUCTOR of DurationMinutes.
 * Returns null when the value is not a positive, finite integer number of minutes.
 */
export function serviceDuration(serviceType: ServiceTypeDuration): DurationMinutes | null;

/** The only place in the system where minutes become milliseconds. */
export function durationMillis(duration: DurationMinutes): number;
```

**Why `| null` when the column has `CHECK (duration_minutes > 0)`.** The CHECK constrains the
database. This function is handed a JavaScript number that has crossed a driver, a query builder and
a row mapper, and it is the only module in a position to state what a usable duration is. The branch
is not defensive decoration: it is directly callable and therefore directly unit-testable, which is
the difference between a guard and an unkillable mutant. The application maps `null` to a `500`-class
outcome — data that violates its own CHECK is corruption, not a client error.

**Why `durationMillis` and not an exported constant.** AC-5 is asserted by a *source scan*. A
`export const MINUTE_MILLIS = 60_000` can be imported and multiplied elsewhere, and the scan would
then have to reason about call sites. A function keeps the scan's marker mechanical: the literal
`60_000` occurs in exactly one file. §7.2.

**A-1's escape hatch, unchanged.** If duration varies by vehicle, `serviceDuration` gains a parameter
and its return type does not change. Nothing above it moves, because everything above it takes a
`DurationMinutes`.

### 2.2 `src/domain/interval.ts` — which instants

```ts
import type { DurationMinutes } from './duration.js';

/** An instant, as epoch milliseconds (A-8). Branded; the constructor is the only way in. */
export type Instant = number & { readonly __brand: 'Instant' };

/** THE ONLY CONSTRUCTOR. Returns null for NaN, Infinity, or a non-integer millisecond value. */
export function instant(epochMillis: number): Instant | null;

/** Half-open [startsAt, endsAt), matching the tstzrange the constraint compares (§8.2). */
export type Interval = { readonly startsAt: Instant; readonly endsAt: Instant };

/**
 * AC-1 / A-1. TOTAL: both arguments are already validated, so there is no failure case.
 * The end is derived. No client-supplied end is consulted, and there is no parameter for one.
 */
export function appointmentInterval(startsAt: Instant, duration: DurationMinutes): Interval;

/**
 * A-4 — "the interval the constraint sees". TODAY THE IDENTITY, and that identity IS the
 * statement that there is no buffer. A buffer changes this function and the constraint's range
 * expression, and nothing else.
 */
export function occupancyInterval(interval: Interval): Interval;
```

**Two smart constructors, then total functions.** `instant()` and `serviceDuration()` are the only
places a raw number becomes a domain value, and they are the only places that return `null`.
Everything downstream is total. The alternative — every function returning `T | null` — spreads the
same check across five call sites and gives four more places to get it wrong.

**`occupancyInterval` returning its argument is the point, not a placeholder.** §5.2 already argues
this; what this slice adds is that it is *called*, so that when A-4 turns out to be wrong the call
sites already exist. A named identity function that nobody calls would be the same as no function at
all. **The implementer must route interval construction through it at the point the constraint's
range is derived** — which is a later slice; in slice 01 the only caller is the test suite. Recorded
as a limitation in §9.2 rather than claimed as satisfied.

### 2.3 `src/domain/openingHours.ts` — the only wall clock in the system

```ts
import type { Interval } from './interval.js';

/** 0 = Sunday, mirroring opening_hours.day_of_week CHECK (day_of_week BETWEEN 0 AND 6). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The raw PostgreSQL `time` values, unparsed. This module owns the parse (§3.2). */
export type DayHours = { readonly opensAt: string; readonly closesAt: string };

/** Seven slots, one per day, indexed by DayOfWeek. `null` IS a closed day (AC-4). */
export type WeeklyOpeningHours = readonly [
  DayHours | null, DayHours | null, DayHours | null, DayHours | null,
  DayHours | null, DayHours | null, DayHours | null,
];

export type OpeningHoursVerdict =
  | { readonly kind: 'within' }
  | { readonly kind: 'closed-day';      readonly dayOfWeek: DayOfWeek }
  | { readonly kind: 'outside-window';  readonly dayOfWeek: DayOfWeek;
      readonly opensAt: string; readonly closesAt: string }
  | { readonly kind: 'spans-local-days'; readonly startsOn: string; readonly endsOn: string }
  | { readonly kind: 'unknown-zone';    readonly ianaZone: string }
  | { readonly kind: 'malformed-hours'; readonly dayOfWeek: DayOfWeek };

/** ADR-0001 / GC-1. Reads reference data about one dealership and nothing about any booking. */
export function withinOpeningHours(
  interval: Interval,
  ianaZone: string,
  weekly: WeeklyOpeningHours,
): OpeningHoursVerdict;
```

**A verdict, not a boolean — three reasons, and the third is the load-bearing one.**

1. §5.2's `BookOutcome` already carries `{ kind: 'outside-opening-hours'; opens: string; closes: string }`.
   A boolean forces the application to re-derive those two fields, which means re-deriving the day of
   week, which means a second site of wall-clock reasoning and a QS-12 violation.
2. Fail-closed cases (`unknown-zone`, `malformed-hours`) need to be distinguishable from an ordinary
   refusal, or a configuration error is reported to a customer as *"we're closed"*.
3. **Mutation.** Stryker mutates string literals. A boolean function admits one assertion per case
   (`true`/`false`), so a mutant that returns the *right refusal for the wrong reason* survives. A
   verdict makes every branch's identity assertable. §10 names the specific mutants.

`withinOpeningHours` is deliberately **not** given the occupancy interval. ADR-0001 says *"the whole
derived interval"*, meaning the appointment. Today they are equal so no test can tell the two apart;
when A-4 changes, whether a cleanup buffer must also fit inside opening hours is a **new question**
and is recorded as OQ-01-1 in §11 rather than answered here by accident.

**`Intl` is a global, not an import — in letter and in spirit.** `domain-is-pure` forbids
*dependencies*; `Intl`, `Date`, `Map` and `Number` are ambient globals with no module specifier, so
`dependency-cruiser` has nothing to record and AC-6 is untouched in letter. In spirit the question is
whether the core can perform I/O or consult the database, because that is what GC-1 is about
(`.dependency-cruiser.js`'s own comment says so). `Intl.DateTimeFormat` reads ICU tables compiled into
the runtime; it opens no socket, touches no file at request time, and cannot learn what is booked. The
prohibition is intact. What `Intl` *does* introduce is a dependency on the host's ICU build — which is
why the design pins the locale (§4.1) and why §11 carries it.

---

## 3. How opening hours reach a pure core

The domain imports nothing and therefore cannot query. The hours are a **parameter**.

### 3.1 Absence, `null`, or an explicit marker — the three fail differently

| Shape | A day with no row | How it fails |
|---|---|---|
| Sparse `ReadonlyMap<number, DayHours>` | key absent | Under `noUncheckedIndexedAccess` the compiler forces a check, so the domain is safe — but the *assembler* can also produce a map missing a day it meant to include, and that bug is invisible: a lost row and a closed day are the same value |
| `Record<DayOfWeek, DayHours \| null>` | `null` **or** absent | **Two representations of closed.** The classic outcome is a handler for one and not the other |
| **7-slot tuple, `DayHours \| null`** | `null`, and only `null` | Absence is unrepresentable: the tuple's length is in the type, indexed by `DayOfWeek = 0..6`, so `weekly[day]` is exactly `DayHours \| null` with no `undefined`. The assembler cannot forget a day; the compiler will not let it |

**Ruled: the 7-slot tuple.** It also mirrors the table one-for-one — seven slots against
`CHECK (day_of_week BETWEEN 0 AND 6)`, index 0 against the column's `0 = Sunday`.

### 3.2 What the domain does with the day, and who parses `time`

`weekly[dayOfWeek]` is `null` → verdict `closed-day`. That is AC-4's rule, **stated in the domain**,
which is what AC-4 asks for (*"when any interval on that day is validated, then it is rejected"*).

The domain receives the `opens_at` / `closes_at` values **as the strings PostgreSQL's `time` type
yields** and parses them itself. This is not incidental: parsing `'09:00:00'` into a comparable
scalar is wall-clock reasoning, and AC-5 confines wall-clock reasoning to this file. If the assembler
parsed, QS-12 would be violated by the very code that feeds the module QS-12 protects.

The parser accepts `HH:MM` and `HH:MM:SS`, hours `00`–`24`, and normalises to seconds-of-day.
**`24:00:00` is accepted and maps to 86400**, because PostgreSQL's `time` admits it and
`CHECK (closes_at > opens_at)` permits `closes_at = '24:00:00'` — a dealership open until midnight is
legitimate reference data and a parser that rejects it would break a valid row. *(That PostgreSQL
accepts `24:00:00` in a `time` column is **assumed, not measured** in this design. It costs one branch
either way, and the branch is required regardless because rejecting it would be worse than accepting
it needlessly.)* Anything else — negative, out of range, non-numeric, `opensAt >= closesAt` — yields
`malformed-hours`. **Fail closed.** A booking gate that cannot read its own configuration must refuse.

### 3.3 Who assembles the tuple, and what this slice does not prove

Nobody, yet. `src/persistence/referenceRepository.ts` arrives at the slice that adds the booking path;
its job is `SELECT day_of_week, opens_at, closes_at FROM opening_hours WHERE dealership_id = $1`,
seeded into a seven-`null` tuple.

**So AC-4 is satisfied in this slice at the domain contract only.** The proposition *"a day with no
row is rejected end to end"* is not examined by anything slice 01 builds, because nothing in slice 01
reads a row. The mapping *no row → `null`* is the one place AC-4 can still be broken, it lives outside
this slice, and the slice that adds `referenceRepository` owes an acceptance test for it. Recorded in
§9.1 as a limit on QS-9's green, not glossed.

---

## 4. The DST design

### 4.1 The rule, stated once

> **Convert instant → local wall clock, never the reverse. Render both endpoints of the interval in
> the dealership's zone, then compare wall clock against that local day's window.**

Owned by `src/domain/openingHours.ts`. It appears nowhere else, and §7 is the test that keeps it so.

The direction is chosen because it is **total and single-valued**: every instant has exactly one
rendering in a zone. The reverse direction is neither — at a spring-forward, local 01:30 does not
exist; at a fall-back it happens twice — and a rule that converts that way has to answer questions
with no answer. This rule never asks them. That is §8.3's argument and this slice implements it
unchanged.

**The rendering.** One formatter per call:

```
Intl.DateTimeFormat('en-US', {
  timeZone: ianaZone, weekday: 'short', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(instant))
```

- The locale is **pinned to `'en-US'`, never `undefined`.** A pure function must not depend on the
  host's default locale, which is environment state.
- `hourCycle: 'h23'` rather than `hour12: false` — the latter has historically rendered midnight as
  `24`. **Measured** on this runtime: `2026-03-29T00:30:00Z` → `{hour:'00', minute:'30'}`.
- Day of week comes from the `weekday` part through an explicit seven-entry lookup
  (`Sun`→0 … `Sat`→6). **Measured:** `2026-03-28T08:30:00Z` → `Sat`, `2026-03-29T08:30:00Z` → `Sun`.
  The rejected alternative was hand-rolled calendar arithmetic (Zeller / days-from-civil): it puts a
  second calendar implementation inside the one module that must not be subtly wrong, and its mutants
  are killable only by a test that covers all seven days.
- An invalid zone throws. **Measured:** `new Intl.DateTimeFormat('en-US', {timeZone:'Nowhere/Bad'})`
  → `RangeError: Invalid time zone specified: Nowhere/Bad`. A pure domain function must not throw, so
  the construction is wrapped and yields `unknown-zone`.

### 4.2 The decision procedure, in a fixed order

The order is part of the design, because a mutant that reorders the checks is only killable if the
order is asserted:

1. Build the formatter for `ianaZone`; on `RangeError` → `unknown-zone`.
2. Render `interval.startsAt` and `interval.endsAt`. Each yields `{ localDate, secondsOfDay, dayOfWeek }`.
3. If `startsOn !== endsOn` (local calendar dates differ) → `spans-local-days`. §8.3: both endpoints
   must fall within **one day's** opening hours, so an interval crossing local midnight is rejected —
   no weekly schedule can contain it.
4. `weekly[startsOn.dayOfWeek]` is `null` → `closed-day`.
5. Parse `opensAt` / `closesAt`; on failure or `opens >= closes` → `malformed-hours`.
6. `opens <= startSeconds && endSeconds <= closes` → `within`; otherwise `outside-window`.

Step 6's second comparison is **inclusive on `closesAt`**: a job that ends exactly at closing time is
inside opening hours. ADR-0001's own example — *"starts twenty minutes before closing and runs an hour
past it is rejected"* — is the case this excludes, and inclusivity does not admit it.

### 4.3 Both transitions, and why the rule survives each

Every value below is **measured** on this runtime (node v24.18.0, full ICU, `Europe/London`), not
reasoned about.

**Spring forward — 2026-03-29, 01:00 UTC. Local jumps 00:59 → 02:00.**

| Instant | Renders | Against 09:00–17:00 |
|---|---|---|
| `2026-03-28T08:30:00Z` | `Sat 28/03 08:30` (GMT) | **rejected** |
| `2026-03-29T08:30:00Z` | `Sun 29/03 09:30` (BST) | **accepted** |

That is AC-2's amended worked pair, reproduced from measurement. The same UTC wall time, the same
window, opposite verdicts — which is the whole point, and which no amount of instant-only reasoning
would produce.

**AC-3, on the same night.** `2026-03-29T00:30:00Z` renders `00:30` local. Adding a 60-minute
duration on the **absolute** timeline gives `2026-03-29T01:30:00Z`, which renders **`02:30` local** —
measured. The bay is occupied for sixty real minutes and the wall clock shows two hours. That is
correct: `appointmentInterval` never touches a wall clock, and `withinOpeningHours` compares whatever
the wall clock says. Adjacent measurement, for the test-engineer: `00:59:00Z` → `00:59` local,
`01:01:00Z` → `02:01` local. The hour 01:00–01:59 local has no instant.

**Fall back — 2026-10-25, 01:00 UTC. Local 01:00–01:59 occurs twice.**

| Instant | Renders |
|---|---|
| `2026-10-25T00:30:00Z` | `Sun 25/10 01:30` (BST) |
| `2026-10-25T01:30:00Z` | `Sun 25/10 01:30` (GMT) |

**Two distinct instants render identically, and the rule gives them the same verdict.** That is not a
bug to be engineered around — it is the correct answer. The dealership's doors are either open at
01:30 local or they are not, and they are in the same state both times round. The ambiguity that
makes fall-back hard is an ambiguity of *local → instant*, and this rule never performs that
conversion. **The property test must assert this equality explicitly** (§5.2, P5), because "the
ambiguous hour" is the case a reviewer will look for and a silent green over it proves nothing.

A consequence worth stating so it is not read as a defect: on 25 October a dealership open
00:00–06:00 local is open for **seven** absolute hours, and on 29 March for **five**. The rule
produces that without knowing it, because it never counts hours.

---

## 5. `tests/property/opening-hours-dst.test.ts` — the property, and the generators

Test-engineer's file. This section specifies **what must hold** and **what must be generated**, not
how to write it.

### 5.1 The oracle must not be the implementation

The obvious property — *"the verdict equals what you get by rendering the endpoints with `Intl` and
comparing"* — is the implementation restated, and it passes for every mutant that changes both sides.
It must not be written.

**The oracle is a hand-written offset table valid over the generated range**, and it is independent
of the mechanism under test:

```
Europe/London, 2026:  UTC+0 (GMT)  before 2026-03-29T01:00:00Z
                      UTC+1 (BST)  from   2026-03-29T01:00:00Z  to  2026-10-25T01:00:00Z
                      UTC+0 (GMT)  from   2026-10-25T01:00:00Z
```

Both transition instants are **measured** above. The implementation consults ICU; the oracle consults
two constants. If they disagree, one of them is wrong, and that is a real property test.

Generation is confined to `Europe/London` and to 2026 precisely so the oracle can be this small and
this checkable. That is a deliberate narrowing of QS-9, which names that zone, and §9.1 records what
it therefore does not establish.

### 5.2 The properties

| | Property | Criterion |
|---|---|---|
| **P1** | For every generated instant `t` and duration `d`, `withinOpeningHours(appointmentInterval(instant(t), serviceDuration({durationMinutes:d})), 'Europe/London', W)` is `within` **if and only if** the oracle says both endpoints fall on the same local date, `W` has an entry for that local weekday, and `opens ≤ localStart ∧ localEnd ≤ closes` | AC-2, QS-9 |
| **P2** | For every `t` and `d`, `endsAt − startsAt === d × 60000` exactly — asserted on the instants, so it holds across both transitions by construction | AC-3 |
| **P3** | For every generated week `W` and every `t` whose local weekday `w` has `W[w] === null`, the verdict is `closed-day` with `dayOfWeek === w` | AC-4 |
| **P4** | An interval whose local end lands exactly on `closesAt` is `within`; the same interval one second later is `outside-window`. Same at `opensAt` | boundary |
| **P5** | The two measured fall-back instants `2026-10-25T00:30Z` and `2026-10-25T01:30Z` render the same local time and receive the **same** verdict under the same window | AC-2, "both transitions" |
| **P6** | An interval crossing local midnight is `spans-local-days`, and the equivalent interval one hour earlier is not | §8.3 |

P4 exists to name mutants rather than to add coverage: it is what kills Stryker's `EqualityOperator`
mutations of `opens <= startSeconds` → `opens < startSeconds` and `endSeconds <= closes` →
`endSeconds < closes`. Without a case that lands *exactly* on a boundary, both survive. (Those two
mutants are killed here in the outside-in suite, which does **not** feed the mutation score — §10
requires the implementer's unit tests to kill them again, and that duplication is deliberate.)

### 5.3 Generators — and the reason this is the hardest part of the slice

Uniform sampling over 2026 hits a transition hour with probability ≈ 2/8760 ≈ 0.00023 per draw. At
1000 runs the chance of touching **both** transitions is negligible. A property that passes because it
never looked at the interesting region is the exact shape the phase-4 retro names, and it would report
green over the one thing QS-9 exists to check.

**A stratified generator**, `fc.oneof` over four strata with the near-transition strata weighted:

| Stratum | Construction | What it guarantees |
|---|---|---|
| **S1** | `fc.constantFrom(T_spring, T_autumn)` + `fc.integer({min:-5400, max:5400})` seconds | Dense coverage of ±90 minutes around each transition — both sides, and the discontinuity itself |
| **S2** | the same two anchors + `fc.integer({min:-7, max:7})` days + `fc.integer({min:0, max:86399})` seconds | QS-9's *"days surrounding"* both transitions |
| **S3** | `fc.date` over 2026-01-01 … 2026-12-31, minute granularity | Breadth, including the long GMT and BST runs |
| **S4** | Instants chosen to land the *local end* exactly on `opensAt`/`closesAt` for the generated window | P4's boundary mutants |

`T_spring = 2026-03-29T01:00:00Z`, `T_autumn = 2026-10-25T01:00:00Z`.

Weekly hours are generated too — `fc.tuple` of seven `fc.option(...)` — so P3 is exercised against
many closed-day arrangements rather than one hand-picked week. Durations: `fc.integer({min:1,max:480})`.

**The coverage assertion, which is the non-negotiable part.** The strata are a claim about what the
test examined, and a claim about a mechanism has to be run. The test therefore **accumulates during
generation and asserts afterwards**:

- both UTC offsets (`+0` and `+60`) were observed among the generated instants;
- at least one sample fell strictly within one hour *before* and one *after* each of the two
  transition instants — four counters, each asserted `> 0`;
- at least one sample produced each of `within`, `closed-day`, `outside-window` and
  `spans-local-days`.

Without these, a wrong year, a wrong zone, a wrong anchor constant or an `fc.oneof` weight of zero
produces a confident green over an empty region. `fc.statistics` reports but does not assert, so it is
not a substitute. **These assertions must be present in the red commit**, and §8.2 explains why that
matters: they run and pass *before* any implementation exists, which is the only moment their own
correctness is observable in isolation.

Determinism: the run must be reproducible in CI. Either a fixed `seed` in `fc.assert`'s options, or a
random seed with the seed printed — but the coverage assertions above are what buy the exploration,
not the randomness, so a fixed seed costs nothing this design values. Test-engineer's call; the
coverage assertions are not.

---

## 6. The seam: how an outside-in test reaches a module with no boundary

### 6.1 The contradiction, which is mine

`.dependency-cruiser.js`'s `outside-in-tests-do-not-import-src` forbids
`tests/property/ → src/`. arc42 §10 maps QS-9 to `tests/property/opening-hours-dst.test.ts`, whose
subject is three pure functions with no HTTP or SQL surface. Both are phase-2 artifacts of mine, and
slice 01 is the first slice where they meet. Found by reading, which is the retro's Tier 2.

There is also a hard mechanical constraint underneath it. **Measured**, with the project's own
`tsc@6.0.3` and a tsconfig carrying the project's `compilerOptions`:

```
await import('./definitely-missing.js')
  → error TS2307: Cannot find module './definitely-missing.js'          exit 2

const s = new URL('../../dist/domain/openingHours.js', import.meta.url).href;
await import(s)
  → exit 0
```

`npm run typecheck` is a step of the `verify` job, and `red-proof` refuses a red commit whose `verify`
job did not conclude `success`. **So a static — or literal-dynamic — reference to a module that does
not exist yet cannot appear in the red commit at all.** Not as a style preference: it would fail the
criterion the red commit exists to satisfy.

### 6.2 The ruling: the property test loads the built artifact

Five options were live. ADR-0013 carries the full argument; the short form:

| | Option | Verdict |
|---|---|---|
| A | Widen `outside-in-tests-do-not-import-src` to allow `tests/property/ → src/domain/` | **Rejected.** It does not solve the problem — `tsc` still fails on the missing module at red — and it converts an absolute rule into a list, which is the failure mode `domain-is-pure`'s own comment warns about |
| B | Computed dynamic import of `src/domain/*.ts` | **Rejected.** It typechecks and `dependency-cruiser` cannot see it, which is precisely the objection: it obeys the rule's text by hiding from its mechanism |
| C | **Load `dist/domain/*.js`, the compiled artifact** | **Chosen** |
| D | Move the test to `tests/unit/` | **Rejected.** That is the implementer's directory (§5); the definition of *done* would be written by the role it is meant to check |
| E | Defer QS-9 to an HTTP-level property at a later slice | **Rejected.** It removes the slice's only executable evidence for its own headline criterion, and the DST rule would ship unexamined for several slices |

Option C is not a workaround for the rule; it is the convention this project already has. `npm start`
is `node dist/main.js`, and 00a's acceptance harness *"spawns the artifact a deployment would actually
run"*. A pure module's client is an importer, so the importing equivalent of spawning `dist/main.js`
is importing `dist/domain/openingHours.js`. The test-engineer never reads `src/` — `guard-paths.mjs`
denies it — and writes against §2's signature blocks. `.dependency-cruiser.js` is **not amended**, and
`outside-in-tests-do-not-import-src` stays absolute.

The loader, in shape:

```ts
async function loadDomain(name: string): Promise<Record<string, unknown> | null> {
  const specifier = new URL(`../../dist/domain/${name}.js`, import.meta.url).href;
  try { return (await import(specifier)) as Record<string, unknown>; } catch { return null; }
}
```

The specifier is computed **because of C1**, not to evade `dependency-cruiser`. Stating the motive
this way round matters: a literal would fail `verify` at the red commit, and the depcruise
consequence is a side effect of the fix, not its purpose.

**Costs, stated rather than discovered.**

- The loaded module is `any`. The compile-time contract is gone, and it is replaced by a **runtime
  shape assertion** — every expected export checked for presence and `typeof === 'function'`, with a
  message naming the export. At red that assertion *is* the failure, which is the better trade: a
  compile error says "no such file" to CI, a shape assertion says "`withinOpeningHours` is not
  exported from `dist/domain/openingHours.js`" to a person.
- It depends on the build being current. `npm test` has `pretest: npm run build`, so the CI path is
  covered. `npm run test:nodb` has no such hook: **`pretest:nodb` must be added** so the Docker-free
  path cannot run against a stale `dist`. npm runs `pre<name>` for any script name. That is a
  test-running concern and belongs in the red commit.
- One mechanical unknown, and it must be **verified before the red commit is pushed**, the way 00a
  verified per-project `globalSetup`: that Vitest's module runner honours a computed `file://` dynamic
  import of a plain `.js` file under `dist/`. If it does not, the documented fallbacks are
  `import(/* @vite-ignore */ specifier)` and `server.deps.external`. A design that assumed this would
  be making exactly the kind of claim this project stopped making at slice 00.

### 6.3 `tests/property/` splits by whether the property needs a database

`vitest.config.ts` currently puts `tests/property/**` in the `db` project, behind
`globalSetup: tests/setup/postgres.ts`. For this test that would start PostgreSQL to exercise three
functions that import nothing.

The cost is not the container time. It is that **a container failure turns this slice's red into a
`globalSetup` crash instead of assertion failures** — the precise trap slice 00's design was built to
avoid, and the thing C1's second clause is about. The red evidence for a pure-domain slice must not be
destroyable by a Docker hiccup.

**Ruled: split.** A property test that needs the database is named `*.db.test.ts` and runs in `db`;
everything else under `tests/property/` runs in `nodb`. Rejected alternatives: a `tests/property/db/`
subdirectory (the convention is then invisible in the filename and in `red-proof`'s failing-file list),
and paying the container cost (rejected on the C1 grounds above). Deciding now rather than at the slice
that adds QS-8's constraint-agreement property is cheap and stops that slice inheriting the question.

`vitest.config.ts` is **the test-engineer's file**; this is intent, not an edit. Two constraints on
whatever edit lands:

- a `*.db.test.ts` file must run in **exactly one** project — matching both `include` globs would run
  it twice, once without a container;
- Vitest's `exclude` **replaces** its defaults. If the `nodb` project gains one, it must spread
  `configDefaults.exclude` or `node_modules` and `dist` come back into collection.

Consequence worth having: after this, `npm run test:nodb` runs slice 01's entire outside-in surface
with no Docker at all.

The mutation config is **not** touched. `vitest.mutation.config.ts` stays `tests/unit/**` only, for the
reason it already documents — a test that cannot be affected by a mutant of `src/` raises the score
without killing anything. The property test loads `dist/`, which Stryker's sandbox may not rebuild, so
adding it would be that failure mode twice over.

---

## 7. `tests/architecture/ambiguity-containment.test.ts` — what makes a scan discriminating

Test-engineer's file. AC-5, QS-12.

A source scan that finds nothing because its glob was wrong reports the same green as a scan that
finds nothing because the tree is clean. Three mechanisms separate them, and all three must be
present.

### 7.1 The scanner is a function of a root directory

```
scanForMarkers(rootDir: string) → { marker: Marker, file: string }[]
```

Called once with the repository's `src/`, and once per fixture in §7.4. A scanner that can only look
at the real tree cannot be shown to work. This is `layering.test.ts`'s shape and it is copied
deliberately.

The root is resolved from `import.meta.url`, **never `process.cwd()`** — 00a lost a whole branch to
fixture paths taken as absolute against the local working directory, and it reported green.

### 7.2 The markers, mechanical enough that the test needs no judgement

| Marker | Matches | Permitted in |
|---|---|---|
| `duration-arithmetic` | the literal `60_000` or `60000`; an exported **definition** of `serviceDuration` or `durationMillis` | `src/domain/duration.ts` |
| `occupancy-interval` | an exported **definition** of `appointmentInterval`, `occupancyInterval`, or the type `Interval` | `src/domain/interval.ts` |
| `wall-clock-and-zone` | `Intl.DateTimeFormat` (any whitespace), or the identifiers `timeZone`, `ianaZone`, `time_zone` | `src/domain/openingHours.ts` |

Corpus: `src/**/*.ts`. Migrations are `.sql` and are therefore outside it — which is what keeps
`0002_reference_data.sql`'s `time_zone` column from being a false positive.

Definitions, not call sites: the application legitimately *calls* `serviceDuration`. Match
`^\s*export\s+(function|const|type)\s+<name>\b`. `60_000` and `Intl.DateTimeFormat` count anywhere,
because there is no legitimate reason for either outside its file.

`3600` and `60` in `openingHours.ts`'s seconds-of-day normalisation are **not** duration arithmetic —
they are wall-clock normalisation, which is that file's own concern. The marker is `60_000`
specifically, which is why §2.1 refuses to export the constant.

### 7.3 The corpus guard, which fails first

Before any assertion about violations, the test asserts what it examined:

- the corpus is non-empty; **and**
- it contains, **by name**, `src/main.ts`, `src/http/server.ts`, `src/http/routes/health.ts`,
  `src/application/checkHealth.ts`, `src/persistence/db.ts`, `src/platform/config.ts`, and the three
  new domain modules.

A count is not enough and 00a proved it: a guard counting modules overall was satisfied by `tests/`
while `src/` went unexamined behind a green gate. Named files close that.

### 7.4 The planted-violation control — for a discrimination claim, name the mutant

The scanner runs over three fixture trees built in a temp directory, each containing exactly one
planted violation, and each must be reported **by file and by marker**:

| Fixture | Planted file | Content |
|---|---|---|
| 1 | `src/http/routes/appointments.ts` | `new Intl.DateTimeFormat('en-GB', { timeZone: tz })` |
| 2 | `src/application/bookAppointment.ts` | `const endsAt = startsAt + minutes * 60_000;` |
| 3 | `src/persistence/appointmentRepository.ts` | `export function appointmentInterval(...)` |

Plus a **conforming negative control**: a fixture shaped like the real tree, with the three concepts in
their three permitted files, reporting zero. Without the negative control, a scanner that reports
everything passes all three positive cases.

### 7.5 The positive assertions, which are also the anti-vacuity guard

For each marker: **exactly one** file matches, and it is the permitted one.

`exactly one`, not `at most one`. With `src/domain` empty, *"the marker appears only in
`duration.ts`"* is vacuously true — the classic green over nothing. Requiring a match makes the
assertion fail at the red commit with *"expected exactly one file under `src/` to construct an
`Intl.DateTimeFormat` with a `timeZone`; found 0"*, which is a real assertion failure about a real
acceptance criterion. The guard against vacuity and the red are the same mechanism, which is the
cheapest possible arrangement.

---

## 8. The red commit

### 8.1 What it contains

One commit, `test(01): ... (red)`, test-engineer, touching only:

- `tests/property/opening-hours-dst.test.ts`
- `tests/architecture/ambiguity-containment.test.ts`
- `vitest.config.ts` (the project split, §6.3)
- `package.json` (`pretest:nodb`, §6.2)

No file under `src/`, so C2's ownership-zone check is untouched.

### 8.2 What passes, and why that is the interesting half

| Runs at red | Outcome |
|---|---|
| `npm run typecheck` | **passes** — measured: the computed specifier does not resolve at compile time, §6.1 |
| `npm run lint:arch` | **passes** — no `tests/property/ → src/` edge exists to violate |
| `npm run build` | **passes** — `tsconfig.build.json` includes only `src`, which has no domain files to fail on |
| the scanner's four fixture cases (§7.4) | **pass** — they test the scanner against fixtures, not against `src/` |
| the property test's generator-coverage assertions (§5.3) | **pass** — the oracle and the strata need no implementation |
| `tests/unit/**` | **passes** — nothing is added to it |

So `verify` concludes `success` and no unit test fails: `red-proof`'s two preconditions hold.

**And both anti-vacuity mechanisms are observed working at the moment the tree is non-conforming.**
The scanner reports the plant it was given and reports `src/` as missing all three markers, in the
same run. The generator demonstrates it reached both transitions before any function exists to be
fooled by. That is the strongest position either mechanism will ever be in, and it is available only
in the red commit.

### 8.3 What fails, and why it is an assertion failure

| Assertion | Message shape |
|---|---|
| contract | `dist/domain/openingHours.js did not load, or does not export withinOpeningHours` |
| P1–P6 | not reached — gated behind the contract assertion, so one cause produces one class of failure |
| §7.5 × 3 | `expected exactly one file under src/ to match <marker>; found 0` |

Every one is an `AssertionError` raised inside a collected test body. There is no import error, no
collection error and no hook error, because:

1. **Nothing is statically imported from `src/`.** Measured, §6.1.
2. **Nothing this slice's tests need is behind `globalSetup`.** §6.3 moved them out of the `db`
   project, so a container failure cannot convert this evidence into a crash.
3. **The module load is inside a `try` in a test body**, so "the file is not there yet" is a value the
   test asserts on, not an exception the runner reports.

That is C1's *"a real assertion failure rather than a missing import"*, satisfied structurally — the
same way slice 00 satisfied it by ruling that `beforeAll` may only connect.

**The verification owed before the commit is pushed** is §6.2's mechanical unknown, and it is the only
one. Slice 00 and 00a both ended up recording that a stated mechanism nobody ran is not a mechanism;
this design names the run rather than assuming the outcome.

---

## 9. QS-9 and QS-12 — what this slice makes true, and what it does not

### 9.1 QS-9 — opening hours across a DST transition

**Made true.** The accept/reject decision, over generated instants on both sides of both 2026
transitions in `Europe/London`, against an oracle independent of the implementation's mechanism
(§5.1); AC-2's amended worked pair, from measurement; AC-3's absolute-duration case; the fall-back
ambiguous hour, asserted rather than assumed (P5); the boundary cases that kill the comparison
mutants (P4); and — the part that makes the rest mean anything — an asserted proof that the generator
reached those regions (§5.3).

**Not made true, and no green here should be read as saying otherwise.**

- **Nothing is read from PostgreSQL.** The weekly hours are constructed by the test. The proposition
  *"the DST rule works against real `opening_hours` rows"* is untouched, and so is AC-4's end-to-end
  form (§3.3). Owed by the slice that adds `referenceRepository`.
- **No HTTP path exists**, so the mapping from `outside-window` to ADR-0001's `400` is not exercised.
- **One zone, one year.** Generation is confined to `Europe/London` in 2026 so the oracle can be two
  constants. Zones with sub-hour offsets, southern-hemisphere transitions, and zones whose rules
  changed are outside what this slice examines. That is a deliberate narrowing of a scenario that
  itself names only `Europe/London`, recorded so the narrowing is visible rather than inferred.

### 9.2 QS-12 — ambiguity containment

**Made true.** The three markers each resolve to exactly one file; the scan is shown to fire against
three planted violations and to stay silent on a conforming tree; the corpus it examined is asserted
by name.

**Not made true.**

- **QS-12's response measure — *"one source file plus one migration"* — is not measured by anything
  in this slice.** Slice 01 establishes the *named concepts* that would make it so. Whether adding a
  buffer is really one file plus one migration would be established by adding one, which nobody is
  doing. **Assumed, not measured**, and it stays that way until A-4 is actually revised.
- **The tree is nearly empty of things that could violate the rule.** There is no
  `referenceRepository`, no booking route, no availability query. Today's green is over a small
  corpus; the scan's value accrues at the slices that add those, which is exactly why it is committed
  now rather than then.
- `occupancyInterval` exists and is exported but has no production call site until the booking path
  lands (§2.2). A named identity function nobody calls is one refactor away from being deleted as dead
  code; `no-orphans` will not catch it because the module is imported.

---

## 10. Notes for the implementer — the first real mutation score

Stryker mutates `src/**/*.ts` via the command runner and runs **`tests/unit/**` only**. Neither test
this slice specifies contributes to the score. Three small pure modules are densely mutable, and 0.75
is the gate.

The survivors to expect, named so they can be aimed at rather than discovered:

| Mutant | Killed by |
|---|---|
| `opens <= startSeconds` → `opens < startSeconds` | a unit test whose local start lands **exactly** on `opensAt` |
| `endSeconds <= closes` → `endSeconds < closes` | a unit test whose local end lands **exactly** on `closesAt` |
| `startsOn !== endsOn` → `startsOn === endsOn` (§4.2 step 3) | a same-day case *and* a crossing-midnight case |
| each verdict's `kind` string literal | one assertion per verdict on `kind`, not on truthiness — the reason §2.3 chose a union |
| `durationMillis`: `* 60_000` → `/ 60_000`, and the literal itself | any duration whose product is asserted exactly |
| `serviceDuration`'s `> 0` → `>= 0`, and its integer check | a `0` case and a fractional case |
| `instant()`'s finiteness / integer checks | `NaN`, `Infinity`, and a fractional millisecond case |
| the seven-entry weekday lookup | seven cases, one per day — or the lookup shrinks to a table a single mutant survives |
| `occupancyInterval` body → `{}` / identity variants | an assertion that it returns an interval **equal in both fields** to its argument. This one is the likeliest survivor in the slice: an identity function is hard to mutate detectably, and asserting only its type kills nothing |

The order of §4.2's checks is behaviour, not style: a unit test that only ever supplies well-formed
input cannot distinguish step 4 from step 5, and the reordering mutants survive.

---

## 11. Assumptions, open questions and findings

### Assumptions taken by this design

| id | Assumption | If wrong |
|---|---|---|
| **DA-1** | Intra-`src/domain` type imports satisfy AC-6, because `domain-is-pure` does not fire on them and the literal reading makes AC-5 and AC-6 jointly unsatisfiable (§2.0) | A DCR at step 2; the human rules on AC-6, and the fallback is duplicated structural types, which is worse |
| **DA-2** | PostgreSQL's `time` admits `24:00:00`, so the parser accepts it (§3.2) | One branch is dead. It is cheaper than the alternative error |
| **DA-3** | Vitest's module runner honours a computed `file://` dynamic import of `dist/**.js` (§6.2) | **Must be verified before the red commit.** Fallbacks named in §6.2 |
| **DA-4** | The `pg` driver returns a `time` column as a string, which is why `DayHours` holds strings (§2.3) | The assembler adapts; the domain contract does not change. Nothing in slice 01 depends on it, since nothing queries |

### Open questions — recorded, not resolved

- **OQ-01-1.** When A-4 is revised and a buffer exists, must the **occupancy** interval also fall
  inside opening hours, or only the appointment interval? ADR-0001 says *"the whole derived
  interval"*, written when the two were the same thing. Today no test can tell them apart.
  `withinOpeningHours` takes the appointment interval; the question is deferred, not answered.
- **OQ-01-2.** See F-01-2 below: AC-5's `time_zone` clause needs a reading before
  `referenceRepository` lands. It is an acceptance criterion, so the reading is the human's.

### Findings raised by this design

- **F-01-1 — arc42 §10 QS-9 still carries the wording the human corrected in AC-2.** QS-9 reads
  *"the instant that is 08:30 local but 09:30 UTC"* — the same transposition O-13 ruled a defect on
  2026-09-04, in the same words, in a document I own. The human's ruling settles the substance; §12.1
  proposes the corresponding §10 edit at step 7. **Severity: minor** — no test was written against it
  and no code depends on it — but it is a document contradicting a ruling, which is the retro's Tier 2,
  and it was found by reading the two side by side.
- **F-01-2 — AC-5's `time_zone` clause and `referenceRepository` will collide.** AC-5 confines *"use
  of a dealership's `time_zone`"* to `openingHours.ts`. `src/persistence/referenceRepository.ts` must
  `SELECT` that column. Slice 01 is unaffected (nothing queries, and migrations are `.sql`, outside the
  scan's corpus), so **no exception is built now** — an allowlist over an empty set is a mechanism
  nobody ran. The reading I would propose is that a column name in a repository is *transport* and a
  zone reaching wall-clock reasoning is *use*. AC-5 is the human's, so the reading is put at the slice
  where it bites, not resolved here.

---

## 12. Proposed arc42 edits and the ADR

### 12.1 arc42, for step 7 — as-built, not as-designed

| Section | Edit |
|---|---|
| **§5.2** | Correct *"It imports nothing at all — no other module, no npm package, no `node:` builtin"* to *"no module outside `src/domain`, no npm package, no `node:` builtin"*, with §2.0's reason (AC-5 and AC-6 are otherwise jointly unsatisfiable) and the note that `import type` edges are visible to the cruise under `tsPreCompilationDeps`. Update the `interval.ts` / `duration.ts` / `openingHours.ts` rows to the as-built signatures, including that `withinOpeningHours` returns a verdict union rather than a boolean, and why. Extend the *As built* subsection with a `src/domain` row — it stops being empty at this slice, which §5.2 predicted |
| **§8.3** | Add the measured DST facts: the two 2026 transition instants, AC-2's amended pair, AC-3's `00:30 → 02:30`, and the fall-back pair that renders identically. Add §4.2's fixed decision order, and the note that a fall-back day is legitimately longer in absolute terms than the wall clock says. Record the locale pin and `hourCycle: 'h23'` as measured constraints on the rendering |
| **§8.5** | Record ADR-0013: outside-in tests reach a pure module through the built artifact, and `tests/property/` splits by database need. This is the section that already draws the line §2.2 of `CLAUDE.md` protects, and this ruling sits beside it |
| **§10** | **F-01-1**: correct QS-9's illustrative pair to the human's O-13 wording. Narrow QS-9's *"generated instants"* clause to record what the test actually generates (§9.1). Add to QS-12 that the response measure is assumed, not measured (§9.2) |
| **§11** | ADR-0013 as `status: proposed` is a debt item and appears in the generated table. Add: `occupancyInterval` has no production call site until the booking path (§9.2); QS-12's corpus is nearly empty at this slice; QS-9 examines one zone and one year; and the ICU dependency the `Intl` global introduces |
| **§12** | The glossary entries below |

**§12 glossary — proposed entries.** Note the ownership: §12's header reads *"Owner: scribe"*, and the
scribe's brief names §12 explicitly, while `CLAUDE.md` §4 puts `docs/arc42/` under the architect. This
design **proposes wording** and does not assume it applies it; the orchestrator dispatches.

| Term | Proposed meaning |
|---|---|
| **Instant** | A point on the absolute timeline, stored as `timestamptz` and carried in the domain as epoch milliseconds. Has exactly one rendering in any zone (A-8) |
| **Appointment interval** | The half-open span `[startsAt, endsAt)` derived from a requested start and the service type's duration. The customer-facing interval (AC-1, A-1) |
| **Occupancy interval** | The span the exclusion constraint compares. Today identical to the appointment interval, and that identity is the statement that there is no buffer (A-4) |
| **Local rendering** | An instant expressed as a wall-clock date, time and weekday in a dealership's IANA zone. The conversion runs this way only (§8.3) |
| **Opening hours** | Per dealership and per day of week, in the dealership's local wall clock. **A day with no row is a closed day**, not an unbounded one (AC-4) |
| **Closed day** | A weekday for which a dealership has no `opening_hours` row; represented in the domain as `null` in the weekly tuple |
| **Absolute duration** | Minutes added on the timeline, not the wall clock. Sixty minutes from 00:30 local on a spring-forward night ends at 02:30 local (AC-3) |
| **Wall-clock duration** | What a clock on the wall shows between two instants. Differs from the absolute duration across a transition, and is **not** what occupies a bay |
| **Ambiguous local time** | A wall-clock time that occurs twice, on a fall-back night. Ambiguous only for local → instant; this system never performs that conversion |

### 12.2 ADR-0013

Drafted as `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md`, `status: proposed`,
following ADR-0012's convention: the architect proposes at step 1 and the human ratifies at the gate.
It carries the five options of §6.2, both clauses (the built artifact, and the property-test split),
and the costs of §6.2 in full.

It is put to the gate rather than taken unilaterally because, while testability is architecture, this
changes what *outside-in* means operationally for every later property test — and the ownership of the
test directories was itself a human ruling at Gate B.

---

## 13. What step 2 should argue about

Objections are cheap here and expensive at step 5. The three worth pressing:

1. **DA-1** — does the test-engineer or implementer read AC-6 as forbidding intra-domain imports? If
   so it is a DCR to the human, and better raised now than after three modules exist.
2. **§6.2's option C** — is loading `dist/` a legitimate outside-in boundary, or is it option B with
   extra steps? The distinction this design rests on is that `dist/` is the published artifact and
   `src/` is not. If the test-engineer disagrees, option E (defer QS-9) is the next best and the cost
   is naming it now.
3. **§5.3's coverage assertions** — the test-engineer owns the file and may have a better mechanism
   than accumulate-and-assert. The mechanism is negotiable; a property test that cannot demonstrate
   what it examined is not.
