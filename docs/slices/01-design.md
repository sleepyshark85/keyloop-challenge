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
| 2 | Do the three domain modules import each other? | **No. AC-6 is literal — ruled by the human on 2026-09-05.** The three modules exchange primitives and `src/application` composes them. §2.0 |
| 3 | How do opening hours reach a pure core? | A **7-slot tuple indexed by `day_of_week`**, `null` for a closed day. Absence is unrepresentable. §3 |
| 4 | Who owns the DST rule? | `openingHours.ts`, stated **once**, as *render both endpoints, then compare wall clock*. §4 |
| 5 | How does an outside-in property test reach a module with no boundary? | Through the **built artifact** `dist/domain/*.js`, loaded at runtime. `.dependency-cruiser.js` is **not** amended. §6, ADR-0013 |
| 6 | Does `tests/property/` pay the container cost? | **No — it splits.** `*.db.test.ts` runs in the `db` project; everything else under `tests/property/` runs in `nodb`. §6.3 |
| 7 | Does the project split protect the red on its own? | **No, and claiming it did was this design's defect.** It also takes an invocation split, built as orchestrator tooling before step 3. §6.4, §8.3 |
| 8 | How does the red stay an assertion failure? | Measured: a **literal** dynamic-import specifier fails `tsc` and therefore fails `verify`; a **computed** one does not. §8 |

**This design was amended on 2026-09-05 after step 2**, under two human rulings and one ruling of my
own on a defect the test-engineer measured in it. §13 records what step 2 produced, including the two
places where a reviewer was right and I was wrong. F-01-1 was corrected at step 1 and is no longer
outstanding; **F-01-2** (AC-5's `time_zone` clause collides with `referenceRepository` at a later
slice) is still open and still the human's. §11.

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

### 2.0 They import nothing, including each other — AC-6 is literal, by the human's ruling

**Ruled by the human on 2026-09-05: AC-6 means what it says.** `src/domain` imports nothing at all,
intra-domain imports included. The human ruled it with the architectural cost in front of them —
§11's debt entry is that cost, quoted to them from the architect's own step-2 reply and accepted
rather than argued away.

**Consequently arc42 §5.2 line 40 stands unamended.** It reads *"It imports nothing at all — no other
module, no npm package, no `node:` builtin"*, and it is now ratified rather than corrected. The
step-1 draft of this design proposed to amend it, and that proposal is **withdrawn**, not deferred.

**What the step-1 draft got wrong, recorded rather than quietly replaced.** It claimed AC-5 and AC-6
were *"jointly unsatisfiable"* under a literal reading. That claim was false, the test-engineer said
so at step 2, and it was overstated in a document that instructs other roles not to assert mechanisms
they have not checked. The implementer argued the same side I did — that `appointmentInterval` must
convert minutes to milliseconds, so `interval.ts` must either import `durationMillis` or re-derive
`* 60_000`, and *"there is no third path"*. **There is a third path, and the test-engineer named it:**
change the signature so the conversion happens *before* the call. The application converts, then
passes a plain millisecond count. No import, no duplicated arithmetic, AC-5 intact. The exhaustiveness
claim had enumerated two responses to a real call site and called it a proof.

The honest form of what I should have written, and the shape this design now takes:

> A literal AC-6 is satisfiable, at the cost of exchanging unbranded primitives across every
> inter-module boundary inside the domain. That is a trade-off, and a real one — not an impossibility.

So the three modules compose through `src/application`, which imports all three (an edge *into* the
domain, which `domain-is-pure` does not govern — it constrains edges *from* `^src/domain/`). The
domain's own dependency list is empty, `depcruise` reports zero `domain-is-pure` violations, and there
is nothing for `tsPreCompilationDeps` to catch because there is no `import type` to erase.

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

**The brand survives, shrunk — and this was the call the coordinator left to me.** Under a literal
AC-6 a brand cannot cross a domain module boundary, so the choice was to delete the brands or keep
them as per-module input validation. **Kept, for two reasons and one non-reason.**

- `DurationMinutes` still protects `durationMillis`'s *input*: `src/application` may import the type
  (an edge into the domain, permitted) and therefore cannot hand `durationMillis` a raw number it did
  not obtain from `serviceDuration`. That is a real guarantee at a real boundary.
- Deleting the brand would delete the smart constructor's return type, and with it the compiler's
  insistence that the `null` branch be handled at every call site. That is the part of the brand that
  was doing the most work, and it is entirely intra-module.
- The non-reason: it does **not** protect the handoff into `appointmentInterval`, which is the
  boundary the brand was introduced for. `interval.ts` cannot name `DurationMinutes`, so that
  parameter is a bare `number`. A brand that cannot cross the boundary it was designed to guard is
  doing a fraction of its original job, and §11 says so rather than letting the surviving fragment
  imply the whole guarantee.

### 2.2 `src/domain/interval.ts` — which instants

```ts
// NO IMPORTS. Not even from ./duration.js — AC-6 is literal (§2.0).

/** An instant, as epoch milliseconds (A-8). Branded; the constructor is the only way in. */
export type Instant = number & { readonly __brand: 'Instant' };

/** THE ONLY CONSTRUCTOR. Returns null for NaN, Infinity, or a non-integer millisecond value. */
export function instant(epochMillis: number): Instant | null;

/** Half-open [startsAt, endsAt), matching the tstzrange the constraint compares (§8.2). */
export type Interval = { readonly startsAt: Instant; readonly endsAt: Instant };

/**
 * AC-1 / A-1. TOTAL. The end is derived; no client-supplied end is consulted and there is no
 * parameter for one.
 *
 * `durationMillis` is a BARE number, not a branded DurationMinutes, because this module may not
 * import duration.ts. The caller converts first — src/application, which may import both.
 * That unbranded parameter is the price of a literal AC-6 and is carried in §11.
 */
export function appointmentInterval(startsAt: Instant, durationMillis: number): Interval;

/**
 * A-4 — "the interval the constraint sees". TODAY THE IDENTITY, and that identity IS the
 * statement that there is no buffer. A buffer changes this function and the constraint's range
 * expression, and nothing else.
 */
export function occupancyInterval(interval: Interval): Interval;
```

**`Instant` stays branded, and here the brand still crosses everything it needs to**, because
`instant()`, `Interval` and `appointmentInterval` all live in this file. The literal AC-6 ruling costs
this module exactly one unbranded parameter — `durationMillis` — and nothing else.

**Two smart constructors, then total functions.** `instant()` and `serviceDuration()` are the only
places a raw number becomes a domain value, and they are the only places that return `null`.
Everything downstream is total. The alternative — every function returning `T | null` — spreads the
same check across five call sites and gives four more places to get it wrong.

**The composition, which now lives outside the domain.** `src/application` does:

```
serviceDuration(st)  ->  durationMillis(d)  ->  appointmentInterval(instant(ms), millis)
                                            ->  withinOpeningHours(iv.startsAt, iv.endsAt, zone, weekly)
```

That ordering used to be expressed by the types and is now expressed by a use case. §11 carries what
that costs.

**`occupancyInterval` returning its argument is the point, not a placeholder.** §5.2 already argues
this; what this slice adds is that it is *called*, so that when A-4 turns out to be wrong the call
sites already exist. A named identity function that nobody calls would be the same as no function at
all. **The implementer must route interval construction through it at the point the constraint's
range is derived** — which is a later slice; in slice 01 the only caller is the test suite. Recorded
as a limitation in §9.2 rather than claimed as satisfied.

### 2.3 `src/domain/openingHours.ts` — the only wall clock in the system

```ts
// NO IMPORTS. Not even the Interval type — AC-6 is literal (§2.0), so the interval arrives
// as its two endpoints.

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
  | { readonly kind: 'malformed-hours'; readonly dayOfWeek: DayOfWeek }
  // Added by the literal AC-6 ruling. See below: this variant exists ONLY because the type
  // that used to carry "ordered, and from the same interval" cannot cross the boundary.
  | { readonly kind: 'malformed-interval' };

/**
 * ADR-0001 / GC-1. Reads reference data about one dealership and nothing about any booking.
 *
 * Takes two bare millisecond values rather than an Interval, because this module may not import
 * interval.ts. An Instant is assignable to number, so a caller holding an Interval passes
 * `iv.startsAt, iv.endsAt` and the brand degrades gracefully rather than needing a cast.
 */
export function withinOpeningHours(
  startsAtMillis: number,
  endsAtMillis: number,
  ianaZone: string,
  weekly: WeeklyOpeningHours,
): OpeningHoursVerdict;
```

**The literal AC-6 ruling has one measurable cost right here, and it is worth naming precisely
because it is small enough to be checked.** The `Interval` type carried two guarantees that a pair of
`number` parameters does not: that the two values are ordered, and that they came from the same
interval. The first is recoverable by a runtime check; the second is not recoverable at all. So the
verdict union gains a seventh variant, `malformed-interval`, covering a non-finite or non-integer
endpoint and `endsAtMillis <= startsAtMillis`. It is fail-closed, directly unit-testable, and it
would not exist under the other reading of AC-6. That is the whole delta, and §11 records it as a
consequence of a ruling rather than as a defect.

**A verdict, not a boolean — three reasons, and the third is the load-bearing one.**

1. §5.2's `BookOutcome` already carries `{ kind: 'outside-opening-hours'; opens: string; closes: string }`.
   A boolean forces the application to re-derive those two fields, which means re-deriving the day of
   week, which means a second site of wall-clock reasoning and a QS-12 violation.
2. Fail-closed cases (`unknown-zone`, `malformed-hours`) need to be distinguishable from an ordinary
   refusal, or a configuration error is reported to a customer as *"we're closed"*.
3. **Mutation.** Stryker mutates string literals. A boolean function admits one assertion per case
   (`true`/`false`), so a mutant that returns the *right refusal for the wrong reason* survives. A
   verdict makes every branch's identity assertable. §10 names the specific mutants.

`withinOpeningHours` is deliberately **not** given the occupancy interval's endpoints. ADR-0001 says
*"the whole derived interval"*, meaning the appointment. Today they are equal so no test can tell the
two apart;
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

The parser accepts `HH:MM` and `HH:MM:SS` in the range **`00:00:00`–`23:59:59`, plus the single exact
value `24:00:00`**, and normalises to seconds-of-day (`24:00:00` → 86400).

**That range is measured, and the measurement made the spec tighter rather than merely confirming
it.** The step-1 draft said *"hours `00`–`24`"* and labelled PostgreSQL's acceptance of `24:00:00` as
assumed. The implementer measured it at step 2 against a real `postgres:16-alpine`: `'24:00:00'::time`
is accepted and round-trips, while `24:00:01` and `24:30:00` are **rejected by PostgreSQL itself**. So
the draft's range was wrong in the permissive direction — it would have accepted `24:30`, a value the
column cannot hold. Narrowing to one exact value **removes a branch reachable only by data that cannot
exist**, which is worth more than the assumption it discharged: an unreachable branch is an unkillable
mutant, and this slice's mutation score is the first that is a real number.

`24:00:00` must be accepted rather than rejected as a tidy-looking simplification, because
`CHECK (closes_at > opens_at)` permits `closes_at = '24:00:00'` and a dealership open until midnight
is legitimate reference data. Anything else — negative, out of range, non-numeric, `opensAt >=
closesAt` — yields `malformed-hours`. **Fail closed.** A booking gate that cannot read its own
configuration must refuse.

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

1. **`startsAtMillis` and `endsAtMillis` are finite integers and `endsAtMillis > startsAtMillis`;
   otherwise → `malformed-interval`.** First, because it is pure arithmetic and because everything
   after it would otherwise be handed a value `new Date(...)` cannot render — a non-finite endpoint
   makes `formatToParts` throw, and a pure function must not throw. This step exists only because of
   the literal AC-6 ruling (§2.3).
2. Build the formatter for `ianaZone`; on `RangeError` → `unknown-zone`.
3. Render both endpoints. Each yields `{ localDate, secondsOfDay, dayOfWeek }`.
4. If `startsOn !== endsOn` (local calendar dates differ) → `spans-local-days`. §8.3: both endpoints
   must fall within **one day's** opening hours, so an interval crossing local midnight is rejected —
   no weekly schedule can contain it.
5. `weekly[startsOn.dayOfWeek]` is `null` → `closed-day`.
6. Parse `opensAt` / `closesAt`; on failure or `opens >= closes` → `malformed-hours`.
7. `opens <= startSeconds && endSeconds <= closes` → `within`; otherwise `outside-window`.

Step 7's second comparison is **inclusive on `closesAt`**: a job that ends exactly at closing time is
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
| **P1** | For every generated instant `t` and duration `d`, composing the domain the way `src/application` will — `iv = appointmentInterval(instant(t), durationMillis(serviceDuration({durationMinutes:d})))`, then `withinOpeningHours(iv.startsAt, iv.endsAt, 'Europe/London', W)` — yields `within` **if and only if** the oracle says both endpoints fall on the same local date, `W` has an entry for that local weekday, and `opens ≤ localStart ∧ localEnd ≤ closes` | AC-2, QS-9 |
| **P2** | For every `t` and `d`, `endsAt − startsAt === d × 60000` exactly — asserted on the instants, so it holds across both transitions by construction | AC-3 |
| **P3** | For every generated week `W` and every `t` whose local weekday `w` has `W[w] === null`, the verdict is `closed-day` with `dayOfWeek === w` | AC-4 |
| **P4** | An interval whose local end lands exactly on `closesAt` is `within`; the same interval one second later is `outside-window`. Same at `opensAt` | boundary |
| **P5** | The two measured fall-back instants `2026-10-25T00:30Z` and `2026-10-25T01:30Z` render the same local time and receive the **same** verdict under the same window | AC-2, "both transitions" |
| **P6** | An interval crossing local midnight is `spans-local-days`, and the equivalent interval one hour earlier is not | §8.3 |
| **P7** | A reversed or non-finite endpoint pair yields `malformed-interval`, and a well-formed one never does | §2.3, literal AC-6 |

P4 exists to name mutants rather than to add coverage: it is what kills Stryker's `EqualityOperator`
mutations of `opens <= startSeconds` → `opens < startSeconds` and `endSeconds <= closes` →
`endSeconds < closes`. Without a case that lands *exactly* on a boundary, both survive. (Those two
mutants are killed here in the outside-in suite, which does **not** feed the mutation score — §10
requires the implementer's unit tests to kill them again, and that duplication is deliberate.)

P7 is new at the amendment and exists for the same reason P4 does: the literal AC-6 ruling added a
branch, and a branch nobody targets is a surviving mutant. It is also the one property that would not
exist under the other reading, which makes it the cheapest available check that the ruling was in fact
applied rather than nodded at.

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
- samples fell strictly within one hour *before* and one *after* each of the two transition
  instants — four counters;
- each of `within`, `closed-day`, `outside-window`, `spans-local-days` and `malformed-interval` was
  produced at least once.

**Each counter is asserted against a minimum count, not against `> 0`, and the step-1 draft was wrong
to specify `> 0`.** The test-engineer measured it: **a bare `> 0` floor passes about 29% of the time
under a deliberately broken stratified generator.** A guard with a 29% false-pass rate is not a guard;
it is the same class of defect it was put there to catch, which makes this a defect in the step-1
design rather than a refinement of it. The threshold must be sized so that reaching it from the
*remaining* strata alone is negligible — with `numRuns` N and stratum weight w the expected count is
about N·w, so a floor at a small fraction of N·w fails reliably when a stratum contributes nothing
while staying far from the noise. The test-engineer sizes it; what is not negotiable is that the floor
is a computed minimum rather than one.

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
- It depends on the build being current, and **`pretest:nodb` is still required.** This bullet said
  otherwise for the length of one commit, and the correction is worth keeping visible rather than
  tidying away. The amendment claimed `tools/ci/run-tests.mjs` *"owns the build before both
  invocations"*, superseding the step-1 requirement. Checked against the tool as it actually landed in
  `c328d84`, that is false: `run-tests.mjs` spawns `vitest` twice and never builds. The build is still
  `"pretest": "npm run build"`, which fires for `npm test` and for nothing else, while
  `"test:nodb": "vitest run --project nodb"` remains a bare invocation. So the Docker-free path — the
  one §6.3 exists to make usable — can still run against a stale or absent `dist/`, which for a suite
  that loads `dist/domain/*.js` means a false red or a false green depending on what is lying there.

  **The requirement stands as first written:** `"pretest:nodb": "npm run build"`. It is one line, npm
  runs `pre<name>` for any script name, and `package.json` is the orchestrator's this round — so this
  is a flag, not an edit.

  Recording the shape, because it is the third instance in this slice and the second by me: I wrote
  that a mechanism owned a responsibility, on the strength of what the tool was *for* rather than what
  it *does*, in the paragraph of a design that had just been amended for exactly that error. Naming a
  mechanism's capability instead of its configuration does not stop being tempting once you have
  written the rule against it.
- The one mechanical unknown this design carried is now **measured**, before the red commit rather
  than after it, the way 00a measured per-project `globalSetup`. Run by the orchestrator:
  `pathToFileURL(resolve('dist/domain/_spike.js')).href` fed to `await import(...)` typechecks clean
  **and Vitest executes it** — two tests passed under `vitest run --project nodb`, one of them
  asserting that a computed import of a *missing* `dist/` module rejects at runtime rather than at
  compile time, which is the exact behaviour §8.3 depends on. The control ran too: with a literal
  `await import('../../src/domain/duration.js')` present, `npm run typecheck` exits 2 with
  `TS2307: Cannot find module`; remove it and typecheck is clean again. So both halves of §6.1's claim
  are measured on this runtime, not inferred from one another. The fallbacks
  `import(/* @vite-ignore */ specifier)` and `server.deps.external` are recorded as unneeded.

### 6.3 `tests/property/` splits by whether the property needs a database

`vitest.config.ts` currently puts `tests/property/**` in the `db` project, behind
`globalSetup: tests/setup/postgres.ts`. For this test that would start PostgreSQL to exercise three
functions that import nothing.

The cost is not the container time. It is that a container failure turns this slice's red into a
`globalSetup` crash instead of assertion failures — the precise trap slice 00's design was built to
avoid, and the thing C1's second clause is about. The red evidence for a pure-domain slice must not be
destroyable by a Docker hiccup.

**The step-1 draft then claimed this split was sufficient, and that claim was false.** §6.4 is the
correction, and it is not a footnote: without it the ruling below buys a Docker-free *capability* that
nothing in CI ever invokes.

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
with no Docker at all — **a capability, which §6.4 is about turning into a configuration.**

The mutation config is **not** touched. `vitest.mutation.config.ts` stays `tests/unit/**` only, for the
reason it already documents — a test that cannot be affected by a mutant of `src/` raises the score
without killing anything. The property test loads `dist/`, which Stryker's sandbox may not rebuild, so
adding it would be that failure mode twice over.

### 6.4 The project split is necessary and was never sufficient — T-01-2, ruled (c)

**The defect, and it was mine.** The step-1 draft's §8.3 gave three reasons the red is structurally an
assertion failure, and reason 2 said that because §6.3 moved the property test out of the `db`
project, *"a container failure cannot convert this evidence into a crash."* The test-engineer flagged
it as an unmeasured mechanism claim and the orchestrator measured it. With `DOCKER_HOST` pointed at
nothing:

```
npx vitest run                 ->  aborts in TestProject._initializeGlobalSetup
                                   test-results.json: 0 test files, 0 tests
npx vitest run --project nodb  ->  7 files, 94 tests, 94 passed
```

`red-proof --results` reads that one combined file. So the red could arrive as an **empty results
file**: `judge()` takes the `failedFiles: []` branch, returns *"the commit is marked red but no
test-engineer-owned suite failed"*, and CI records no observed red.

**The shape of the error, named rather than softened.** I named the mechanism's *capability* — a
Docker-free project exists — instead of its *configuration*, which is what CI actually invokes. That
is Tier 1 in the phase-4 retro's taxonomy, committed in a design that quotes the retro's operational
rule three sections later. For a mechanism claim, name the call site; I named the project membership
and never looked at the caller.

**Ruled (c), design defect, naming `CLAUDE.md` §2.4** — NON-NEGOTIABLE, *"observed red in CI"*. Not
(a): the wording was not ambiguous, it was wrong, and the missing piece was absent from the design
rather than unclearly stated. Not (b): (b) requires the work to be correct, and a design asserting a
protection it does not provide is not correct. This is loopback **1 of 2**.

**The remedy, which is the orchestrator's to build and mine to specify.** The human ruled it **tooling
prep, not slice work** — it touches CI, `package.json` and `tools/` and no `src/` — so slice 01's
declared scope is unchanged and it lands before step 3. `tools/ci/run-tests.mjs` becomes `npm test`
and:

1. runs the two projects as **two separate `vitest run` invocations**, each writing its own JSON, and
   runs the second regardless of the first's exit code;
2. merges them into the single `test-results.json` that `red-proof --results` reads, so 00a's
   single-file invocation contract holds and `red-proof`'s interface does not change;
3. **treats a project that did not run as a loud, distinct, non-zero failure, never an empty
   contribution.** A missing or zero-file project JSON fails the step before `red-proof` is reached.

Part 3 is the part I would not let be narrowed away, and the reason is worth keeping: with 1 and 2
alone, a `db` project that never ran merges as *zero failures*, indistinguishable from a `db` project
in which everything passed. That is 00a's "cruise with no resolvable compiler" moved one level up, and
it would be a worse defect than the one it fixes — conditional on Docker before, invisible on every
slice after. It gets `tools/test/run-tests.test.mjs` and is checked against mutants rather than
asserted to discriminate.

**This design is written against that description, and it was checked against the tool rather than
against the description.** `c328d84` implements all three parts, and its `merge()` closes a case this
design did not anticipate: the measured Docker failure makes Vitest write a report containing an
**empty** `testResults` array rather than no file at all, so a naive "the file is missing" check would
have reproduced the defect it was built to close. The tool treats `null` and `[]` alike as *did not
run*, which is the correct reading and a better one than part 3 as I specified it.

One thing the check did find: the build is **not** owned by `run-tests.mjs` (§6.2), so `pretest:nodb`
is still outstanding. That is the value of reading the tool instead of the plan.

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
| `duration-arithmetic` | the literal `60_000` or `60000` **matched on word boundaries**; an exported **definition** of `serviceDuration` or `durationMillis` | `src/domain/duration.ts` |
| `occupancy-interval` | an exported **definition** of `appointmentInterval`, `occupancyInterval`, or the type `Interval` | `src/domain/interval.ts` |
| `wall-clock-and-zone` | `Intl.DateTimeFormat` (any whitespace), or the identifiers `timeZone`, `ianaZone`, `time_zone` | `src/domain/openingHours.ts` |

Corpus: `src/**/*.ts`. Migrations are `.sql` and are therefore outside it — which is what keeps
`0002_reference_data.sql`'s `time_zone` column from being a false positive.

Definitions, not call sites: the application legitimately *calls* `serviceDuration`. Match
`^\s*export\s+(function|const|type)\s+<name>\b`. `60_000` and `Intl.DateTimeFormat` count anywhere,
because there is no legitimate reason for either outside its file.

**The `60_000` marker must be word-bounded, and the step-1 draft's version was defective.** It
specified *"the literal `60_000` or `60000`"* as a plain substring match, and `600000` — an ordinary
six-hundred-second timeout anywhere in `src/` — contains `60000`. In a scan that asserts *exactly one*
file matches, that false positive either fails the suite spuriously or, worse, makes the count come
out right while pointing at the wrong file. The test-engineer caught it; it is a defect in this design,
not a refinement of it, and it is the second one this slice has produced in a mechanism whose whole
job is discrimination.

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

No file under `src/`, so C2's ownership-zone check is untouched.

**`tools/ci/run-tests.mjs` and the `package.json` wiring are NOT in this commit.** They are the
orchestrator's tooling prep under the human's ruling (§6.4), landed in `c328d84`, and touch no `src/`.
The `pretest:nodb` hook §6.2 asks for is **still outstanding** — `run-tests.mjs` does not build, and
`test:nodb` is a bare `vitest run`. It is one line of `package.json`, which is not this commit's to
write.

### 8.2 What passes, and why that is the interesting half

| Runs at red | Outcome |
|---|---|
| `npm run typecheck` | **passes** — measured: the computed specifier does not resolve at compile time, §6.1 |
| `npm run lint:arch` | **passes** — no `tests/property/ → src/` edge exists to violate |
| `npm run build` | **passes** — `tsconfig.build.json` includes only `src`, which has no domain files to fail on |
| `npm test` via `tools/ci/run-tests.mjs` | **runs both projects as two invocations** (§6.4), so the `nodb` results survive whatever the `db` project does |
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
2. **Nothing this slice's tests need is behind `globalSetup`, and — the half the step-1 draft
   missed — nothing CI invokes can discard their results.** §6.3 moves them out of the `db` project;
   §6.4's `tools/ci/run-tests.mjs` runs the two projects as separate invocations, runs the second
   regardless of the first's exit code, and fails loudly rather than merging a project that never ran
   as zero failures. **The project split alone was measured insufficient** — one `vitest run` over
   both projects aborts in `globalSetup` and yields a results file with zero tests. Reason 2 as
   originally written was a claim about a capability nothing invoked; it is now a claim about two
   mechanisms, and the second is being built before step 3 rather than assumed.
3. **The module load is inside a `try` in a test body**, so "the file is not there yet" is a value the
   test asserts on, not an exception the runner reports.

That is C1's *"a real assertion failure rather than a missing import"*, satisfied structurally — the
same way slice 00 satisfied it by ruling that `beforeAll` may only connect.

**Nothing here is owed to a later verification.** §6.2's mechanical unknown was the only one, and it
has been run: the computed `file://` import executes under Vitest, and the literal specifier fails
`typecheck` with `TS2307`, control included. Slice 00 and 00a both ended up recording that a stated
mechanism nobody ran is not a mechanism; this one was run before the design was accepted rather than
named as a promise.

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
- **The three-file split is weaker than it was at step 1, and the honest statement is that QS-12 now
  rests on containment alone.** This is answered in full in §11 under *the cost of the ruling*, because
  it is a consequence of the human's AC-6 ruling rather than a limitation of the test.

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
| `startsOn !== endsOn` → `startsOn === endsOn` (§4.2 step 4) | a same-day case *and* a crossing-midnight case |
| `endsAtMillis > startsAtMillis` → `>=` and the finiteness checks (§4.2 step 1) | an equal-endpoint case, a reversed case, and a `NaN` case. **New at the amendment**: this branch exists only because of the literal AC-6 ruling, so nothing in the step-1 mutant list aimed at it |
| each verdict's `kind` string literal | one assertion per verdict on `kind`, not on truthiness — the reason §2.3 chose a union |
| `durationMillis`: `* 60_000` → `/ 60_000`, and the literal itself | any duration whose product is asserted exactly |
| `serviceDuration`'s `> 0` → `>= 0`, and its integer check | a `0` case and a fractional case |
| `instant()`'s finiteness / integer checks | `NaN`, `Infinity`, and a fractional millisecond case |
| the seven-entry weekday lookup | seven cases, one per day — or the lookup shrinks to a table a single mutant survives |
| `occupancyInterval` body → `{}` / identity variants | an assertion that it returns an interval **equal in both fields** to its argument. This one is the likeliest survivor in the slice: an identity function is hard to mutate detectably, and asserting only its type kills nothing |

The order of §4.2's checks is behaviour, not style: a unit test that only ever supplies well-formed
input cannot distinguish step 5 from step 6, and the reordering mutants survive.

**One thing got easier and one got harder under the literal AC-6 ruling.** Easier: with no branded
values crossing module boundaries, each module is callable from a unit test with plain numbers, so
there is no constructor ceremony between the test and the branch it is aiming at. Harder: there is one
more branch to cover (`malformed-interval`), and the three modules no longer share types, so a unit
test that composes them has to do the composition by hand — which is exactly what `src/application`
will do, and is therefore worth doing once in a test that mirrors it.

---

## 11. Assumptions, open questions and findings

### Assumptions taken by this design

| id | Assumption | If wrong |
|---|---|---|
| ~~**DA-1**~~ | Intra-`src/domain` type imports satisfy AC-6 (§2.0) | **Discharged 2026-09-05 — and discharged against, by the human, not by me.** The human ruled AC-6 literal. The assumption was the architect's reading and it did not survive; the record says which reading won, because "discharged" would otherwise read as confirmed. The design was amended, not defended |
| ~~**DA-2**~~ | PostgreSQL's `time` admits `24:00:00`, so the parser accepts it (§3.2) | **Discharged by measurement** against a real `postgres:16-alpine` at step 2: `'24:00:00'::time` accepted and round-tripping, `24:00:01` and `24:30:00` rejected by PostgreSQL. It did more than confirm the branch — it narrowed the parser's range, which had been wrong in the permissive direction |
| ~~**DA-3**~~ | Vitest's module runner honours a computed `file://` dynamic import of `dist/**.js` (§6.2) | **No longer an assumption — measured**, with a control, before this design was accepted. See §6.2. Kept in the table struck through rather than deleted, so the record shows it was carried as an assumption and then discharged |
| **DA-4** | The `pg` driver returns a `time` column as a string, which is why `DayHours` holds strings (§2.3) | The assembler adapts; the domain contract does not change. Nothing in slice 01 depends on it, since nothing queries |

### Open questions — recorded, not resolved

- **OQ-01-1.** When A-4 is revised and a buffer exists, must the **occupancy** interval also fall
  inside opening hours, or only the appointment interval? ADR-0001 says *"the whole derived
  interval"*, written when the two were the same thing. Today no test can tell them apart.
  `withinOpeningHours` is handed the appointment interval's endpoints; the question is deferred, not
  answered.
- **OQ-01-2.** See F-01-2 below: AC-5's `time_zone` clause needs a reading before
  `referenceRepository` lands. It is an acceptance criterion, so the reading is the human's.

### The cost of the literal AC-6 ruling — debt, and a consequence rather than a defect

The human ruled AC-6 literal with these consequences in front of them. They are recorded here and
proposed for arc42 §11 (§12.1) as **the price of a ratified decision**, not as something that went
wrong. Nothing below is an argument for revisiting it.

**D-01-1 — composition order moved out of the domain.** `serviceDuration → durationMillis →
appointmentInterval → withinOpeningHours` used to be expressed by the types: you could not call the
third without having called the first two, because the values were branded and only one function
produced each. It is now expressed by a use case in `src/application`. The order is still correct; it
is correct because someone wrote it correctly, not because the compiler refused the alternatives.

**D-01-2 — unit confusion across domain boundaries is review-caught, not compiler-caught.** The two
inter-module handoffs take bare `number`: `appointmentInterval`'s `durationMillis`, and
`withinOpeningHours`'s two endpoints. Passing minutes where milliseconds are expected now compiles.
The brands survive *inside* each module (§2.1, §2.2) and catch nothing between them — which is the
boundary they were introduced for. This is the debt entry most likely to cash in, because a
minutes-for-millis error produces a plausible-looking interval rather than a crash.

**D-01-3 — one extra branch and one extra verdict variant.** `malformed-interval` exists only because
the `Interval` type cannot cross the boundary and therefore cannot carry "ordered, and from the same
interval" (§2.3). It is fail-closed and directly testable, so the cost is a branch to cover rather
than a risk to carry — but it is a branch that would not exist under the other reading, and §10 names
its mutants.

**D-01-4 — the three-file split is weaker, and `interval.ts` is the file that feels it.** This was
asked directly and it deserves a direct answer rather than reassurance.

*Is `interval.ts` still carrying its weight, or does the split now exist only to satisfy the scan?*

It is still carrying weight, but less, and the *kind* of weight has changed. Before the ruling the
split had two independent justifications: each file absorbs one §1.4 ambiguity (A-1, A-4, ADR-0001),
**and** the three types composed, so the decomposition expressed a relationship the compiler enforced.
The second justification is gone. What remains for `interval.ts` is the `Interval` type — which still
has consumers outside the domain, where imports are permitted — plus `occupancyInterval` as A-4's
named seam, plus one addition. A reader can now reasonably ask why that addition is not simply inlined
where it is needed, and the answer is A-4 and QS-12 rather than cohesion.

So: **the split is no longer self-justifying and now rests on the containment criterion alone.** That
is a real weakening. It is not fatal — AC-5 and QS-12 are exactly a containment criterion, all three
files still hold a distinct §1.4 ambiguity, and the whole point of QS-12 is that a change lands in one
file — but "the scan requires it" is a thinner reason than "the types require it", and a later slice
that finds `interval.ts` looking anaemic should read this entry before deleting it.

### Findings raised by this design

- **F-01-1 — arc42 §10 QS-9 carried the wording the human corrected in AC-2. CORRECTED at step 1,
  not deferred to step 7.** QS-9 read *"the instant that is 08:30 local but 09:30 UTC"* — the same
  transposition O-13 ruled a defect on 2026-09-04, in the same words, in a document I own. Found by
  reading the two side by side, which is the retro's Tier 2.

  **Why it was fixed now rather than at step 7, and on whose authority.** The orchestrator asked for
  it immediately and gave the deciding reason: **QS-9, not AC-2, is what the test-engineer reads at
  step 3** to write `tests/property/opening-hours-dst.test.ts`. Deferring would leave a known
  contradiction in the document the next role works from, and the cost of the defect is not the two
  lines to fix it but a property test written against a scenario that cannot occur. I agree, and the
  authority reading holds: `CLAUDE.md` §6 reserves quality goals to the human, and the human has
  already ruled the substance under O-13. Propagating an existing ruling into a second document that
  contradicts it is not a new decision, and the edit cites O-13 as its authority rather than the
  architect's judgement.

  **The one qualification I would not let pass silently.** That reasoning is sound *because the two
  texts were word-for-word the same defect*. It would not extend to a §10 scenario that merely
  resembled a ruled criterion, and it does not make §10 generally amendable by the architect on the
  strength of a ruling elsewhere — the substance of a quality scenario stays the human's. The edit is
  therefore marked in §10 itself as propagated rather than decided, so a reader can see which it was.
  If the human reads that as an overstep, the remedy is to revert the illustrative pair, not the
  scenario: nothing else in §10 was touched.
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
| **§5.2** | **Line 40 is NOT amended. The proposal to amend it is withdrawn**, under the human's ruling that AC-6 is literal — *"imports nothing at all"* is now ratified rather than corrected, and the step-1 draft's argument for changing it rested on a claim (*"jointly unsatisfiable"*) that was false. Still owed: update the `interval.ts` / `duration.ts` / `openingHours.ts` rows to the as-built signatures, which now take primitives rather than domain types; record that `withinOpeningHours` returns a verdict union rather than a boolean, and why; note that composition lives in `src/application` and why (§11 D-01-1). Extend the *As built* subsection with a `src/domain` row — it stops being empty at this slice, which §5.2 predicted |
| **§8.3** | Add the measured DST facts: the two 2026 transition instants, AC-2's amended pair, AC-3's `00:30 → 02:30`, and the fall-back pair that renders identically. Add §4.2's fixed decision order, and the note that a fall-back day is legitimately longer in absolute terms than the wall clock says. Record the locale pin and `hourCycle: 'h23'` as measured constraints on the rendering |
| **§8.5** | Record ADR-0013's three clauses: outside-in tests reach a pure module through the built artifact, `tests/property/` splits by database need, and **`npm test` runs the two projects as separate invocations with a project that did not run treated as a loud failure** (§6.4). This is the section that already draws the line §2.2 of `CLAUDE.md` protects, and these rulings sit beside it |
| **§10** | **F-01-1 is already done — corrected at step 1, not owed at step 7** (see §11). Still owed here: narrow QS-9's *"generated instants"* clause to record what the test actually generates (§9.1), and add to QS-12 that the response measure is assumed, not measured (§9.2). Both are as-built corrections and belong at merge, not before |
| **§11** | ADR-0013 as `status: proposed` is a debt item and appears in the generated table. Add **D-01-1 … D-01-4 verbatim as the cost of a ratified ruling, not as defects** (§11): composition order out of the domain, unit confusion review-caught rather than compiler-caught, the extra branch, and the weakened three-file split. Add also: `occupancyInterval` has no production call site until the booking path (§9.2); QS-12's corpus is nearly empty at this slice; QS-9 examines one zone and one year; and the ICU dependency the `Intl` global introduces |
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

`docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md`, `status: proposed`, following
ADR-0012's convention: the architect proposes at step 1 and the human ratifies at the gate. It carries
the five options of §6.2 and now **three** clauses of one seam — the built artifact, the property-test
split, and the invocation split of §6.4.

**Revised in place at the step-2 loopback rather than superseded, and the human has been told so.**
`CLAUDE.md` §4 says *"Never edit an **accepted** ADR"*; 0013 is `status: proposed` and has never been
ratified, so the rule does not bind. Superseding a decision nobody has taken manufactures a history of
a decision that did not happen, which inverts the reason ADRs are immutable in the first place. The
ADR carries a *Revision before ratification* note saying what changed and why, so the record does not
depend on this design being read alongside it. The human can overrule the handling.

It is put to the gate rather than taken unilaterally because, while testability is architecture, this
changes what *outside-in* means operationally for every later property test — and the ownership of the
test directories was itself a human ruling at Gate B.

---

## 13. What step 2 produced

Step 2 did what §6 says it is for: two objections against this design, one of them blocking, and the
cheapest possible place to find both.

| | Objection | Outcome |
|---|---|---|
| **T-01-2** | The step-1 §8.3 reason 2 was an unmeasured mechanism claim, and false | **Ruled (c), design defect**, naming `CLAUDE.md` §2.4. Loopback **1 of 2**. §6.4 |
| **T-01-1** | *"AC-5 and AC-6 are jointly unsatisfiable"* was overstated | **Conceded.** The test-engineer's third path is real; the human then ruled AC-6 literal and the design was rebuilt around it. §2.0 |

**Both reviewers disagreed with each other on T-01-1, and the record should show who was right.** The
implementer argued alongside me that there was no third path, naming the call site
(`appointmentInterval` must convert minutes to milliseconds) and enumerating two responses to it. The
test-engineer named a third — change the signature so the conversion happens before the call. **The
test-engineer was right and the implementer was wrong**, and the error was the same one I made: an
exhaustiveness claim that had enumerated two options and called it a proof.

**Four corrections were conceded, and two of them were defects in this design rather than refinements
of it.** They are recorded as defects in the sections they belong to, not softened in a list here:

| | Where | Kind |
|---|---|---|
| `> 0` coverage floors pass ~29% of the time under a broken generator | §5.3 | **Defect.** A guard with a 29% false-pass rate is the failure it was built to catch |
| A substring match on `60000` false-positives on an ordinary `600000` timeout | §7.2 | **Defect.** In a scan asserting *exactly one* match, it points at the wrong file |
| The parser's range was wrong in the permissive direction (`24:30` is not a `time`) | §3.2 | Correction; it removes a branch reachable only by impossible data |
| The computed-import hole is no longer closed by review alone | ADR-0013 | Narrowing; the test-engineer is adding a source scan it owns |

**What this slice has now cost, stated plainly.** One (c) loopback, two human rulings, one withdrawn
arc42 amendment, and four corrections — two of them defects in a design that spends several sections
telling other roles not to assert mechanisms they have not run. The design is better than it was and
the process is why; the retro should read the second half of that sentence with the first.

**One loopback remains before §6's automatic escalation.**
