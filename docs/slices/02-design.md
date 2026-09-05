# Slice 02 — design

> Step 1 of the slice loop. Architect. Slice file:
> [`02-book-and-read-an-appointment.md`](02-book-and-read-an-appointment.md) — 19 acceptance
> criteria, the booking path plus the whole error taxonomy plus two ratified domain remedies.

This is the slice where `CLAUDE.md` §2.1 stops being a rule in a document and becomes a running
program. Everything below is arranged around one question: **when someone reintroduces check-then-act
in six months, what fails?** Section 4 answers it with three mechanisms, and each one was run before
it was written down.

Nothing here re-derives ADR-0014 or ADR-0015. Both are accepted and immutable; §6 applies them.

---

## 0. Rulings and escalations, up front

Three things need the human, and none of them is mine to settle. They are listed first so the
orchestrator can queue them without reading the rest, and so nobody spends a cycle discovering them at
step 5.

### E-02-1 — AC-4 cannot be satisfied without ADR-0004's retry loop, which the slice puts out of scope · **§6 (d) escalate**

The slice file says both of these:

> **AC-4** — As AC-3 with bays plentiful and exactly one qualified technician free; the constraint
> reported is `no_technician_overlap`.

> **Out of scope** — Retrying across remaining candidates on conflict (ADR-0004) — slice 04.

**They contradict each other, and the contradiction is measurable rather than arguable.** Measured
against `postgres:16-alpine`, on this repository's own migrations:

| Case | Reported constraint |
|---|---|
| Same bay, same technician as the winning row — **both** constraints violated | `no_bay_overlap` |
| Different bay, same technician | `no_technician_overlap` |
| Same bay, different technician | `no_bay_overlap` |

and, creating the two constraints in the reverse order in a scratch table, the doubly-violating insert
reports `no_technician_overlap2` instead. **Which constraint PostgreSQL names when both are violated
is decided by index creation order** — `RelationGetIndexList` returns indexes sorted by OID and
`ExecInsertIndexTuples` walks them in that order — and `0003_appointment.sql` creates
`no_bay_overlap` first.

Now run AC-4 without a retry loop. Twenty racers, bays plentiful, one qualified technician:

- **With a deterministic candidate order** every racer picks the same bay, so every loser violates
  *both* constraints and every loser is told `no_bay_overlap`. AC-4 fails, 20 times out of 20.
- **With a per-request shuffled order** a loser is told `no_technician_overlap` unless it happened to
  draw the winner's bay, which for 20 racers over *B* bays happens with probability ≈ 19/*B*. AC-4
  becomes a flake whose rate is a fixture parameter.

There is no third option, because AC-3 pins the opposite: AC-3 needs a doubly-violating insert to
report `no_bay_overlap`, AC-4 needs it to report `no_technician_overlap`, and one index ordering cannot
give both.

**The retry loop removes the ambiguity entirely, and this is the interesting part.** With
prune-by-constraint, the constraint reported at *refusal* is the one whose candidate list emptied, not
the one whose index happened to be checked first:

- AC-3 (one bay): whatever the first failure names, pruning walks the technician list, every retry
  fails on the bay, the bay list empties first. Refusal names **`no_bay_overlap`**, always.
- AC-4 (one technician): symmetric. Refusal names **`no_technician_overlap`**, always.

So the loop is not an optimisation here. **It is what turns "which constraint fired" from a
PostgreSQL implementation detail into a fact about which resource was actually scarce** — which is
what AC-3 and AC-4 are asking about, and what `booking_conflicts_total{resource}` will need to be
truthful in slice 09.

**Two further readings of the slice file point the same way**, and I note them rather than lean on
them: AC-5 says *"a single `INSERT` per attempt"*, which presupposes attempts; AC-11 says *"when
**every candidate** is refused"*, which is ADR-0004's exhaustion condition verbatim. And arc42 §6.1 —
the section AC-3 and AC-4 are drawn from — already draws prune-and-refuse as the booking path.

**Recommendation, and what I have designed to.** The numbered acceptance criterion governs the prose
bullet: AC-4 is the definition of done, the "Out of scope" bullet is a statement about where the
*improvement claim* lands. So §3 designs the minimal loop — **attempt, classify, prune the whole
resource, attempt the next candidate, refuse when a list empties** — and leaves in slice 04 the three
things that are genuinely ADR-0009's and that QS-3 measures: the **seeded shuffle**, the **16-attempt
cap**, and QS-3 itself.

**If the human rules the other way**, the deletion is small and bounded and is named here so it does
not have to be rediscovered: delete the `while` in `bookAppointment.ts`, delete `pruneCandidates`,
refuse on the first `23P01` — and AC-4 must then be reworded or dropped, because no implementation
satisfies it. I have not made that call and am not treating the human's absence as licence to.

### E-02-2 — QS-12's `wall-clock-and-zone` marker becomes unsatisfiable at this slice · **route to the human; blocking on step 3**

`tests/architecture/ambiguity-containment.test.ts`, as merged at slice 01, defines:

```ts
{ name: 'wall-clock-and-zone',
  test: (c) => /Intl\s*\.\s*DateTimeFormat/.test(c) || /\b(?:timeZone|ianaZone|time_zone)\b/.test(c) }
```

with `PERMITTED_FILE['wall-clock-and-zone'] = 'src/domain/openingHours.ts'` — **exactly one file**.

This slice must carry a dealership's IANA zone from a `text` column into a pure function that takes it
as a parameter. That path is at minimum:

| File | Why the token is unavoidable |
|---|---|
| `src/persistence/schema.ts` | Kysely's `Database` interface names columns exactly. The column is `time_zone` (`0002_reference_data.sql`) and cannot be spelled otherwise |
| `src/persistence/referenceRepository.ts` | It selects that column and reads it off the row |

**No naming discipline avoids this**, which is what makes it a defect in the scenario rather than a
constraint on the implementation. QS-12 as written says the containment holds in *one* file; from the
moment a repository exists, the zone must appear in at least three. §11 already anticipated the shape
of this — *"QS-12's corpus is nearly empty … a marker matching in exactly one file is a much weaker
claim now than it will be"* — but predicted it as a weakening, not as an impossibility.

**The refinement I would propose, if it is mine to propose:** split the marker in two, because it is
currently two concepts wearing one name.

- **`wall-clock-reasoning`** — `Intl.DateTimeFormat`, `formatToParts`, `hourCycle`, `timeZone` as an
  *option key*. Permitted in `src/domain/openingHours.ts` and nowhere else. This is the concept QS-12
  actually names, and it is the one that matters: it is what GC-1 and ADR-0001 are about.
- **`zone-transport`** — the identifier `time_zone` or `ianaZone`. Permitted in a named, short list:
  `src/persistence/schema.ts`, `src/persistence/referenceRepository.ts`, `src/application/deriveInterval.ts`,
  `src/domain/openingHours.ts`. Carrying an opaque string is not reasoning about zones, and a scan that
  cannot tell those apart is measuring the wrong thing.

**But §10 is not in this slice's declared arc42 scope** (`["§5.2", "§6.1", "§8.6"]`) and a quality
scenario is arguably the human's under `CLAUDE.md` §6's authority table. So this is **flagged, not
taken.** It needs routing **before step 3**: the test-engineer owns that file, and if the red commit
is written against the marker as it stands it encodes a scenario no implementation can satisfy, which
is the most expensive possible place to discover this.

### E-02-3 — arc42 §8.5's serialiser table is incomplete, and the missing rows change its guidance · **route**

§8.5 records four measured behaviours of a TypeBox `response` schema. Re-measuring on this
repository's pinned Fastify, for the shape *this* slice needs — a computed enum-valued field — gives
two more, and they reverse the section's advice:

| The schema declares | The handler sends a value not matching | On the wire |
|---|---|---|
| `Type.Literal('x')` | anything | **substituted** with `'x'`, silently *(§8.5, already recorded)* |
| `Type.Union([Type.Literal('a'), Type.Literal('b')])` | `'WRONG'` | **`500`** — `The value of '#/properties/status' does not match schema definition.` |
| `Type.String({ enum: ['a','b'] })` | `'WRONG'` | **`WRONG`** — passed through unvalidated |

§8.5's consequence #1 offers two ways out — *"either the schema does not pin the value, or the test
does not assert it from the body"*. **There is a third and it is better than both:** a **union of
literals** is the only one of the three that both enforces and does not substitute. §5's problem
schema uses it, so a handler emitting a `type` URI outside the taxonomy fails loudly instead of
having the right answer written in for it.

That is a §8.5 edit and §8.5 is outside this slice's declared scope. Flagged. §5.2 below uses the
measured behaviour regardless — the design does not need §8.5 to be amended to be correct, it needs
§8.5 amended to stop being *misleading*.

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
  src/persistence/appointmentRepository.ts NEW the guarded INSERT, and findById
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
  | { readonly kind: 'other'; readonly cause: unknown };

export function classify(error: unknown): PgOutcome;
```

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
gates the insert. It is one statement — three `EXISTS` sub-selects — and §5.3 argues why it is not
check-then-act.

### 2.4 `src/persistence/appointmentRepository.ts`

```ts
export interface AppointmentRow { /* the ten columns, starts_at/ends_at as Date */ }

/** ONE statement. No pre-read, no transaction, no ON CONFLICT. */
export function insertAppointment(db: Db, values: NewAppointment): Promise<AppointmentRow>;
export function findAppointmentById(db: Db, id: string): Promise<AppointmentRow | null>;
```

`insertAppointment` does not catch. It lets `pg`'s error out so the caller classifies it through the
one site; the `try` lives in `bookAppointment`, and `classify` is what stands between the driver error
and the layer that may not import `pg`. (Contrast `pingDatabase`, which swallows, because a boolean is
its whole contract.)

**No `db.transaction()` anywhere on this path.** ADR-0006 §4 and arc42 §6's first convention: each
attempt is one statement in autocommit and is therefore its own transaction, and wrapping the loop
makes attempt two fail with `25P02` instead of retrying. Nothing in `.dependency-cruiser.js` can catch
that; §7 makes it an explicit review item and QS-3 catches it in slice 04.

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

export function deriveInterval(
  startsAtMillis: number, serviceType: ServiceTypeDuration, zone: string, weekly: WeeklyOpeningHours,
): Derivation;
```

The body is arc42 §6.2 steps 3 and 4, in that order and only that order:

```
instant(startsAtMillis)                     → null ⇒ unparsable-instant
serviceDuration(serviceType)                → null ⇒ invalid-duration
durationMillis(duration)
appointmentInterval(startsAt, ms)
occupancyInterval(interval)
withinOpeningHours(interval.startsAt, interval.endsAt, zone, weekly)
```

**It is pure**, and that is the point rather than a nicety. D-01-1 records that this composition used
to be enforced by the brands and is now *"correct because someone wrote it correctly"*. A pure module
is a module the implementer can unit-test without Docker and Stryker can mutate — so the order that
lost its compiler gets a mutation score instead. That is the closest available replacement for what
the AC-6 ruling cost, and it is worth one file.

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
  | { readonly kind: 'reference-data-invalid'; readonly detail: string };

export interface BookDeps { readonly newId: () => string; }
export function bookAppointment(db: Db, deps: BookDeps, command: BookCommand): Promise<BookOutcome>;
```

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
   empty                                              ⇒ no-capacity   … see §3, note
5  loop over candidates, OUTSIDE any transaction:
     insertAppointment(one statement)
       ok       ⇒ confirmed
       23P01    ⇒ classify → resource; prune that WHOLE resource; continue
       23503 on appointment_vehicle_owned_by_customer
                ⇒ classifyOwnership → unknown-customer | unknown-vehicle | not-owned   (never retried)
       23503 other constraint ⇒ reference-data-invalid          (never retried)
       other    ⇒ rethrow                                        ⇒ 500
   a list empties ⇒ no-capacity, resource = the list that emptied
```

Steps 1–3 run once. The loop varies only the candidate — ADR-0004, and arc42 §6.2's three
reviewer checks.

**A note on step 4's empty case, because it is the one place this design tells a white lie.** With no
bays or no qualified technicians at the dealership, the candidate set is empty and no `INSERT` is
attempted, so there is no `23P01` and therefore — by §4.1 — no `ContendedResource` to construct. That
is correct: it is not contention, it is a dealership that cannot perform the service. It maps to
`unknown-reference: service-type`, which is honest (no technician here is qualified for it) and needs
no fabricated resource. AC-11's `no-capacity` stays reachable only from a real database verdict.

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
difference between QS-11's contract test being able to fail and not. It also gives the taxonomy a
single home: a handler that computes a URI outside the set gets a loud `500`, not a silently corrected
body.

**Status mapping** — one exhaustive `switch` over `BookOutcome`, in the route:

| outcome | status | `type` |
|---|---|---|
| `confirmed` | `201` | — |
| `malformed-instant` | `400` | `/problems/malformed-request` |
| `outside-opening-hours` (verdict `closed-day`, `outside-window`, `spans-local-days`, `malformed-interval`) | `400` | `/problems/outside-opening-hours` |
| `unknown-reference` | `422` | `/problems/unknown-reference` + `reference` |
| `vehicle-not-owned` | `422` | `/problems/vehicle-not-owned` |
| `no-capacity` | `409` | `/problems/no-capacity` + `resource` |
| `reference-data-invalid` (verdict `unknown-zone`, `malformed-hours`) | `500` | `/problems/internal` |

The last row settles OQ-02-2 and I am settling it rather than escalating it: a dealership whose
`time_zone` is unparseable or whose `opens_at` is garbage is **the system's fault, not the client's**.
§8.6 has no row for it and needs none — `500 /problems/internal` is the row that already exists. A new
`4xx` type would tell a service advisor to fix something they cannot see and did not send. It is
logged at `error` with the dealership id, because it is the one failure here that someone must act on.

**Request schema.** Body: `customerId`, `vehicleId`, `serviceTypeId`, `dealershipId` as uuid-patterned
strings, `startsAt` as an RFC 3339 pattern, `additionalProperties: false`. Path: `id` as a uuid
pattern, so a non-uuid path segment is `400 /problems/malformed-request` and only a well-formed
unknown id is AC-2's `404`.

**AC-6 falls out of the schema, and I checked that it does rather than assuming it.** Measured: a body
carrying an extra `endsAt` returns `201` with the property **stripped**, because Fastify's default
ajv options set `removeAdditional: true`. So a supplied end never reaches the handler — and there is
no `endsAt` parameter anywhere on the path to receive it, since `appointmentInterval` takes only a
start and a duration. Two independent reasons, one of which is structural.

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

The slice file invites a DCR: *"If your design concludes it genuinely needs two red commits, say so
plainly."*

**It does not, and the reason is that §7's rule counts commits, not files.** *"Exactly one red commit
per slice, authored by the test-engineer"* is satisfied by one commit containing every outside-in test
this slice needs — acceptance, contract, concurrency and property. Sequencing is a property of the
**green** work, which §7 requires to be many small commits anyway.

For that single red to be honest it must fail as **assertions**, not as collection errors (process
criterion C1, and 00a's whole harness design). All three families do:

| Test family | At the red commit | Fails as |
|---|---|---|
| acceptance / contract / concurrency (HTTP) | `dist/main.js` exists and starts — `/health` works — but has no `/appointments` route | a `404`/assertion inside the test body, via `tests/support/service.ts`, which never throws |
| property / unit-facing domain (AC-13–AC-19) | `dist/domain/*.js` exists and exports the right names, and returns today's answers | an assertion on a verdict — `spans-local-days` where `within` is expected, an `Instant` where `null` is expected |

So nothing needs stubbing and nothing fails at import. Recommended **green** order, which is the
sequencing the slice file asks for:

1. **AC-13 to AC-19** — `src/domain` only. Independent of everything else, and they get the strictest
   mutation attention because they are pure.
2. `schema.ts`, `pgError.ts`, the three repositories.
3. `deriveInterval.ts` (pure; unit-tested without Docker), then `bookAppointment.ts`, `readAppointment.ts`.
4. `problem.ts`, the routes, `server.ts`, `main.ts` → **AC-1, AC-2, AC-6**.
5. **AC-7 to AC-12** — the taxonomy. Mostly falls out of step 4; the one genuinely new piece is
   `classifyOwnership` (§5.3).
6. **AC-3, AC-4** last. They are the integration of all of it, and they are the slice.

---

## 4. §2.1 made unrepresentable — what fails if check-then-act comes back

The human asked for this specifically, and it needs one uncomfortable observation first.

> **You cannot detect check-then-act in this system from its behaviour.** The exclusion constraint
> makes it *harmless*: a check-then-act booking path still never double-books, because the constraint
> still adjudicates the write. It is merely slower and racier-looking. **So QS-1 and QS-2 do not catch
> it** — they would pass over a reintroduced check. That is why AC-5 is a source-tree inspection and
> not a runtime assertion, and it is why the mechanisms below are compile-time and scan-time.

Three mechanisms. Each was run before being claimed.

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

**Residue, named rather than promised away** — the same class §11 already records for
`duration-arithmetic` and `outside-in-tests-do-not-import-src`, and irreducible for a text scan: a
computed or interpolated table name; a database view over `appointment`; a helper in
`appointmentRepository.ts` that legitimately holds the token and is then called from anywhere. The
first two are gaps in the scan, not licences — a spelling not listed is a finding to raise. The third
is why 4.1 exists.

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
an unknown service type yields no duration, so both are refused at steps 1–2 before any insert. They
map to `reference-data-invalid` ⇒ `500`, and **that arm is unreachable over HTTP and reachable in a
unit test of `classify` and the mapper**. Said plainly, because slice 01's R-01-4 is what happens when
an unreachable arm goes unnamed: it is defended, not exercised end to end, and its mutants are killed
at the unit level or not at all.

### 5.2 Precedence, when two failures apply at once

Measured: a request with **both** a bad vehicle and a slot conflict raises **`23P01`, not `23503`** —
`no_bay_overlap`. Exclusion constraints are enforced at index insertion, during the tuple insert; the
composite FK is an `AFTER ROW` trigger at end of statement. The exclusion always wins.

So a contended booking for an unknown vehicle is a `409`, not a `422`. That is **not** a QS-11
collision — each failure still has exactly one status and one `type` — it is a *precedence* between
two co-occurring failures, and it needs stating so the contract test does not stage an ambiguous
fixture and then assert the wrong one. **AC-9's and AC-10's fixtures must be uncontended.**

### 5.3 `classifyOwnership` is not check-then-act, and the reason is not "it is only a read"

One statement, three `EXISTS` sub-selects over `customer` and `vehicle`, run **only after** an
`INSERT` has already been refused by the database. Three properties, and all three are needed:

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

ADR-0014 and ADR-0015 name their remedies exactly. This section applies them and adds nothing.

### 6.1 ADR-0014 — an `Instant` is renderable by construction

**`src/domain/interval.ts`:**

```ts
const MAX_RENDERABLE_EPOCH_MILLIS = 8_640_000_000_000_000;
export function instant(epochMillis: number): Instant | null {
  return Number.isInteger(epochMillis) && Math.abs(epochMillis) <= MAX_RENDERABLE_EPOCH_MILLIS
    ? (epochMillis as Instant) : null;
}
```

**`src/domain/openingHours.ts` step 1** — the same bound on both endpoints, returning the **existing**
`malformed-interval`; ADR-0014 is explicit that no new verdict variant is introduced (AC-16).

The literal appears in **two** domain files with no mechanism to share it. That is D-01-2 cashing in,
it is ADR-0014's own "Bad, or deferred", and it is the slice file's out-of-scope: reversing the AC-6
ruling to avoid a duplicated constant is a scope change and the human's. It is carried in §10 below.

Measured, so AC-14 and AC-15 are written against facts: `new Date(8_640_000_000_000_000).toISOString()`
is `+275760-09-13T00:00:00.000Z`; at `8_640_000_000_000_001` it throws `RangeError`. The bound is
inclusive and both signs must be asserted (AC-14) — a mutant flipping `<=` to `<` is killed only by the
exact-boundary case, and a mutant deleting `Math.abs` only by the negative one.

### 6.2 ADR-0015 — an interval ending at local midnight

**`src/domain/openingHours.ts` step 4**, one branch, before the `startsOn !== endsOn` comparison:
an end rendering as exactly `00:00:00` **and** on the local date immediately following the start's
local date is treated as `secondsOfDay = 86400` on the start's day.

Both clauses are load-bearing and ADR-0015 says why: without the second, a 48-hour interval ending at
midnight two days later normalises into the start's day and is silently accepted. **The successor test
is a local-calendar-date comparison, never epoch arithmetic** — a DST transition changes the number of
milliseconds in a local day, and this function's entire subject is DST.

Everything downstream is unchanged. Step 7 then compares `86400 <= 86400` for a dealership closing at
`'24:00:00'` (⇒ `within`, AC-17) and `86400 <= 61200` for a 17:00 dealership (⇒ `outside-window`, the
correct verdict for the correct reason). AC-18's 23:00→01:00 stays `spans-local-days`.

**AC-19 is now reachable with real data, and that is measured rather than argued**: `pg` returns a
`time` column holding `'24:00:00'` as the JavaScript string `"24:00:00"`, which is exactly what
`parseTimeToSeconds` takes. The `'24:00:00'` arm stops being unreachable — slice 01's finding is
retired by making the branch **live and killed**, which ADR-0015 argues is strictly better than
retiring it by deletion.

The definition of done asks for **named mutants**, not a score, for AC-15 and AC-18. The
discriminating ones:

| Mutant | Killed only by |
|---|---|
| `<=` → `<` on the epoch bound | AC-14's exact `±8_640_000_000_000_000` |
| delete `Math.abs` | AC-14's negative bound |
| delete the whole step-4 normalisation | AC-17 |
| **delete the "immediately following" clause**, keeping the `00:00:00` test | a >24h interval ending at local midnight — *not* by AC-17 |
| delete step 4 entirely | AC-18, the negative control — AC-17 alone is satisfied by deleting the check |

---

## 7. Quality scenarios

The slice declares `[QS-1, QS-2, QS-11, QS-9, QS-12]`. All five apply. Notes only where the slice
changes what the scenario means.

- **QS-1 / QS-2** (AC-3, AC-4) — become executable end to end for the first time. Both must assert
  over the **table**, not the responses; both record ADR-0009's seed in the failure message. Their
  determinism depends on E-02-1.
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

Not applicable and worth saying so: **QS-3** (no spurious refusal) is slice 04's even though §0
recommends admitting the loop — the loop makes QS-3 *pass*, and slice 04's job is the ordering, the
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

Two of these corrected an assumption I had written down before running it, and both are recorded
rather than quietly fixed: I expected `Date.parse('2026-02-30T10:00:00Z')` to be `NaN` and it is not
(F-02-2), and I expected `additionalProperties: false` to **reject** an extra property, where Fastify
in fact **strips** it (§2.7).

---

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

---

## 10. Proposed arc42 edits — for step 7, as-built rather than as-designed

Within the declared scope `["§5.2", "§6.1", "§8.6"]`. These are proposals; arc42 is corrected at step
7 to what actually merged, not now.

**§5.2** — five new module rows under `src/http`, `src/application` and `src/persistence`. An
*As built at slice 02* block recording: that `candidateRepository` reads **reference data only** in
this slice and why (§2.2); that `deriveInterval.ts` is where D-01-1's composition order landed and is
pure; that `occupancyInterval` has its first production call site; and the `ContendedResource` brand
with its measured claim **and** its measured cast escape, narrowed exactly as the 00a
partial-application claim was.

**§6.1** — the sequence gains the `23503` classification step (§5.3) and the precedence measurement
(F-02-3): `23P01` is raised at index insertion and beats the FK's after-row trigger. An as-built note
that slice 02 builds ADR-0004's loop without ADR-0009's seeded shuffle or attempt cap, both of which
remain slice 04's, subject to E-02-1.

**§8.6** — three additions: the `500 /problems/internal` reading for broken reference data (§2.7); the
precedence rule of F-02-3; and the rule that the problem schema declares `type` as a **union of the
taxonomy's literals**, because a single `Type.Literal` substitutes the constant for a computed value
and would make QS-11's own test unable to fail (measurement 8). The recorded `400`-versus-`422`
tension for out-of-hours is left recorded and not harmonised, per the slice file's definition of done.

**Outside the declared scope — flagged for the orchestrator to route, not taken:** §10 (E-02-2,
QS-12's marker — **blocking on step 3**), §8.5 (E-02-3, two measured rows and reversed guidance),
§11 (F-02-1, F-02-2, F-02-4, F-02-5, and the D-01-2 duplication cashing in for the second time).

---

## 11. ADRs

Two genuinely new decisions. Both `status: proposed`: they are the architect's recommendation and the
human's to rule at this slice's gate, which is the pattern ADR-0011 through ADR-0015 established. Both
therefore appear in §11.1's generated register as debt until ruled.

- **[ADR-0016](../adr/0016-a-capacity-refusal-requires-a-database-verdict.md)** — a `no-capacity`
  outcome is constructible only from a value minted by SQLSTATE classification. §4.1.
- **[ADR-0017](../adr/0017-the-composite-ownership-fk-is-disambiguated-after-it-fires.md)** — the
  three failures that share `appointment_vehicle_owned_by_customer` are separated by a classification
  read **after** the insert is refused, never by a pre-flight check. §5.3.

**No ADR is proposed for the retry loop.** ADR-0004 already decided it; E-02-1 is a scope conflict
between two statements in a human-authored slice file, and the remedy is a ruling, not a new decision
record.
