# Slice 02 — design

> Step 1 of the slice loop. Architect. Slice file:
> [`02-book-and-read-an-appointment.md`](02-book-and-read-an-appointment.md) — 19 acceptance
> criteria, the booking path plus the whole error taxonomy plus two ratified domain remedies.

This is the slice where `CLAUDE.md` §2.1 stops being a rule in a document and becomes a running
program. Everything below is arranged around one question: **when someone reintroduces check-then-act
in six months, what fails?** Section 4 answers it with three structural mechanisms and one
runtime control, and each one was run before it was written down.

Nothing here re-derives ADR-0014 or ADR-0015. Both are accepted and immutable; §6 applies them.

---

## 0. Rulings and escalations, up front

Three things needed the human and were ruled on 2026-09-06 (E-02-1, E-02-2; E-02-3's routing stands).
**T-02-9 is different: I ruled it**, under the human's amendment of the same day, and it is the entry
to read first. **I-02-9 and the four step-4 corrections beneath it were also mine to rule**, and none
of them consumed a loopback. They are listed up front so the orchestrator can queue them without reading the rest,
and so nobody spends a cycle discovering them at step 5.

### E-02-1 — AC-4 cannot be satisfied without ADR-0004's retry loop · **ruled 2026-09-06: the loop is in scope**

**Condensed 2026-09-06 (T-02-9), from ~950 words to this.** The ruling is in `events.jsonl`
(`s-02-ruling-E-02-1`) and the slice file's *Out of scope* now names only ADR-0009's seeded ordering
and cap; §2.6 is the loop's specification and step 3 asserts against it. The full derivation — the
creation-order measurement, the test-engineer's P1 and P2 alternatives, and T-02-1's per-value
correction — is in this file's git history. What must survive is why the loop is load-bearing:

**Which constraint PostgreSQL names when both are violated is decided by index creation order.**
Measured on this repository's migrations: a doubly-violating insert reports `no_bay_overlap`, and in
a scratch table with the constraints created in reverse it reports the technician one.
`ExecInsertIndexTuples` walks indexes in OID order and `0003_appointment.sql` creates the bay
constraint first. So without a loop, AC-3 needs the doubly-violating insert to report
`no_bay_overlap` and AC-4 needs it to report `no_technician_overlap`, and one index ordering cannot
give both.

**The test-engineer supplied a better argument for the loop than mine, and it is adopted because it
is stronger, not because it agrees.** Without the loop the refusal names whichever index was created
first — systematically the **abundant** resource, not the scarce one. That breaks **AC-11**
(*`resource` set to the contended resource*) and poisons `booking_conflicts_total{resource}` at slice
09, so the defect is client- and metric-visible rather than a fixture artefact. Its P1 and P2
alternatives also corrected an absolute I had written where a trade-off existed — *whether something
is impossible or merely a trade-off decides who rules it*, which is T-01-1 from slice 01.

**With prune-by-constraint the ambiguity disappears**, because the constraint reported at *refusal*
is the one whose list emptied rather than the one whose index was checked first: one bay ⇒ pruning
walks the technicians and the bay list empties ⇒ always `no_bay_overlap`; one technician ⇒ symmetric.
The loop is what turns *"which constraint fired"* from a PostgreSQL implementation detail into a fact
about which resource was scarce.

**Pruning is per resource *value*, not per class (T-02-1)** — `no_bay_overlap` drops *that bay* and
leaves the others. The seeded shuffle, the 16-attempt cap and QS-3 stay in slice 04.

### E-02-2 — QS-12's `wall-clock-and-zone` marker becomes unsatisfiable at this slice · **ruled 2026-09-06**

**Condensed twice — 2026-09-06 (T-02-9) from ~1,100 words, and again at step 4 now that the split is
implemented and merged in `tests/architecture/ambiguity-containment.test.ts`.** The ruling is in
`events.jsonl` (`s-02-ruling-E-02-2`); the marker specification lives in arc42 §10.2 *"in the
scenario's own words"*; the derivation is in this file's git history. Only the evidence is kept.

Slice 01's marker matched `Intl.DateTimeFormat` **or** the identifiers `timeZone` / `ianaZone` /
`time_zone`, permitted in exactly one file. This slice must carry a dealership's IANA zone from a
`text` column into a pure function, so the token appears in at least three — and no query layer avoids
it, measured across raw `pg`, `select *` and a `sql` template. **ADR-0006 is not implicated and must
not be offered as a remedy.** It was simultaneously **too loose**: of three zone-reasoning violations
planted into a copy of `src/`, it caught only `Intl.DateTimeFormat` + `formatToParts` and **missed**
both `d.toLocaleString('en-GB')` in a route — the ambient server zone, the worst bug available here —
and `d.getHours()` in a use case. A scan reporting nearly the same file set whether or not the tree
contains zone reasoning is not evidence.

**Ruled:** QS-12 reads by **concept**, not by spelling. The marker splits into `wall-clock-reasoning`
(deriving a wall clock or calendar field from an instant by any route, including `getTimezoneOffset`
and the ambient `get*`/`toLocale*` families; `getUTC*` and ambient-zone *construction* deliberately
out), permitted only in `src/domain/openingHours.ts`; and `zone-transport` (the bare identifier),
permitted in a short named file list held by **set equality**. QS-12's response measure survives the
split, which is the test of whether the split was honest: the transport files hold a string they never
interpret. The excluded ambient-*construction* residue becomes a deliberate row in arc42 §11's
irreducible-for-a-text-scan table at step 7, beside `duration-arithmetic`'s.

### E-02-3 — arc42 §8.5's serialiser table is incomplete, and the missing rows change its guidance · **route**

**Condensed 2026-09-06 (step 4): implemented and merged at `b90666a`, asserted at `fae2aff`.**
§8.5 records four measured behaviours of a TypeBox `response` schema. Re-measured on this
repository's pinned Fastify, for the shape this slice needs — a computed enum-valued field — two more
appear and they **reverse the section's advice**: a `Type.Union` of literals with a wrong value gives
`500`, and `Type.String({ enum })` passes the wrong value straight through. §8.5's consequence #1
offers two ways out — *"either the schema does not pin the value, or the test does not assert it from
the body"*. **There is a third and it is better than both:** a union of literals is the only one of
the three that both **enforces** and does **not substitute**, so a handler emitting a `type` outside
the taxonomy fails loudly instead of having the right answer written in for it. §5's problem schema
and §2.7's `status` field both use it. **That is a §8.5 edit and §8.5 is outside this slice's declared
scope — flagged, not taken.** The design does not need §8.5 amended to be correct; it needs §8.5
amended to stop being *misleading*.

### T-02-9 — a simultaneous loser is refused with `40P01`, and this design called that a `500` · **ruled 2026-09-06: (c) design defect** · [ADR-0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md)

**Condensed 2026-09-06 (step 4), from ~1,000 words to this.** ADR-0018 is now the record: it carries
the eight options, the five livelocking retry configurations, the two drop-one controls and the
timings. What survives here is the ruling and why it was (c).

**The first ruling made under the human's amendment of 2026-09-06.** Between steps 1 and 5 nothing
escalates: scope, acceptance criteria and quality goals are mine, **provisionally until the gate**,
and `slice:check` lists this block for step 6. Naming that at the top rather than the bottom is what
makes delegated authority safe.

**The finding, reproduced rather than taken on trust — and worse than reported.** 20 racers, one bay,
hard barrier, 20 trials on this repository's own migrations: 20 confirmed, 95 `23P01`, **285 `40P01`**.
`check_exclusion_constraint` inserts the index tuple and *then* scans, so simultaneous inserters wait
on each other's in-progress tuples and cycle. Exactly one row survived every trial — **§2.1 is
untouched, and was never in question.** The reported figure was *"one race in three"*; had I ruled
from it, a 33% `500` rate would have looked survivable enough to reach for a retry, and every retry
configuration livelocks (§8, row 17).

**What fails, named, because (c) requires it.** **AC-3** and **AC-4** — *"the other 19 receive `409`
with `type=/problems/no-capacity`"* — and arc42 §10's **QS-1** and **QS-2**, which use the same words.
The failing clause is §2.6's `other ⇒ rethrow ⇒ 500` arm and nothing else. Worth naming the shape,
because it recurs: the constraint guarantees *at most one row*, a claim about the **table**, and every
criterion here that a race can break is a claim about the **responses**. §2.1 can be perfectly intact
while the API is unshippable, and this design's insistence that QS-1 and QS-2 assert over the table is
exactly what let the response half go unexamined until a test-engineer ran it.

**The ruling.** Each attempt takes two class-scoped transaction advisory locks — class 1 on the bay,
class 2 on the technician — before its `INSERT`. Disjoint key spaces make *bay-then-technician* a
total order by construction, so no attempt can take the pair in reverse and there is no sort for
anyone to keep sorted. Measured across 56 races at *N* = 20 and *N* = 40: **0 deadlocks, 0 retries,
every racer a verdict, the expected constraint name**, and 0.4 ms added to an uncontended booking.
`40P01` becomes its own `PgOutcome` variant, `no-verdict`, which mints no `ContendedResource` — so
**ADR-0016 answered the human's question before I did**: a `409` here is not merely dishonest, it is
unconstructible without a cast. Under the lock a deadlock can only mean a write path skipped the
locks, so it is an internal fault, not retried, `500 /problems/internal`. **§8.6 gains no row and the
taxonomy does not grow.**

**What this costs §4.** Under a per-resource lock a reintroduced check-then-act would be **correct**,
not merely harmless. §4's argument is weaker after this ruling than before it, and §4.5 says so and
states what survives.

**This ruling changes what an acceptance criterion asserts — AC-5, and only AC-5.** AC-3 and AC-4 are
unchanged in substance: the design now *earns* their nineteen `409`s instead of assuming them, which
is the outcome I wanted and not the one I expected to reach. The exact wording I want for AC-5 is in
§9 under R-02-1; the slice file is the orchestrator's and I have not edited it.

### I-02-9 — both concurrency tests assert something no implementation can satisfy · **ruled 2026-09-06: (a) clarification** · **no loopback**

Verified at `fae2aff`, `tests/concurrency/no-bay-overlap.test.ts:141-146` and
`no-technician-overlap.test.ts:140`:

```ts
expect(`${confirmed.length} confirmed / ${refused.length} refused`)   // "1 confirmed / 19 refused"
  .toBe(`1 / ${RACERS - 1}`);                                         // "1 / 19"
```

The left side always carries the words *confirmed* and *refused*; the right side never does. **The
assertion cannot pass, including for a correct implementation.** It was red at `34b057b` for the
right reason — `0 confirmed / 0 refused` against `1 / 19` — so the defect hid behind a true failure,
which is the one blind spot a red commit has by construction.

**(a), and the reason it is not (c).** (c) obliges me to name an acceptance criterion, a `QS-*` or a
§2 invariant that **the work** would fail, and none does. The implementer reproduced both races on the
same built artifact against `postgres:16` and ran every assertion both files make: 1 confirmed, 19 ×
`409`, **0 non-201/409 responses**, `resource` `bay` and `technician`, `attempt` `["1"]` and
`["1","2"]`. AC-3, AC-4, QS-1 and QS-2 are met; §2.1 is met; ADR-0018 is doing exactly what I ruled it
would. The design is right and one artifact's *expression* of it is wrong, which is (a) exactly. It is
also not (b): (b) merges as-is and this cannot, because the file is not merely improvable, it is
unsatisfiable.

**No loopback is consumed.** (a) resumes from the raising step; only (c) returns to step 1. The
governor counts design changes made after work has been done, and no design changed here. The slice
stays at **1 of 2**.

**The line, for the test-engineer to apply in both files** — `tests/` is theirs and I have not touched
it:

```ts
).toBe(`1 confirmed / ${String(RACERS - 1)} refused`);
```

Kept as **one** strict equality naming both counts, and the implementer's reason for that is better
than a split into two: nineteen `500`s render as `1 confirmed / 0 refused`, and every other assertion
in both files filters `refused` and would pass **vacuously** on an empty list. This is the only
assertion in either file that fails when the losers receive the wrong status, so it is the one that
must name both halves.

Two editorial follow-ons in the same commit, the test-engineer's to take or leave: the comment above
the assertion still tells a reader that a `40P01` reaching the client *"is this finding and not a
defect in the booking path"*, which ADR-0018 has made false and which would mislead the reviewer at
step 5; and the `String(...)` wrapper is what the file's own lint rule requires.

### The four divergences the implementer flagged rather than took · **ruled 2026-09-06**

All four are corrections to **my** text, not departures from it, and none is a scope, acceptance-
criterion or quality-goal change. **No new ADR is proposed:** ADR-0008 already owns decomposition and
ADR-0018 already owns the transaction, and a decision record for each of these would be four notes
wearing a decision's clothes.

| # | Flagged | Verdict |
|---|---|---|
| 1 | `deriveInterval` takes a `DealershipHours`, not `(zone, weekly)` | **AGREE** — §2.5 corrected |
| 2 | §2.4's *"no `db.transaction()` anywhere on this path"* is stale | **AGREE, my error** — §2.4 corrected |
| 3 | `lockResources` lives in `appointmentRepository.ts` | **AGREE** — §2 and §2.4 name it |
| 4 | `classifyOwnership` uses two `EXISTS`, not three | **AGREE** — §2.3 and §5.3 corrected |

**1 — the signature.** I verified the containment argument rather than accepting it:
`grep -rlE '\b(time_zone|ianaZone)\b' src` returns exactly the four files
`ZONE_TRANSPORT_FILES` asserts by **set equality**, and `bookAppointment.ts` is not among them. A
`zone: string` parameter drops `deriveInterval.ts` off the list; a bare `ianaZone` parameter forces
`dealership.ianaZone` at the call site and adds a fifth file. **But the struct must not stand on
that, and it does not:** choosing a signature to satisfy a scan is how a measurement starts writing
the design, which is the failure this project has ruled against repeatedly. It stands on the coupling
argument — a zone and a weekly schedule are **one fact about one dealership**, and separating them is
how a caller ends up pairing one dealership's hours with another's zone. Had that argument been
absent, the correct remedy would have been to change the list, not the signature. The parameter type
is declared structurally, so the module still imports nothing outside `src/domain`.

**2 — the stale rule, which is mine.** §2.4 predates T-02-9 by one step. `pg_advisory_xact_lock` has
nothing to scope to without a transaction, and AC-5's amended wording says *one transaction containing
exactly one `INSERT`*. §2.6 has said **EACH ATTEMPT ITS OWN TRANSACTION** since that ruling, so the
document contradicted itself and the implementer built the half that had been ruled. Correct. The rule
§2.4 was reaching for survives verbatim and is what it now says: **no transaction wraps the loop.**

**3 — where the lock lives.** `sql-only-in-persistence` settles the layer; what was open was the
module, and this is the right one for a reason stronger than convenience. F-02-9's inherited
obligation is that *every* write path to `appointment` takes both locks in this order, and the
strongest available form of that is for the lock to sit in the only module permitted to name the
table. A `lockRepository.ts` would be a lock importable from anywhere by anyone, which makes skipping
it easier rather than harder. It also puts the two calls that must share one transaction handle in one
file, where *"the transaction boundary is exactly one attempt wide"* is reviewable without opening a
second.

**4 — the third `EXISTS`.** The constraint is
`(vehicle_id, customer_id) REFERENCES vehicle (id, customer_id)`. By the time `classifyOwnership`
runs, it has fired and both rows exist — so the third sub-select asks whether the pair matches, which
the FK has just answered. It is a query whose only reachable answer is `false`; no test can
distinguish it from its own removal, which is the definition of an equivalent mutant. **§5.3's
argument is unharmed and I checked each leg**: it still runs strictly after the write, its type still
has no `'ok'` member, and it still reads reference data only. *Three* was a count, never a mechanism.
The correction records **why** the third is absent, so the next reader does not restore it as an
omission.

### Two judgements for step 5, which are not rulings

**Commit size — I agree on two of the three, and disagree in part on the first.** §7's ~150 lines is a
heuristic (*"should probably have been two"*); the clause with force is *every implementer commit is
green*, and that is what binds the split. `bookAppointment.ts` cannot be separated from its outcome
union and stay green — the first commit would not compile, so §7 forecloses that split rather than the
implementer declining it. The edge is one exhaustive `switch` over that union plus the schemas it maps
to, and splitting it yields commits that compile and assert nothing. **The three repositories are
three independently green commits and that split was available; I would have taken it.** I also
measured the mitigation rather than accepting it: comment lines are 37%, 37% and 29% of the three
headline modules, not *"roughly half"*, so net production code is nearer 270–320 lines per commit —
still about twice the heuristic. **The remedy is not a rebase.** History is already bisectable and
green, and rewriting it to re-split a merged-quality commit trades a real property for a cosmetic one.
Recording it as a finding rather than defending it is the correct behaviour and I want that on the
record separately from the verdict.

**AC-6 — the reading is right, and for a sharper reason than "one leg is redundant".** §2.7 claimed
*two independent reasons, one of which is structural*. `additionalProperties: true` surviving is the
**measurement of that claim**: unstripped, the extra property reaches the handler and nothing changes,
because `BookCommand` has no member for an end and `appointmentInterval` has no parameter for one. So
AC-6 rests on the structural leg and the schema leg is defence in depth. A survivor that tells you
which of two mechanisms is load-bearing is a survivor doing its job, and it should reach the reviewer
as evidence rather than as an apology. Two limits, so it is not over-claimed: the reading is scoped to
**AC-6**, and `additionalProperties: false` stays — a surviving mutant is not a licence to weaken
the code that survived it. **What it is load-bearing *for* is narrower than this paragraph first
said, and the reviewer's correction is right (§13):** Fastify's `removeAdditional: true` strips
rather than rejects, so at runtime the request schema's clause changes only whether an extra
property reaches a handler with nowhere to put it — which is why the AC-6 test asserts `201` and
not `400`. It is load-bearing for ADR-0005's emitted document; and it holds only while nothing downstream reads the raw body, so a later slice that logs
or generically maps it puts the schema leg back on the critical path. What AC-6 therefore asserts is a
behaviour the system satisfies **by construction** rather than by validation, which is the stronger
position — and its acceptance test is still able to fail, the moment someone adds an end to
`BookCommand` and plumbs it, which is the regression AC-6 exists to prevent.

**Nothing in this batch would have escalated under the pre-amendment rule.** I-02-9 is a defective
assertion; 1, 3 and 4 are interfaces and decomposition, which §6 gives the architect outright; and the
AC-6 reading changes no criterion's wording. **2 is the only one that touches an acceptance criterion,
and only as an aftershock** — §2.4 is stale *because* AC-5 was amended, and amending AC-5 is the one
thing here that would have gone to the human. That escalation already happened at T-02-9, one step
earlier, and is already listed as provisional for the gate. The delegation bought this batch nothing
it could not have had; the ruling it bought was T-02-9's.

---

## 1. Data-model delta: none

No migration. Slice 00 built the whole schema, including both exclusion constraints, and this slice is
the first code to write to it.

`src/persistence/schema.ts` — the Kysely `Database` interface, empty since 00a — gains entries for the
tables this slice reads and writes: `appointment`, `dealership`, `opening_hours`, `service_type`,
`service_bay`, `technician`, `technician_qualification`, `customer`, `vehicle`. **That is a type
declaration, not a data-model change**; it is a second statement of a schema the migrations already
own, which is R-6 in arc42 §11 and is not made worse or better here.

Two column mappings are measured rather than assumed, because both feed domain functions directly and
a wrong guess would surface as a verdict rather than as a type error (`postgres:16-alpine`, `pg` 8.23):

| Column type | JS value returned by `pg` | Consequence |
|---|---|---|
| `time` (`opens_at`, `closes_at`) | a **string**, verbatim — `'09:00:00'`, and `'24:00:00'` round-trips as `"24:00:00"` | `DayHours` already takes raw strings and `openingHours.ts` owns the parse (§3.2 of the slice-01 design). Nothing maps. **AC-19 is reachable with real reference data**, not only with a hand-built fixture |
| `timestamptz` (`starts_at`, `ends_at`) | a **`Date`** | the row mapper renders with `.toISOString()`. `Date`'s range is narrower than `timestamptz`'s, which is ADR-0014's premise; inserting `new Date(8_640_000_000_000_000)` succeeds, so PostgreSQL is not the binding constraint |

---

## 2. The modules

Ten files. Five are new, two are the ratified domain fixes, three are edits to existing files.

```
  src/http/problem.ts                    NEW   RFC 9457 body, the type union, the outcome→status map
  src/http/routes/appointments.ts        NEW   POST /appointments, GET /appointments/{id}
  src/http/server.ts                     edit  register the routes; setErrorHandler for AC-8

  src/application/deriveInterval.ts      NEW   the composition order — D-01-1's home. PURE
  src/application/bookAppointment.ts     NEW   the use case, the outcome union, the attempt loop
  src/application/readAppointment.ts     NEW   AC-2

  src/persistence/pgError.ts             NEW   the ONE SQLSTATE site; mints ContendedResource
  src/persistence/appointmentRepository.ts NEW ADR-0018's locks, the guarded INSERT, findById
  src/persistence/candidateRepository.ts NEW   candidate bays and qualified technicians
  src/persistence/referenceRepository.ts NEW   dealership + hours + service type + ownership
  src/persistence/schema.ts              edit  the Database interface

  src/domain/interval.ts                 edit  ADR-0014 — bound instant()
  src/domain/openingHours.ts             edit  ADR-0014 step 1, ADR-0015 step 4
  src/main.ts                            edit  bind the two new use cases
```

Every edge here is one `.dependency-cruiser.js` already permits. Nothing in this slice needs a rule
relaxed, added or exempted, and if the implementer finds it does, that is a DCR.

### 2.1 `src/persistence/pgError.ts` — the only place SQLSTATE is read

```ts
/** Minted ONLY by classify(), from err.constraint. See §4.1. */
export type ContendedResource = ('bay' | 'technician') & { readonly __brand: 'ContendedResource' };

export type PgOutcome =
  | { readonly kind: 'conflict'; readonly resource: ContendedResource; readonly constraint: string }
  | { readonly kind: 'bad-reference'; readonly constraint: string }   // 23503
  | { readonly kind: 'no-verdict' }                                   // 40P01 — T-02-9, ADR-0018
  | { readonly kind: 'other'; readonly cause: unknown };

export function classify(error: unknown): PgOutcome;
```

`no-verdict` is `40P01` and **only** `40P01`: the one SQLSTATE measured to reach this path. It
carries no `constraint`, no `resource` and no cause, because a deadlock reports none — and the
absence is the point. It is the variant a refusal cannot be built from, which is ADR-0016 doing its
job at the one moment it was most likely to be argued around. `40001` is *not* included: at `READ
COMMITTED` it cannot arise here, and adding an unmeasured SQLSTATE to the one classifier the design
calls total is how a total function starts guessing.

`constraint` is carried on the conflict variant as well as the resource, because ADR-0009 prunes on
the resource but AC-3 and AC-4 assert on the **name**, and a test that can only see `'bay'` cannot
tell `no_bay_overlap` from a mapping that guessed.

The constraint-name → resource mapping is a total function over the two names in the migration, with
no default arm: an unrecognised `23P01` constraint name is `{ kind: 'other' }` and becomes a `500`.
Inventing a resource for a constraint nobody has seen is how the metric ADR-0009 depends on starts
lying.

### 2.2 `src/persistence/candidateRepository.ts` — and what it deliberately cannot see

```ts
export interface CandidateSet {
  readonly bays: readonly string[];          // service_bay.id, ordered by name
  readonly technicians: readonly string[];   // technician.id qualified for the service type
}
export function candidateResources(db: Db, dealershipId: string, serviceTypeId: string): Promise<CandidateSet>;
```

**This query does not read the `appointment` table.** Not filtered by it, not joined to it, not
`NOT EXISTS`-ed against it. It reads `service_bay` for the dealership, and `technician` joined to
`technician_qualification` for the dealership and service type. That is reference data and nothing
else.

That is the strongest single sentence in this design and it deserves its argument rather than an
assertion:

> arc42 §5.2 describes this module as *"the **advisory** free-bay and free-qualified-technician read"*,
> and §6.2 step 5 has it consulting availability. Both are right about the finished system. But an
> advisory read is only safe because ADR-0004's loop makes every suggestion get adjudicated, and
> **this slice should not introduce the read before the mechanism that makes trusting it impossible is
> visible next to it.** In slice 02 there is no availability read *in existence*, so there is no read
> whose result could be trusted — check-then-act is not merely absent from the diff, it has no
> subject. Slice 04 adds the availability filter in the same slice as ADR-0009's ordering and QS-3,
> where the read and the reason it is advisory arrive together.

The cost is the pessimism the slice file already accepts and already scopes: a request may be refused
while an untried bay is free, until slice 04. Nothing in AC-1 to AC-19 depends on it not being.

`CandidateSet` is two lists of ids. **It has no field that could mean "free"**, no timestamp, no
freshness marker — there is nothing in the type for a later reader to trust.

### 2.3 `src/persistence/referenceRepository.ts`

```ts
export interface DealershipReference {
  readonly id: string;
  readonly ianaZone: string;
  readonly weekly: WeeklyOpeningHours;      // the 7-tuple, from src/domain/openingHours.ts
}
export function findDealership(db: Db, id: string): Promise<DealershipReference | null>;
export function findServiceType(db: Db, id: string): Promise<{ readonly durationMinutes: number } | null>;

/** §5.3 — called ONLY after a 23503 on appointment_vehicle_owned_by_customer. */
export type OwnershipVerdict = 'unknown-customer' | 'unknown-vehicle' | 'not-owned';
export function classifyOwnership(db: Db, customerId: string, vehicleId: string): Promise<OwnershipVerdict>;
```

`findDealership` builds the seven-slot tuple from the `opening_hours` rows: a day with no row stays
`null`, which is the closed day AC-4 of slice 01 specified. It performs no time arithmetic and no zone
conversion — it hands `opens_at` and `closes_at` across as the strings `pg` gave it.

`classifyOwnership` returns only failure classifications. **There is no `'ok'` member**, deliberately:
the type cannot express permission, so no future edit can turn this into a pre-flight check that
gates the insert. It is one statement — **two** `EXISTS` sub-selects, corrected from three at step 4
(§0) — and §5.3 argues why it is not check-then-act.

### 2.4 `src/persistence/appointmentRepository.ts`

```ts
export interface AppointmentRow { /* the ten columns, starts_at/ends_at as Date */ }

/** ADR-0018 — both locks, in one statement, before the insert. Ruled into this module at step 4. */
export function lockResources(db: Db, bayId: string, technicianId: string): Promise<void>;

/** ONE statement. No pre-read, no ON CONFLICT, no catch. */
export function insertAppointment(db: Db, values: NewAppointment): Promise<AppointmentRow>;
export function findAppointmentById(db: Db, id: string): Promise<AppointmentRow | null>;
```

`insertAppointment` does not catch. It lets `pg`'s error out so the caller classifies it through the
one site; the `try` lives in `bookAppointment`, and `classify` is what stands between the driver error
and the layer that may not import `pg`. (Contrast `pingDatabase`, which swallows, because a boolean is
its whole contract.)

**No transaction wraps the loop — corrected at step 4, and the wording it replaces was mine and
wrong.** This said *"no `db.transaction()` anywhere on this path"*, written one step before T-02-9;
`pg_advisory_xact_lock` has nothing to scope to without one, and AC-5's amended wording says *one
transaction containing exactly one `INSERT`*. The rule it was reaching for survives verbatim: each
attempt is **exactly one transaction wide**, and wrapping the *loop* makes attempt two fail with
`25P02` instead of retrying (ADR-0004; arc42 §6's first convention). Nothing in
`.dependency-cruiser.js` can catch that; §7 makes it an explicit review item and QS-3 catches it in
slice 04.

### 2.5 `src/application/deriveInterval.ts` — where the composition order lives

The human asked where composition order lives now that literal AC-6 keeps it out of `src/domain`.
Here, in its own named module, and the reason is not tidiness.

```ts
export type Derivation =
  | { readonly kind: 'derived'; readonly startsAt: Instant; readonly endsAt: Instant;
      readonly occupancyStartsAt: Instant; readonly occupancyEndsAt: Instant }
  | { readonly kind: 'unparsable-instant' }
  | { readonly kind: 'invalid-duration' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | { readonly kind: 'reference-data-invalid'; readonly verdict: OpeningHoursVerdict };

/** Structural, so `DealershipReference` satisfies it and this module imports no persistence. */
export interface DealershipHours { readonly ianaZone: string; readonly weekly: WeeklyOpeningHours }

/** The pair, not a loose zone and weekly — ruled at step 4, §0. */
export function deriveInterval(
  startsAtMillis: number, serviceType: ServiceTypeDuration, dealership: DealershipHours,
): Derivation;
```

The body is arc42 §6.2 steps 3 and 4, in that order and only that order:

```
instant(startsAtMillis)                     → null ⇒ unparsable-instant
serviceDuration(serviceType)                → null ⇒ invalid-duration
durationMillis(duration)
appointmentInterval(startsAt, ms)
occupancyInterval(interval)
withinOpeningHours(interval.startsAt, interval.endsAt, d.ianaZone, d.weekly)
```

**It is pure**, and that is the point rather than a nicety. D-01-1 records that this composition used
to be enforced by the brands and is now *"correct because someone wrote it correctly"*; a pure module
is one the implementer can unit-test without Docker and Stryker can mutate, so what the AC-6 ruling
cost gets the strongest replacement available — **but not the one this paragraph first claimed.**

> **I-02-3, agreed and measured.** **Mutation testing does not test statement order.** None of
> Stryker's twenty mutators reorders or moves a statement — `block-statement` *empties* a block rather
> than permuting it — so a mutation score here is evidence about the **branches** and says nothing
> about whether `serviceDuration` ran before `appointmentInterval`. The honest split: branches by
> mutation, **order by explicit precedence unit tests** the implementer owns — a call whose answer
> differs under a swapped order. Weaker than a compiler, stronger than nothing, and named as such
> rather than sold as a mechanism nobody had run, in a design whose §8 exists to stop exactly that.

It is also exactly the module slice 06 needs: a reschedule derives the same interval from the same
inputs, and ADR-0003's `UPDATE` differs only in the statement at the end.

**`occupancyInterval` gets its first production call site here** — arc42 §11 records that it has none
and is exercised only by tests. It is still the identity, and passing all four endpoints out (interval
*and* occupancy) is what keeps A-4 a one-function change: a buffer changes `occupancyInterval` and the
constraint's range expression, and the two extra fields already flow to the right place.

### 2.6 `src/application/bookAppointment.ts`

```ts
export type BookOutcome =
  | { readonly kind: 'confirmed'; readonly appointment: AppointmentView }
  | { readonly kind: 'malformed-instant' }
  | { readonly kind: 'outside-opening-hours'; readonly verdict: OpeningHoursVerdict }
  | { readonly kind: 'unknown-reference';
      readonly reference: 'dealership' | 'service-type' | 'customer' | 'vehicle' }
  | { readonly kind: 'vehicle-not-owned' }
  | { readonly kind: 'no-capacity'; readonly resource: ContendedResource; readonly attempts: number }
  | { readonly kind: 'no-verdict' }                                   // T-02-9, ADR-0018 ⇒ 500
  | { readonly kind: 'reference-data-invalid'; readonly detail: string };

export interface BookDeps {
  readonly newId: () => string;
  /** I-02-6. The observer for the constraint name QS-1 and QS-2 require. See below. */
  readonly logger: Logger;
}
export function bookAppointment(db: Db, deps: BookDeps, command: BookCommand): Promise<BookOutcome>;
```

`AppointmentView` is the one shape the `201` and the `200` both return, defined once here because two
roles guessed at it independently at step 2 (T-02-3, I-02-7) and measurement 8 makes guessing unsafe:

```ts
export interface AppointmentView {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  readonly technicianId: string;      // AC-1: the ALLOCATED technician
  readonly bayId: string;             // AC-1: the ALLOCATED bay
  readonly startsAt: string;          // ISO-8601 UTC, DA-02-2
  readonly endsAt: string;            // derived, never client-supplied (AC-6)
  readonly status: 'confirmed' | 'cancelled';
}
```

`status` is a two-member union today although this slice can only produce `confirmed`, because slice
05 must be able to render `cancelled` at the same URL (§8.6: cancellation is a sub-resource precisely
so the appointment stays readable) — and because a single `Type.Literal('confirmed')` in the response
schema would **silently substitute** the constant for whatever the handler computed, which is
measurement 8 and would make slice 05's own test unable to fail. The schema is
`Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')])`, which is the only one of the
three forms measured that both enforces and does not substitute. **The enforcement is asserted on
the `POST` path only, and the argument above is about the `GET` one** — R-02-3, ruled (b) in §13 and
absorbed by slice 05, where `cancelled` becomes producible and the assertion stops needing a cast.

Discriminated union, no exceptions, per arc42 §5.2 and §8.6 — so §5.2's status mapping is one
exhaustive `switch` the compiler checks, and a seventh outcome cannot be added without `src/http`
failing to build.

`newId` is injected rather than called, so a test can fix the appointment id. It is also where
ADR-0009's per-request seed will attach in slice 04 without changing this signature.

The shape:

```
1  read dealership; null                              ⇒ unknown-reference: dealership
2  read service type; null                            ⇒ unknown-reference: service-type
3  deriveInterval(...)                                ⇒ malformed-instant | outside-opening-hours
                                                        | reference-data-invalid
4  candidateResources(...)   ← reference data only, §2.2
   bays empty                                         ⇒ reference-data-invalid   ⇒ 500   … ruled below
   technicians empty                                  ⇒ unknown-reference: service-type  … ruled below
5  loop over candidates, EACH ATTEMPT ITS OWN TRANSACTION (T-02-9, ADR-0018):
     BEGIN
       pg_advisory_xact_lock(1, hashtext(bay))        ← class 1 = bays
       pg_advisory_xact_lock(2, hashtext(technician)) ← class 2 = technicians; disjoint ⇒ total order
       insertAppointment(one INSERT)
     COMMIT
       ok       ⇒ confirmed
       23P01    ⇒ classify → {resource, constraint}
                  LOG {event:'booking.conflict', constraint, resource, attempt}   ← I-02-6
                  drop THAT BAY, or THAT TECHNICIAN, from its own list  (ADR-0009, per VALUE)
                  continue
       23503 on appointment_vehicle_owned_by_customer
                ⇒ classifyOwnership → unknown-customer | unknown-vehicle | not-owned   (never retried)
       23503 other constraint ⇒ reference-data-invalid          (never retried)
       40P01    ⇒ no-verdict                                     ⇒ 500   (never retried, ADR-0018)
                  LOG {event:'booking.deadlock', level:'error', bay, technician}
       other    ⇒ rethrow                                        ⇒ 500
   a list empties ⇒ no-capacity, resource = the list that emptied
```

Steps 1–3 run once. The loop varies only the candidate — ADR-0004, and arc42 §6.2's three
reviewer checks.

**Each attempt is its own transaction, and the loop is still not wrapped in one.** ADR-0004 already
required this — *"a constraint violation aborts the enclosing transaction, so each needs its own
transaction or a savepoint"* — and QS-3 already fails a design that wraps the loop, because the
second attempt would raise `25P02`. The locks are `pg_advisory_xact_lock`, not the session-scoped
form, precisely so an attempt releases them as it ends and no lock survives into the next candidate.

**A `40P01` is not retried, and that is a deliberate choice to fail loudly.** The obvious objection is
flakiness: if one deadlock ever slips through on a CI machine I have not measured, AC-3 fails with a
`500`. That is the outcome I want. A retry here would convert *"a write path skipped ADR-0018's
locks"* — the only thing a deadlock can now mean — into a latency blip nobody investigates, and
F-02-9 makes that a live risk from slice 06 onwards. A guard that hides the fault it exists to detect
is the failure mode this project has removed six times.

**The locks decide nothing, and §4.5 is the control that says so.** They stop two inserters being in
flight against the same bay or the same technician at once; they never read `appointment` and never
determine an outcome. The `INSERT` is still exactly one statement and is still what adjudicates.

**Pruning is per resource *value*, not per resource *class* — T-02-1.** A `no_bay_overlap` drops
**that bay** and leaves the other bays; a `no_technician_overlap` drops **that technician**. ADR-0009's
*"the whole resource is dropped, not merely the pair"* means the whole row or column of the candidate
cross-product, which is what makes the loop terminate in `|bays| + |technicians| − 1` attempts rather
than `|bays| × |technicians|`. Emptying the entire list on one failure would be neither ADR-0009's
rule nor a correct one: it refuses while capacity plainly remains, and it is what made AC-4 fail on
the first attempt under this design's earlier wording.

**The refusal's resource is a value PostgreSQL produced, and the loop does not weaken that — §4.1 and
ADR-0016 stand.** A classification prunes only its own list, so the list that empties is the one the
last classification named: one refusal exit, reached holding a freshly minted `ContendedResource`
rather than a chosen one. Slice 04's 16-attempt cap adds a **second** exit — both lists non-empty, no
emptied list to name — and that is where ADR-0016's claim needs re-measuring, in slice 04 and not here.

### The constraint name needs an observer, and did not have one — I-02-6

AC-3, AC-4 and arc42 QS-1/QS-2 all require that *"the violated constraint reported by PostgreSQL is
named `no_bay_overlap`"*. Nothing in the design as first written could observe it: `BookDeps` was
`{ newId }`, ADR-0016 Option D deliberately declines to carry the constraint on `BookOutcome`, the
problem schema has no such member, and `outside-in-tests-do-not-import-src` forbids the test reaching
into `src/`. **An outside-in test can observe exactly three things: the HTTP response, the database,
and the process's stdout.** The constraint name is in none of them.

The remedy is the third: **one structured log line per `23P01`**, written through the `pino` logger
the process already has, carrying `constraint`, `resource` and `attempt`. It is observable by the
acceptance harness, which already spawns `dist/main.js` and captures its output, and it is observed
the way an operator would observe it rather than through a seam built for a test.

Three reasons this is completing the design rather than growing it:

- **arc42 already commits to exposing the constraint name.** QS-13 requires the failed insert's span
  to carry `db.sqlstate=23P01` **and `db.constraint`**. Slice 09 builds that span; slice 02 needs the
  same fact seven slices earlier, and a log line is the same information at a lower cost. Slice 09's
  span attribute supersedes this as the primary observer and the log line stays as the cheap one.
- `src/platform` is a leaf importable by `src/application` — no rule moves, nothing is exempted.
- **The tempting alternative is worse and the implementer was right to reject it.** Having the test
  reproduce the conflict with its own SQL lets it choose the probe row's bay, so it can make either
  constraint appear at will: the assertion goes vacuous while staying green. That is the failure mode
  this project has ruled against four times.

### The empty-candidate case, ruled rather than annotated — I-02-8, T-02-7

This design contradicted itself here: the trace said `⇒ no-capacity` and the prose beneath it said
`unknown-reference: service-type`. Both roles asked for a ruling and they were right to. **The two
sub-cases are not the same failure and collapsing them was the error:**

- **Zero service bays at the dealership.** A dealership with no bays cannot perform *any* service.
  That is not a fact about the request — it is a mis-seeded dealership, and it is the same class as an
  unparseable `time_zone`. It is **the system's fault**, so it is `reference-data-invalid` ⇒
  **`500 /problems/internal`**, logged at `error` with the dealership id. Ruling it `422` would tell a
  service advisor to correct something they did not send and cannot see, and it would contradict
  §2.7's own rule three sections later.
- **No technician at this dealership qualified for this service type.** This is an entirely ordinary
  state — a dealership that does not offer gearbox rebuilds — and it is **not** broken data. It stays
  **`422 /problems/unknown-reference` with `reference: 'service-type'`**, and the reasoning is stated
  rather than assumed: the request names a *(dealership, service-type)* pair, and that pair does not
  resolve. AC-9 covers "unknown … service type"; here the service type is unknown *at the dealership
  it was asked of*, which is the only sense in which this API knows service types at all.

**I disagreed with one half of this objection and the disagreement is the substance.** Both roles
pointed at the same paragraph, but only the zero-bay case is mislabelled. Introducing a new
`/problems/service-not-offered` row for the second case was considered and rejected: no acceptance
criterion names it, §8.6's table is the client contract, and adding a client-visible failure type that
no AC asks for is a scope change wearing a design decision's clothes — which is precisely what
ADR-0017 rejects Option D for.

Either way **AC-11's `no-capacity` stays reachable only from a real database verdict**, which is
ADR-0016 holding: neither branch fabricates a `ContendedResource`, and the rule is what forced the
question to be answered properly instead of papered over.

### 2.7 `src/http/problem.ts` and `routes/appointments.ts`

```ts
export const PROBLEM_TYPES = [
  '/problems/malformed-request', '/problems/outside-opening-hours', '/problems/appointment-not-found',
  '/problems/no-capacity', '/problems/unknown-reference', '/problems/vehicle-not-owned',
  '/problems/internal',
] as const;

const Problem = Type.Object({
  type:   Type.Union(PROBLEM_TYPES.map((t) => Type.Literal(t))),   // ← §0/E-02-3: enforces, never substitutes
  title:  Type.String(),
  status: Type.Integer(),
  detail: Type.Optional(Type.String()),
  resource:  Type.Optional(Type.Union([Type.Literal('bay'), Type.Literal('technician')])),
  reference: Type.Optional(Type.String()),
  opensAt:   Type.Optional(Type.String()),
  closesAt:  Type.Optional(Type.String()),
}, { additionalProperties: false });
```

`/problems/appointment-not-confirmed` is deliberately **not** in the list: it needs rescheduling and
is slice 06's, per the slice file's out-of-scope. It joins the union there, and the union is exactly
what makes that addition a one-line, compiler-visible change.

`Type.Union` of literals rather than `Type.Literal` per code is measured (§0/E-02-3, §8) and is the
difference between QS-11's contract test being able to fail and not.

### The taxonomy could escape itself, and now cannot — I-02-5

**Condensed 2026-09-06 (T-02-9), from ~550 words.** The measurement table and its argument are in
this file's git history; the two mechanisms and the reason for each are kept.

This section claimed a handler computing a URI outside the set *"gets a loud `500`"*. Measured, that
is not what the client receives: with a `Problem` response schema, a mistyped `type` produces `500`,
`application/json`, `FST_ERR_FAILED_ERROR_SERIALIZATION` — **not `problem+json`, no `type`, wrong
status**. §8.6's `500 | Anything else` claims totality and this escapes it. The union was a backstop
that could itself become the defect. Two changes, belt and braces on purpose:

1. **A compile-time constructor**, so an out-of-taxonomy URI cannot be built:

   ```ts
   export type ProblemType = (typeof PROBLEM_TYPES)[number];
   export function problem(type: ProblemType, status: number, title: string, extra?: ProblemExtra): Problem;
   ```

   `PROBLEM_TYPES` is `as const`, so a typo is a compiler error at the call site rather than a
   serialisation failure at the client. Same move as ADR-0016's brand, one layer up, three lines.
2. **The `500` carries no `response` schema.** Measured: unschema'd, it renders exactly what the
   handler sent with the right content type. The last-resort renderer must not be able to fail —
   a schema on the one status whose job is to catch everything is a dependency the catch-all cannot
   afford. `400`, `404`, `409` and `422` keep theirs, for ADR-0005's emitted OpenAPI document and as
   the runtime backstop behind (1).

**Status mapping** — one exhaustive `switch` over `BookOutcome`, in the route:

| outcome | status | `type` |
|---|---|---|
| `confirmed` | `201` | — |
| `malformed-instant` | `400` | `/problems/malformed-request` |
| `outside-opening-hours` (verdict `closed-day`, `outside-window`, `spans-local-days`, `malformed-interval`) | `400` | `/problems/outside-opening-hours` |
| `unknown-reference` | `422` | `/problems/unknown-reference` + `reference` |
| `vehicle-not-owned` | `422` | `/problems/vehicle-not-owned` |
| `no-capacity` | `409` | `/problems/no-capacity` + `resource` |
| `no-verdict` (`40P01` under ADR-0018's locks — a write path skipped them) | `500` | `/problems/internal` |
| `reference-data-invalid` (verdict `unknown-zone`, `malformed-hours`) | `500` | `/problems/internal` |

The two `500` rows are one taxonomy row and two *outcomes*, deliberately. Both are the system's
fault rather than the client's, so they render identically; they stay separate in `BookOutcome` so
the exhaustive `switch` still names them apart and the operator's log line can. `PROBLEM_TYPES` is
unchanged: T-02-9 grew the outcome union by one and §8.6's client contract by nothing.

The `reference-data-invalid` row settles OQ-02-2 and I am settling it rather than escalating it: a dealership whose
`time_zone` is unparseable or whose `opens_at` is garbage is **the system's fault, not the client's**.
§8.6 has no row for it and needs none — `500 /problems/internal` is the row that already exists. A new
`4xx` type would tell a service advisor to fix something they cannot see and did not send. It is
logged at `error` with the dealership id, because it is the one failure here that someone must act on.

### `readAppointment` and its outcome — T-02-3, I-02-7

`ReadOutcome` did not exist, so §5.2's *"the mapping is one exhaustive `switch` the compiler checks"*
reached the `POST` route and not the `GET` one. It exists now, and the `GET` route's `switch` is
exhaustiveness-checked exactly as the `POST` route's is:

```ts
export type ReadOutcome =
  | { readonly kind: 'found'; readonly appointment: AppointmentView }
  | { readonly kind: 'not-found' };

export function readAppointment(db: Db, id: string): Promise<ReadOutcome>;
```

`found` ⇒ `200` + `AppointmentView`; `not-found` ⇒ `404 /problems/appointment-not-found` (AC-2). The
`200` and the `201` return the **same** shape from the same TypeBox schema, so a client parses one
thing and AC-1's "naming the allocated bay and technician" is asserted against the same fields on both
paths.

**Request schema.** Body: `customerId`, `vehicleId`, `serviceTypeId`, `dealershipId` as uuid-patterned
strings, `startsAt` as an RFC 3339 pattern, `additionalProperties: false`. Path: `id` as a uuid
pattern, so a non-uuid path segment is `400 /problems/malformed-request` and only a well-formed
unknown id is AC-2's `404`.

**AC-6 falls out of the schema, and I checked that it does rather than assuming it.** Measured: a body
carrying an extra `endsAt` returns `201` with the property **stripped**, because Fastify's default
ajv options set `removeAdditional: true`. So a supplied end never reaches the handler — and there is
no `endsAt` parameter anywhere on the path to receive it, since `appointmentInterval` takes only a
start and a duration. Two independent reasons, one of which is structural — and only the structural
one is observable, because stripping a property nothing reads changes no byte the client sees
(§13).

**AC-8 needs `setErrorHandler`, and it works.** Measured: a body failing the `startsAt` pattern
returns `400` with `content-type: application/problem+json; charset=utf-8`, the handler never runs,
and the rendered body is the problem document. Fastify's validation error is a `FST_ERR_VALIDATION`
with `statusCode: 400`, mapped to `/problems/malformed-request`.

### 2.8 `src/main.ts`

Two more bound use cases in the `buildServer` record, following 00a's partial-application shape
exactly. `newId: () => crypto.randomUUID()` — `crypto` is a Node global, so `src/application` acquires
no import and `no-dev-dep-in-src` and the layering rules are untouched.

---

## 3. Sequencing, and why one red commit is enough

**Spent — condensed 2026-09-06 (step 4), from ~250 words to this.** The red is one commit at
`34b057b`, observed: 291 tests, 27 failed, **0 non-assertion failures**, so all three families failed
as assertions rather than as collection errors (criterion C1). The recommended green order — domain
first, then `schema.ts`/`pgError.ts`/the repositories, the pure derivation, the two use cases, the
edge, and AC-3/AC-4 last — was followed; step 4 closed at `fae2aff` with 17 of 19 acceptance criteria
green and the two concurrency cases blocked on I-02-9, ruled in §0. The argument that one commit
carrying every outside-in test satisfies §7's *"exactly one red commit per slice"* is in this file's
git history.

---

## 4. §2.1 made unrepresentable — what fails if check-then-act comes back

The human asked for this specifically, and it needs one uncomfortable observation first.

> **You cannot detect check-then-act in this system from its behaviour.** The exclusion constraint
> makes it *harmless*: a check-then-act booking path still never double-books, because the constraint
> still adjudicates the write. It is merely slower and racier-looking. **So QS-1 and QS-2 do not catch
> it** — they would pass over a reintroduced check. That is why AC-5 is a source-tree inspection and
> not a runtime assertion, and it is why the mechanisms below are compile-time and scan-time.

Three structural mechanisms, then — added at step 2 — the runtime control §4 was missing. Each was
run before being claimed.

### 4.1 A capacity refusal is not constructible without a database verdict — `tsc`

`ContendedResource` is `('bay'|'technician') & { __brand }`, minted only inside `classify()` from
`err.constraint`. `BookOutcome`'s `no-capacity` variant carries that type. **To refuse a booking for
capacity reasons you must be holding a value PostgreSQL produced.**

Measured, `typescript` 6.0.3 from this repository, `--strict`:

| Tree | Result |
|---|---|
| conforming (`pgError.ts` + a use case that refuses from a `PgOutcome`) | **exit 0** |
| the same tree plus a planted `if (!free) return { kind: 'no-capacity', resource: 'bay', attempts: 0 }` | **exit 2** — `error TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` |

**The claim is narrowed to what was measured, in the same way §5.2 narrowed the partial-application
claim at 00a.** A cast defeats it: I planted `resource: 'bay' as ContendedResource` and the same tree
compiles **exit 0**. So the honest statement is that the brand **forecloses every shape that does not
cast**, and a cast is a single greppable token confined by 4.2. It is not "no other shape compiles" —
that would be a claim about the compiler the compiler does not support, and the next person needing an
escape hatch would find one and conclude the rule was decorative.

### 4.2 The booking path has nothing to read — a scan with a named residue

Proposed for `tests/architecture/` (test-engineer's file; the marker definition is mine, the
implementation theirs), built to §7.2.1's standard — defined as a **concept**, with a planted control,
a conforming control and a corpus guard:

| Marker | Concept | Permitted |
|---|---|---|
| `appointment-table-access` | the table name `appointment` used as a Kysely table reference or inside a `sql` template | `src/persistence/appointmentRepository.ts` only |
| `contended-resource-cast` | `as ContendedResource` | `src/persistence/pgError.ts` only |

**The specification was incomplete and is completed here — T-02-2, agreed in part and disagreed in
part; the measurement is in §12.** The two markers fail in opposite ways and need opposite remedies.
E-02-2's misses two of three planted violations even when violations exist — blindness, and it needs
the concept redefined. This one catches both planted forms and reports zero at HEAD *correctly*,
because nothing outside `appointmentRepository.ts` touched the table when no repository existed. What
it lacked was the **four mechanisms slice 01's scan has and §4.2 failed to specify**, which is what
makes a green from it mean anything:

1. a **corpus guard** — assert what was examined, by name, before any assertion about violations;
2. a **planted control** in a fixture tree, per marker, so the scan is shown to fire;
3. a **conforming control**, so it is shown not to fire on legitimate code;
4. a **positive assertion**: `src/persistence/appointmentRepository.ts` **must** match
   `appointment-table-access`. *Exactly* that file, not *at most* that file.

Mechanism 4 is the one that matters most and it is the one that was missing. It makes the scan
non-vacuous — a scan reporting zero because its glob is wrong now fails, instead of passing the way a
clean tree passes — and it gives this marker real content in the red commit, since the file does not
exist yet.

**Residue, named rather than promised away** — the same class §11 already records for
`duration-arithmetic` and `outside-in-tests-do-not-import-src`, and irreducible for a text scan: a
computed or interpolated table name; a database view over `appointment`; a helper in
`appointmentRepository.ts` that legitimately holds the token and is then called from anywhere. The
first two are gaps in the scan, not licences — a spelling not listed is a finding to raise. The third
is why 4.1 exists, and 4.4 is why the residue is now smaller than a scan alone could make it.

### 4.4 The runtime leg — the constraint is what adjudicates, and the test proves it by removing it

**Condensed 2026-09-06 (step 4): the control is built, in
`tests/integration/exclusion-constraint-adjudicates.test.ts`.** This section presented itself as the
complete answer to *"what fails when someone reintroduces check-then-act in six months"* while
containing **no runtime evidence at all**. The test-engineer noticed and offered two additions
without objecting. One is adopted in full:

> **The DDL-drop negative control.** Drop `no_bay_overlap` inside a transaction, run the 20-racer race
> from AC-3 against the same fixture, observe **more than one** confirmed row for the bay, roll back.
> Restore it and observe exactly one.

That single test is the strongest evidence this submission can produce for its headline claim, and it
is the only one about the *mechanism* rather than the code around it: **with the constraint, one row;
without it, several — the application code byte-identical in both runs.** It converts §2.1 from *"we
wrote it this way"* into *"we removed the thing and watched it break"*, which is the standard
`CLAUDE.md` §2.4 sets for tests and which this design had not applied to the invariant itself. It is a
database-invariant test, so the test-engineer's by §5.

**The second addition is deferred and the reason is not cost.** A `pg_stat_statements` (or
`log_statement=all`) detector counting `SELECT`s against `appointment` during an uncontended booking
would give AC-5 a runtime leg. It is a good idea and it is **not this slice's**: AC-5 is worded as a
source-tree *inspection* by the human's own hand, the extension needs `shared_preload_libraries` in
the Testcontainers configuration, which is deployment surface (§7) that nothing else in this slice
touches, and this slice already carries three things. Recorded as **F-02-6** for §11 routing rather
than dressed up as a DCR ruling — it is an offered addition, not an objection, and (b) is a verdict on
objections.

### 4.3 The policy core still cannot consult the database — `dependency-cruiser`

Unchanged from slice 01 and re-stated because this is the slice where it does work: `domain-is-pure`
with `to: {}` means `openingHours.ts` cannot import a database client, so AC-7's decision — the one
GC-1 is about — is structurally incapable of reading a booking. That rule's firing was measured at
slice 01 (planted intra-domain import ⇒ `domain-is-pure` reported by name; `pathNot` restored ⇒ clean
at 91 dependencies) and is guarded by a planted control in `tests/architecture/layering.test.ts`. I am
citing that measurement, not making a new one.

**What none of the three catches**, so it is on the record rather than discovered: a use case that
calls `candidateResources`, gets a list, and *decides to give up without attempting an insert* is
check-then-act with the read supplied by reference data. §2.6 step 4 is exactly that shape and is why
it maps to `unknown-reference` rather than `no-capacity` — but the reason it is safe is an argument in
this document, not a mechanism. It is the residue, it is small, and it is review's.

### 4.5 ADR-0018's locks make this section weaker, and here is exactly how much — T-02-9

Everything above rests on an uncomfortable fact stated in ADR-0016: the exclusion constraint makes
check-then-act **harmless**, so no behavioural test can catch it. ADR-0018 makes that worse. Under a
per-resource lock, a booking path that reads availability and then decides would no longer merely be
harmless — inside the lock it would be **correct**. That is ADR-0004 Option D's own honest admission
arriving through a side door, and softening it here would be the failure this project has spent four
slices removing.

What survives, and it is not nothing:

- **The brand still holds.** A refusal is still constructible only from a value `classify` minted
  from a `23P01`, and `no-verdict` deliberately carries nothing to mint one from. Locking changed
  neither the type nor its single minting site.
- **The scan still holds.** The locks are taken on `hashtext(bay_id)` and `hashtext(technician_id)`
  — reference ids. Nothing on the booking path reads `appointment`, so `appointment-table-access`
  still fires on a reintroduced check.
- **The controls still hold, and one is new.** §4.4 drops the DDL and shows the constraint is what
  adjudicates. Its mirror drops the *lock* and shows the lock is not: measured, 20 racers, locks
  removed and constraints kept ⇒ **exactly one row** and 108 deadlocks; constraints removed and
  locks kept ⇒ **20 overlapping rows**. Correctness is entirely the constraint's; liveness is
  entirely the lock's, and the pair is what turns that sentence from a claim into a reading.

**The lock-drop control was named here and never built — R-02-2, and this wording is why.** It
belongs beside §4.4's in `tests/integration/exclusion-constraint-adjudicates.test.ts`, under QS-1
and QS-2 as §4.4's already does; it is one added case in an existing file and **not a new acceptance
criterion**, because a new AC needs a new red and this slice's file already says that a second red
commit means it was two slices. §4.4 stated its control imperatively and it was built. This sentence
stated its own descriptively, after the red commit, in a ruling section, naming no owner and no
step — and it was dropped without a record. **Ruled (b) in §13**, absorbed by slice 05 under
[ADR-0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md),
which also carries the four-cell matrix and names the three cells the suite asserts today.

---

## 5. The error taxonomy — AC-7 to AC-12

### 5.1 Every row is reachable, and here is the one that was not obvious

Measured against this repository's migrations on `postgres:16-alpine`:

| Failure | SQLSTATE | `err.constraint` |
|---|---|---|
| unknown vehicle, real customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown customer, real vehicle | `23503` | `appointment_vehicle_owned_by_customer` |
| both real, vehicle not owned by that customer | `23503` | `appointment_vehicle_owned_by_customer` |
| unknown service type | `23503` | `appointment_technician_qualified` |
| unknown dealership | `23503` | `appointment_bay_in_dealership` |

**The first three are indistinguishable from the error alone.** AC-9 wants two of them to be
`/problems/unknown-reference` carrying `reference`, and AC-10 wants the third to be
`/problems/vehicle-not-owned` — a different `type`, and QS-11 requires that no two rows collide. So a
disambiguating step is **structurally required**, not a design preference. That is ADR-0017.

Rows four and five are unreachable through the booking path: an unknown dealership yields no bays, and
an unknown service type yields no duration, so both are refused at steps 1–2 before any insert.

**This paragraph conflated two things and T-02-4 was right to separate them — and the news is good.**
It read *"they map to `reference-data-invalid` ⇒ `500`, and that arm is unreachable over HTTP"*. Those
are two different claims about two different things:

- **The `reference-data-invalid` outcome is reachable over HTTP**, via a *different* producer: a
  dealership seeded with an unparseable `time_zone` gives `unknown-zone`, and one with a malformed
  `opens_at` gives `malformed-hours` (§2.7), and the zero-bay case ruled in §2.6 gives a third route.
  So `500 /problems/internal` is a reachable row and **AC-12 is fully satisfiable end to end** — every
  row of §8.6's table, with no defended-but-unexercised exception. That is a better position than this
  design claimed for itself.
- **What is unreachable is one *producer* of it**: a `23503` naming
  `appointment_technician_qualified` or `appointment_bay_in_dealership`. Those arms are defended, not
  exercised over HTTP, and their mutants are killed by unit tests of `classify` and the mapper or not
  at all.

Said plainly and split, because slice 01's R-01-4 is what happens when an unreachable arm goes
unnamed — and because the imprecise version understated what the contract test can actually assert,
which is the opposite error and just as worth correcting.

### 5.2 Precedence, when two failures apply at once

Measured: a request with **both** a bad vehicle and a slot conflict raises **`23P01`, not `23503`** —
`no_bay_overlap`. Exclusion constraints are enforced at index insertion, during the tuple insert; the
composite FK is an `AFTER ROW` trigger at end of statement. The exclusion always wins.

So a contended booking for an unknown vehicle is a `409`, not a `422`. That is **not** a QS-11
collision — each failure still has exactly one status and one `type` — it is a *precedence* between
two co-occurring failures, and it needs stating so the contract test does not stage an ambiguous
fixture and then assert the wrong one. **AC-9's and AC-10's fixtures must be uncontended.**

### 5.3 `classifyOwnership` is not check-then-act, and the reason is not "it is only a read"

One statement, **two** `EXISTS` sub-selects over `customer` and `vehicle`, run **only after** an
`INSERT` has already been refused by the database. There is no third asking whether the vehicle is
*owned*: the FK is `(vehicle_id, customer_id) REFERENCES vehicle (id, customer_id)` and has just
answered that, so a sub-select whose only reachable answer is `false` would be an equivalent mutant
rather than evidence (ruled at step 4, §0). Three properties, and all three are needed:

1. **It runs strictly after the write.** There is no window, because there is nothing after it to
   have a window before.
2. **Its result cannot permit anything.** `OwnershipVerdict` has three members and none of them is
   `'ok'`. The type cannot express permission, so no later edit turns this into a pre-flight gate
   without changing the type — which is visible in a diff.
3. **It reads reference data only**, exactly the category ADR-0001 admits for opening hours: a static
   property of the request, uninvalidatable by a concurrent booking.

The alternative — validating ownership *before* the insert — is genuinely tempting and is rejected in
ADR-0017 for a reason worth stating here: it would make the composite FK's `23503` arm unreachable,
which is R-01-4's exact shape (a correct, measured constraint made inert by its consumer), and arc42
§6.6 and §8.6 both already say the FK is what decides ownership.

---

## 6. The two ratified remedies — AC-13 to AC-19

**Condensed 2026-09-06 (step 4), from ~500 words to this: AC-13 to AC-19 are merged and green at
`06d5894` and `278f198`, and the code is now the record.** ADR-0014 and ADR-0015 name their remedies
exactly; this section applied them and added nothing. What survives is what the definition of done
asks for — **named mutants, not a score** — and the two claims of mine the measurements corrected.

**ADR-0014** bounds `instant()` at `±8_640_000_000_000_000` and reuses the **existing**
`malformed-interval` verdict in `openingHours.ts` (AC-16, no new variant). The literal appears in two
domain files with no mechanism to share it: **D-01-2** cashing in, ADR-0014's own *"Bad, or
deferred"*, and the slice file's out-of-scope — reversing the AC-6 ruling to avoid a duplicated
constant is a scope change and the human's. Carried in §10.

**ADR-0015** adds one branch before the `startsOn !== endsOn` comparison: an end rendering as exactly
`00:00:00` **and** on the local date immediately following the start's is `secondsOfDay = 86400` on
the start's day. Both clauses are load-bearing — without the second, a 48-hour interval ending at
midnight two days later normalises into the start's day and is silently accepted. **The successor test
is a local-calendar-date comparison, never epoch arithmetic**, because a DST transition changes the
number of milliseconds in a local day and DST is this function's entire subject. AC-19 is reachable
with real data because `pg` hands a `time` column's `'24:00:00'` across as the string
`"24:00:00"` — the arm stops being unreachable by becoming **live and killed**, which ADR-0015 argues
beats retiring it by deletion.

| Mutant | Killed only by |
|---|---|
| `<=` → `<` on the epoch bound | AC-14's exact `±8_640_000_000_000_000` |
| delete `Math.abs` | a negative value **beyond** the bound — *not* AC-14's `−MAX`. **I wrote that claim without running it and the test-engineer's measurement corrected it at step 3** |
| delete the whole step-4 normalisation | AC-17 |
| **delete the "immediately following" clause**, keeping the `00:00:00` test | a >24h interval ending at local midnight — *not* by AC-17 |
| delete step 4 entirely | AC-18, the negative control — AC-17 alone is satisfied by deleting the check |

---

## 7. Quality scenarios

The slice declares `[QS-1, QS-2, QS-11, QS-9, QS-12]`. All five apply. Notes only where the slice
changes what the scenario means.

- **QS-1 / QS-2** (AC-3, AC-4) — become executable end to end for the first time. Both must assert
  over the **table**, not the responses. **Their response half is determinate only because of
  ADR-0018** (T-02-9): without the locks, three losers in four are told `500`, and the constraint
  name each loser reports is a property of who won rather than of the constraint. Their determinism
  otherwise comes from §2.6's loop (E-02-1), and the constraint name
  they require is observed through §2.6's `booking.conflict` log line (I-02-6). On the failure message:
  there is no seed to record in this slice — see F-02-7 — so it carries the candidate order and the
  fixture ids instead. **§4.4's DDL-drop control belongs to this pair**: it is what makes QS-1 evidence
  about the *constraint* rather than about the code around it.
- **QS-11** (AC-12) — the taxonomy. Its "also asserts the emitted OpenAPI document matches the
  committed one" clause is **slice 09's** and is explicitly out of scope here; the contract test
  covers the status/`type` half. The union-of-literals schema (§2.7) is what lets this test fail when
  it should.
- **QS-9** — extended by AC-17 to AC-19: the generator must now produce dealerships closing at
  `'24:00:00'` and intervals ending at local midnight, including across a DST boundary. QS-9's
  as-built note in §10 still stands — **one zone, one year**.
- **QS-12** — this is the slice that grows the corpus from twelve files to twenty-two, and the first
  where "a marker matches in exactly one file" is a real claim. **See E-02-1's sibling, E-02-2:
  the `wall-clock-and-zone` marker cannot survive this slice unchanged.**
- **QS-10** — not declared, but it runs on every commit and this slice adds ten modules across four
  layers. If any of them needs a rule relaxed, that is a DCR and not an edit to
  `.dependency-cruiser.js`.

Not applicable and worth saying so: **QS-3** (no spurious refusal) is slice 04's even though the loop
lands here — the loop makes QS-3 *pass*, and slice 04's job is the ordering, the
cap, and the scenario that pins them. **QS-13** (telemetry) is slice 09's; this slice adds no spans,
and an empty OTel bootstrap now would be the junk drawer §5.2 warns about.

---

## 8. Everything this design measured

Per the human's standing instruction — *every mechanism you assert must be one you ran*. Nine
measurements, all re-runnable.

| # | Claim | How it was measured | Result |
|---|---|---|---|
| 1 | Which constraint is reported when both exclusion constraints are violated | `postgres:16-alpine`, both constraints, three insert cases | `no_bay_overlap` — the first-created index |
| 2 | That ordering is creation order, not a contract | same, with the constraints created in reverse in a second table | reports `no_technician_overlap2` |
| 3 | `23P01` precedes `23503` | one insert violating the vehicle FK **and** the bay exclusion | `23P01 no_bay_overlap` |
| 4 | Unknown vehicle / unknown customer / not-owned are indistinguishable | three inserts against the real migrations | all three: `appointment_vehicle_owned_by_customer` |
| 5 | A fabricated capacity refusal is a compile error | `tsc --strict` over a conforming tree, then with a planted check-then-act | exit 0 → **exit 2, TS2322** |
| 6 | …but a cast defeats the brand | same tree with `as ContendedResource` | exit 0 |
| 7 | A schema violation is `400` before the handler, as problem+json | Fastify 5.12.1 `inject`, RFC 3339 pattern | `400`, handler never ran, `application/problem+json` |
| 8 | `Type.Literal` substitutes; a literal **union** enforces; `Type.String({enum})` does neither | three response schemas, one bad value each | substituted / `500` / passed through |
| 9 | `time` arrives as a string and `'24:00:00'` survives; `timestamptz` arrives as a `Date` | `pg` 8.23 against a real container | `"09:00:00"`, `"24:00:00"`, `Date` |
| 16–22 | T-02-9, in seven measurements: the finding re-run (285 `40P01` of 400 losers); retry livelocks five ways; `deadlock_timeout` is a superuser GUC; `ON CONFLICT DO NOTHING` loses capacity entirely; ADR-0018's locks over 56 races; the lock is liveness not correctness; and what it costs uncontended | **[ADR-0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md) carries all seven with their tables** — not restated here |

Two of these corrected an assumption I had written down before running it, and both are recorded
rather than quietly fixed: I expected `Date.parse('2026-02-30T10:00:00Z')` to be `NaN` and it is not
(F-02-2), and I expected `additionalProperties: false` to **reject** an extra property, where Fastify
in fact **strips** it (§2.7).

### Measured again at step 2, and again at step 3

**Every measurement either role reported was re-run rather than taken on trust** (rows 10–15 at step
2, rows 16–22 at step 3). That is not distrust: it is the only way an adjudication can disagree with
a measurement on anything but authority. All six step-2 re-runs reproduced, and one of them produced
the disagreement recorded in §12.


## 9. Assumptions, open questions and findings

### Assumptions

- **DA-02-1** — the appointment id is minted by the application (`crypto.randomUUID`), not by
  `gen_random_uuid()`. The table has no default and the id is wanted before the write. A retried
  attempt **reuses** the same id, because the failed attempt inserted nothing.
- **DA-02-2** — `AppointmentView` renders `startsAt`/`endsAt` as ISO-8601 UTC strings via
  `Date.prototype.toISOString`, not in the dealership's local zone. Rendering in local time would put
  zone reasoning in the HTTP layer, which QS-12 forbids and which ADR-0001's "convert instant → local,
  never the reverse" rule exists to keep in one place.

### Open questions — recorded, not resolved

- **OQ-02-1** — should the edge reject a calendar-invalid but pattern-valid date? See F-02-2. My
  recommendation is **no** for this slice: fixing it means a leap-year calculation in `src/http`, and
  slice 01 already ruled that a second calendar implementation is a risk this design rejects. Recorded
  as a limitation instead.
- **OQ-02-2** — *closed by me, noted so it does not reopen*: broken dealership reference data
  (`unknown-zone`, `malformed-hours`) maps to `500 /problems/internal`. §8.6 needs no new row; see
  §2.7.

### Findings raised by this design

- **F-02-1** — the constraint reported under double violation is decided by index creation order
  (measurements 1–2). arc42 §11 R-3 says the constraint *names* are behaviour; it should also say
  that the *choice between them* is not a contract. **arc42 §11 — outside declared scope, route.**
- **F-02-2** — `Date.parse('2026-02-30T10:00:00Z')` silently yields 2026-03-02T10:00:00Z. The RFC 3339
  pattern accepts day 30 in February because a regex cannot know the month's length, so a client can
  book a date it did not name, up to three days out. Not an AC failure and not fixed here. See
  OQ-02-1. **Route to §11.**
- **F-02-3** — `23P01` precedes `23503` (measurement 3). Belongs in §8.6 beside the taxonomy, which
  **is** in scope, and is proposed in §10.
- **F-02-4** — the `ContendedResource` brand is defeated by a cast (measurement 6). Residue is the
  §4.2 scan plus review. **Route to §11.**
- **F-02-5** — `src/persistence/schema.ts` is about to become a real second statement of the schema,
  which is R-6. Slice 00 could not cash that in because the interface was empty. It is now live and
  nothing checks it. **Route to §11.**
- **F-02-6** *(step 2, from the test-engineer's offered addition)* — AC-5 has no runtime leg. A
  `pg_stat_statements` or `log_statement=all` detector asserting **zero** `SELECT`s against
  `appointment` during an uncontended booking would give one. Deferred from this slice for the reasons
  in §4.4, not for cost. **Route to §11.**
- **F-02-7** *(step 2, T-02-8)* — the slice file's Definition of Done requires the concurrency tests to
  *"record ADR-0009's seed in the failure message"*. **There is no seed in slice 02**: candidate
  ordering is deterministic (`ORDER BY name` for bays, `ORDER BY id` for technicians) and ADR-0009's
  seeded shuffle is slice 04's. The *intent* — a failing interleaving must be re-runnable rather than
  a flake — is satisfied more strongly than by a seed, because a deterministic order is reproducible
  by construction with nothing to record. What the failure message should carry instead is the
  candidate order actually used and the fixture ids. **The DoD wording is the human's and is routed,
  not edited here**; the substance is settled above so step 3 is not blocked on it.
- **F-02-8** *(T-02-9)* — `hashtext` is an undocumented internal function. ADR-0018 needs only *a*
  deterministic `int4` per id, so an application-side hash would serve identically. **Route to §11.**
- **F-02-9** *(T-02-9)* — **every write path to `appointment` must take ADR-0018's two locks in its
  order.** Slice 06's reschedule `UPDATE` and slice 07 inherit it; one that skips them reintroduces
  the deadlock against a booking. This sits beside arc42 §8.2's existing *"inherited obligation for
  slice 06"* and is the second thing that slice owes. **Route to §11 and §8.2.**

- **F-02-10** *(T-02-9)* — **`docs:adr-check` does not notice a new ADR.** It checks only records
  already in `tools/docs/adr-baseline.json`, so ADR-0018 is unpinned: a later condensation could drop
  one of its eight options and the guard would stay green while reporting *"17 ADR(s) checked"*.
  Running `--rebaseline` fixes it and also rewrites all 17 existing pins, because the pinned file is
  stale relative to the tool's current extraction — 367 insertions, 175 deletions of unrelated churn.
  I did **not** take that inside a DCR commit: it would bury the one entry it was meant to add. It is
  a tooling commit of its own, and the guard should fail on an unbaselined ADR rather than skip it.
  **Route to the tooling owner.**
- **F-02-11** *(step 5, R-02-2)* — **an instruction stated in prose creates no work item.** §4.4's
  control was written imperatively and was built; §4.5's was written descriptively and was dropped,
  and nothing noticed until review. §0's list is what the orchestrator queues from, and §4.5's
  instruction was never in it. Same family as R-02-4 (O-29), third instance in this slice: work that
  was ruled but never queued. **Remedy: a ruling that creates work carries a numbered item in §0,
  not a sentence in a paragraph. Route to the orchestrator.**

### The acceptance-criterion wording I want changed — R-02-1

`docs/slices/02-book-and-read-an-appointment.md` is the orchestrator's; this is the exact wording,
not an edit. **AC-3 and AC-4 are unchanged.** AC-5 changes what it permits, and I am calling that a
change rather than a clarification because it is one:

> **AC-5** — Given the source tree, when it is inspected, then no code path reads availability and
> then decides whether to insert. Each booking attempt is one transaction containing exactly one
> `INSERT` into `appointment`, preceded only by ADR-0018's two advisory-lock acquisitions — which
> read no table and decide nothing.

Without it, AC-5's *"the booking path is a single `INSERT` per attempt"* reads as *a single
statement*, and a reviewer applying it literally at step 5 would be right to block on the lock. The
substance AC-5 exists for — no read-then-decide — is untouched, and the added clause is a
restriction on what may precede the insert, not a permission slip.

---

## 10. Proposed arc42 edits — for step 7, as-built rather than as-designed

Within the declared scope `["§5.2", "§6.1", "§8.6", "§10.2"]` — **§10.2 was added at step 5 under
R-02-1**, over the marker split that `dd9bd44` had already hand-edited into §10 at step 2. That text
is therefore as-built already, and step 7 verifies the merged wording rather than making a new edit.
These are proposals; arc42 is corrected at step 7 to what actually merged, not now.

**§5.2** — five new module rows under `src/http`, `src/application` and `src/persistence`. An
*As built at slice 02* block recording: that `candidateRepository` reads **reference data only** in
this slice and why (§2.2); that `deriveInterval.ts` is where D-01-1's composition order landed and is
pure; that `occupancyInterval` has its first production call site; and the `ContendedResource` brand
with its measured claim **and** its measured cast escape, narrowed exactly as the 00a
partial-application claim was. **Added at step 4** (§0): `deriveInterval` takes a `DealershipHours`
pair rather than a loose zone and weekly, and why; `lockResources` sits beside the insert in
`appointmentRepository.ts`, as the strongest available form of F-02-9's obligation; and
`classifyOwnership` is **two** `EXISTS`, because the third could only ever answer `false`.

**§6.1** — **T-02-9 first**: the diagram's *"R2 **blocks** on R1's in-progress row … and resumes when
R1 ends"* is measured to be false under simultaneity — R2 and R1 form a cycle and one is aborted with
`40P01`. §6.1's sequence gains ADR-0018's two lock acquisitions before the `INSERT`, the `40P01` arm,
and a corrected note saying what the serialisation point actually is. It also gains the `23503`
classification step (§5.3) and the precedence measurement
(F-02-3): `23P01` is raised at index insertion and beats the FK's after-row trigger. An as-built note
that slice 02 builds ADR-0004's loop without ADR-0009's seeded shuffle or attempt cap, both of which
remain slice 04's (E-02-1). **Added at step 2:** pruning is per resource **value** (T-02-1),
and the `booking.conflict` log line is where the constraint name is observable until QS-13's span
carries `db.constraint` at slice 09 (I-02-6).

**§8.6** — **no new row**, and that is worth recording rather than assuming: T-02-9 added an outcome
and not a status. The `500 | Anything else` row's *"Decided by"* column gains `40P01` beside broken
reference data. Then five additions: the `500 /problems/internal` reading for broken reference data, now
including a dealership with **zero service bays** (§2.6, ruled at step 2); the precedence rule of
F-02-3; that a `(dealership, service-type)` pair with no qualified technician is
`422 /problems/unknown-reference` and **not** a new taxonomy row; the rule that the problem schema
declares `type` as a **union of the taxonomy's literals** with a compile-time `ProblemType`
constructor in front of it; and — **added at step 2, I-02-5** — that the `500` carries **no response
schema**, because the taxonomy's catch-all must not be able to fail its own serialisation and produce
a non-`problem+json` `FST_ERR_FAILED_ERROR_SERIALIZATION` (measurements 14–15). The recorded
`400`-versus-`422` tension for out-of-hours is left recorded and not harmonised, per the slice file's
definition of done.

**§5.2** additionally gains the `PgOutcome` `no-verdict` variant and the sentence that earns it: a
capacity refusal requires a verdict, and a deadlock is the absence of one.

**Outside the declared scope — flagged for the orchestrator to route, not taken:** §8.2 (F-02-9's
lock obligation, beside the existing slice-06 obligation), §11 (F-02-8, F-02-9, and §4.5's admission
that ADR-0018 weakens ADR-0016's argument), §10 (E-02-2,
QS-12's marker — **blocking on step 3**), §8.5 (E-02-3, two measured rows and reversed guidance, plus R-02-3's reading that a request
schema's `additionalProperties: false` strips rather than rejects, so this API is lenient about
unknown request properties and stays so under Fastify's defaults),
§11 (F-02-1, F-02-2, F-02-4, F-02-5, and the D-01-2 duplication cashing in for the second time).

---

## 11. ADRs

Four genuinely new decisions, the fourth added at step 5. All `status: proposed`: they are the architect's recommendation and the
human's to rule at this slice's gate, which is the pattern ADR-0011 through ADR-0015 established. Both
therefore appear in §11.1's generated register as debt until ruled.

- **[ADR-0016](../adr/0016-a-capacity-refusal-requires-a-database-verdict.md)** — a `no-capacity`
  outcome is constructible only from a value minted by SQLSTATE classification. §4.1.
- **[ADR-0017](../adr/0017-the-composite-ownership-fk-is-disambiguated-after-it-fires.md)** — the
  three failures that share `appointment_vehicle_owned_by_customer` are separated by a classification
  read **after** the insert is refused, never by a pre-flight check. §5.3.
- **[ADR-0018](../adr/0018-lock-the-bay-and-the-technician-before-each-insert.md)** — two
  class-scoped advisory locks per attempt, and a deadlock is an internal fault rather than a
  refusal. T-02-9, §4.5. **Decided by me under the 2026-09-06 amendment**, unlike the other two,
  which are recommendations awaiting the human. It is provisional until the gate all the same.
- **[ADR-0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md)**
  — a control is deferred only to a slice that makes it cheaper or stronger; a deferral that cannot
  name one is an omission. The (b) rulings on R-02-2 and R-02-3 are mine; the **criterion** that
  permits them is the human's to rule, which is why it is a record and not a note. §13.

**No ADR is proposed for the retry loop.** ADR-0004 already decided it; E-02-1 was a scope conflict
between two statements in a human-authored slice file, and the remedy was a ruling, not a new decision
record.

---

## 12. What step 2 produced — the rulings

Both roles objected substantively and both were right about something the design got wrong. Under
`CLAUDE.md` §6's *"Adjudication is reasoned before it is applied"*, each objection got a verdict with
its reasoning and the exact change named **before** any amendment was made; the amendments above are
that one pass, with the rulings attached here.

**Every measurement either role reported was re-run rather than taken on trust** (§8, rows 10–15).
That is not distrust — it is the only way an adjudicator can disagree with a measurement on anything
except authority, and one of the six re-runs is what produced the disagreement below.

| # | Objection | Verdict | Ruling | Change made |
|---|---|---|---|---|
| **T-02-1** | "prune the whole" does not produce AC-4; three statements disagree | **AGREE** | **(a)** | §0 and §2.6 now say per-**value**, quoting ADR-0009. Trace corrected |
| **T-02-2** | `appointment-table-access` reports zero; E-02-2 one layer down | **AGREE in part, DISAGREE in part** | **(a)** | §4.2 gains the four mechanisms and a **positive** assertion. See below |
| **T-02-3 / I-02-7** | the `201`/`200` body is never specified; `ReadOutcome` missing | **AGREE** | **(a)** | `AppointmentView` and `ReadOutcome` defined in §2.6 and §2.7 |
| **T-02-4** | the §5.1 unreachability claim is wrong | **AGREE** | **(a)** | §5.1 splits outcome from producer. AC-12 is fully satisfiable |
| **T-02-8** | the DoD's seed does not exist until slice 04 | **AGREE** | **(a)** + route | F-02-7. Substance settled; the DoD wording is the human's |
| **I-02-3** | Stryker does not reorder statements | **AGREE** | **(a)** | §2.5 narrowed: mutation covers branches, precedence tests cover order |
| **I-02-5** | the `ProblemType` builder; `FST_ERR_FAILED_ERROR_SERIALIZATION` | **AGREE** | **(a)** | §2.7: compile-time builder, and no `response` schema on `500` |
| **I-02-6** | the constraint name has no observer | **AGREE**, blocking | **(a)** | §2.6: `BookDeps.logger`, one structured line per `23P01` |
| **I-02-8 / T-02-7** | the empty-candidate case is annotated, not ruled | **AGREE in part, DISAGREE in part** | **(a)** | §2.6 splits it: zero bays ⇒ `500`; no qualified technician stays `422` |
| **E-02-1** | "there is no third option" is overstated; P1 and P2 exist | **AGREE** | **queued** | §0 corrected; the test-engineer's stronger AC-11 argument adopted |
| **E-02-2** | misattributed to ADR-0006; the marker is also too loose | **AGREE** | **(a)** for the spec, **queued** for the arc42 wording | §0: attribution corrected, two markers specified |
| — | *addition*: DDL-drop negative control | **ADOPTED** | — | §4.4 |
| — | *addition*: `pg_stat_statements` runtime detector | **not now** | — | F-02-6, routed |
| **T-02-9** *(step 3)* | `40P01`, not `23P01`, refuses a simultaneous loser; §2.6 maps it to `500` | **AGREE** | **(c)**, mine to rule | ADR-0018; §2.1, §2.6, §2.7, §4.5, §7. AC-5's wording proposed in §9 |

### Where I disagreed, and why the disagreements are the load-bearing part

**T-02-2 — the finding is right and the diagnosis is wrong, and they need opposite remedies.** The
concept form does report zero at HEAD, and zero is the *correct* answer when nothing outside
`appointmentRepository.ts` touches the table and the repository does not exist yet; on a fixture with
violations planted the marker **catches both forms**. E-02-2's marker, measured the same way, **misses
two of three**, including the ambient-zone one. One marker is unspecified; the other is blind.
Redefining the concept would not have fixed §4.2, and adding mechanisms would not have fixed E-02-2 —
accepting the objection's remedy along with its measurement would have left the real hole open twice.

**I-02-8 / T-02-7 — only one of the two sub-cases is mislabelled.** Zero bays is broken reference data
and I was wrong to call it a client error. *"No technician here is qualified for this service"* is an
ordinary state of an ordinary dealership, and a new `/problems/service-not-offered` row was considered
and refused: no acceptance criterion names it, and §8.6's table is the client contract. A correct
measurement does not make the remedy offered beside it correct.

### The loopback ledger

**Step 2 consumed none.** §6 says outright that *"objections here are cheap; the same ambiguity found
at step 5 costs a full cycle plus a loopback"*, and the governor exists to bound defects found **after
work has been done**. Nothing had been built. Two of them — I-02-6 and T-02-1 — would have been (c) at
step 5, and I-02-6 is nameable against QS-1 and QS-2.

**T-02-9 took it to 1 of 2**, and that is the right price: it was found by a test-engineer running the
design against a real container *after* the red was committed, which is exactly the class the governor
counts. **Step 4's I-02-9 and its four corrections consume none** — (a) resumes from the raising step,
and the governor counts design changes, not an unsatisfiable assertion and not my own stale prose. The
slice stands at **1 of 2**; one more design change auto-escalates, and the honest reading of that is
that a slice carrying 19 acceptance criteria, a whole taxonomy and two absorbed slices was always
going to spend one.

---

## 13. What step 5 produced — the reviewer's findings, ruled

The reviewer returned one MAJOR and three MINOR, having re-run Stryker independently to a
byte-identical survivor set and re-measured ADR-0018's three cells itself rather than accepting
them. **R-02-1 and R-02-4 are the orchestrator's** and are ruled and closed there. The two below are
mine: **both (b), neither holds the gate, both absorbed by slice 05** under
[ADR-0019](../adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md).

For the orchestrator, one line: `05-cancellation.md` gains
`deferred_from: ["R-02-2:0019", "R-02-3:0019"]`, which is what puts both rows in §11.1's generated
register and what makes them refusable at that slice's Definition of Ready.

### R-02-2 — the lock-drop control is not in the suite · **(b)**

**It cannot be (c), and I checked rather than assumed.** (c) obliges me to name an acceptance
criterion, a `QS-*` or a §2 clause that the work would fail, and none does: three of the four cells
of ADR-0018's matrix are standing tests today — constraint alone ⇒ one row, and neither ⇒ twenty,
both in `exclusion-constraint-adjudicates.test.ts`; and under the locks every one of the nineteen
refusals is a `23P01` the database named, in both `tests/concurrency/` files. §2.1 is asserted three
ways. The missing cell's unique content is one hypothesis: *the lock could replace the constraint.*

**It is not "a mechanism stated and never run", and the distinction is not a quibble.** It was run
twice — by me while ruling T-02-9, and by the reviewer independently on `postgres:16-alpine` against
these migrations — with matching results. What is missing is a run that **repeats**, and the sharper
cost is that the reviewer's control script is a scratchpad file that dies with the slice. ADR-0019
carries the numbers for that reason: a measurement nobody can re-read is not evidence.

**I considered (a) and rejected it, and the reason is not cost.** The wording defect is real and it
is mine — §4.4 said *"adopted in full"* and got built, §4.5 said *"belongs beside"* and did not, and
the difference in phrasing tracks the difference in outcome exactly. What defeats (a) is the
consumer. (a) resumes step 5 with the remedy applied, on the premise that the evidence is needed
now; it is not. ADR-0018 is `status: proposed`, and a merge does not rule it — ADR-0011 has been
`proposed` since slice 00. Slice 05 reopens this very file to show that the constraint's
`WHERE status <> 'cancelled'` predicate frees a cancelled slot, so the fourth cell lands beside a
case that must be written anyway, and it lands well before the register is ruled.

**Does it hold the gate? No.** The regression it would guard — someone drops the constraint
believing ADR-0018's locks cover it — fails both concurrency tests today, twenty confirmed against
an expected one. What is deferred is the reading, not the guard.

### R-02-3 — the GET route's response schema is not asserted · **(b)**

**Deferring makes this test stronger rather than merely later.** `AppointmentView.status` is a
two-member union of which `readAppointment` can produce only `confirmed`, so a test that kills the
`ObjectLiteral "{}"` mutant today must manufacture `'pencilled-in'` through a cast the production
path cannot make. At slice 05 the second member is produced for real and the assertion becomes one
about behaviour instead of about a cast.

**My text over-claims and this is the correction.** §2.6 argues for the union of literals *because
slice 05 renders `cancelled` at that URL*, and that argument is asserted on the **POST** path only —
`tests/unit/http/appointments.test.ts`'s *"a `status` outside {confirmed, cancelled} never reaches
the client as a `201`"*. The GET path, which is the one the argument is about, carries the same
schema with nothing asserting it. What that schema does earn today is `fast-json-stringify`'s
stripping and ADR-0005's emitted document; its enforcement leg has no reachable subject, because the
compiler already forecloses every value the handler could send. **The remedy is that case's twin at
`200`** — `tests/unit/http/` is the implementer's, slice 05.

### The two corrections the reviewer made, and what follows from each

**`openingHours.ts:256` — the reviewer is right, and no code changes.** The survivor is column 32,
`closesSeconds === null → false`, and it survives because `!(opensSeconds < closesSeconds)` already
covers it: `opensSeconds < null` coerces to `< 0`, false for every seconds-of-day. The arm is
**redundant, not untested**, and the implementer's note said untested. The reviewer's point is the
substance — the two diagnoses call for opposite remedies, a test or a deletion — and **neither is
taken.** Deleting the explicit null check would leave the guard resting on `n < null` coercing to
`n < 0`, the least legible rule in that expression and the one a future reader would have to
re-derive before trusting the parse contract; writing a test for it would be writing a test that
cannot fail. It stays, recorded as equivalent **by implication** rather than by unreachability. What
follows is only that the survivor accounting must carry the reason, because *"no test covers it"*
sends the next person to write the test that cannot fail. F-02-11.

**AC-6 — the refinement is accepted, and the over-claim is mine.** Corrected in §0 and §2.7:
`additionalProperties: false` on the request body is not load-bearing at runtime, because Fastify
strips rather than rejects and nothing downstream reads the raw body. It is load-bearing for
ADR-0005's emitted document, and it becomes load-bearing at runtime the moment a later slice logs or
generically maps that body — which §0's second limit already said and which is now the only limit
doing work. The client-facing consequence, stated once: **this API is lenient about unknown request
properties and stays so under Fastify's defaults.** That is an §8.5 fact and routes with E-02-3 at
step 7, not now.

### The loopback ledger, unchanged

Both rulings are (b): the work merges as-is and no design returns to step 1. The slice stands at
**1 of 2**.

**One obligation this section adds to step 7.** This file is 12,180 words against an in-flight budget
of 3,000 and a merged budget of 1,200. Nothing here is exempt from that; the condensation is step 7's
and is the largest single item in `docs:budget`'s report.
