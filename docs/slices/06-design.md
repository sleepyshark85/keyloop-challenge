# Slice 06 — design

Slice file: [`06-reschedule-atomic-move.md`](06-reschedule-atomic-move.md) — five acceptance
criteria, QS-6 and QS-11, implementing [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md).
New: [**ADR-0025**](../adr/0025-existence-is-the-reads-legality-is-the-statements.md) and
[**ADR-0026**](../adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md).
arc42 in scope: **§5.2, §6.3, §6.6, §8.6, §10, §11**. No data-model delta, no migration, no
`.dependency-cruiser.js` change.

All rulings below are the architect's under the standing delegation and **provisional until the
gate**. Facts already living in an ADR or in arc42 are cited, not repeated.

## 1. Scope — the five inherited obligations, and one that is bigger than all of them

Slice 06 as handed over carries five inherited obligations, five acceptance criteria, a new route,
a new use case and a new statement. **Two of the five are ruled out of this slice**, one is
retired, and the remaining work is re-sequenced so it costs one pass rather than two.

| Obligation | Ruling |
|---|---|
| **Racing moves** — ADR-0003's claim that two racing reschedules behave like two racing bookings | **Deferred to slice 07**, named. The slice file's reason for keeping it — *"ADR-0003's claim is what slice 06 ships on"* — is equally true of QS-4 and QS-5, which are already slice 07's and were deferred without complaint. A reason that does not distinguish the case it is offered for is not a reason. ADR-0019's criterion is met and is **measurable on arrival** (D-05-3's remedy): slice 07 is **cheaper** — QS-5 already builds the barrier harness for a move racing *N* bookings, and racing moves is that harness with `UPDATE` on both sides — and **stronger**, because it can assert alongside QS-4 that the loser's original is untouched, which is what makes *"one commits, one gets `23P01`"* mean something rather than count to one. Slice 07 re-measures both premises and says so |
| **F-05-1 — `ResourceLock`** | **Kept, and strengthened.** ADR-0026. A third deferral of the same control is D-05-3's pattern, and slice 06 is the path it was deferred *to* |
| **ADR-0024 — `setNotFoundHandler`, the `route-not-found` row, the hostile corpus** | **Kept, and merged into one taxonomy change.** See §2.4 |
| **`src/domain/appointment.ts`** | **Retired, not deferred** — ADR-0025 decision 6. There is no destination to name because there is no obligation left: §5.2's as-built cell records the retirement and its reason at step 7 |
| **The Stryker exhaustiveness disables** | **Kept.** Four comment pairs; measured effect in §2.4 |

**One item was added, and it is larger than anything removed.** ADR-0003 requires that a move
needing a different bay or technician re-runs ADR-0004's candidate selection and retry. That is a
second copy of `bookAppointment`'s loop. The alternative considered and rejected was to rule
re-allocation out of slice 06 and let a move keep its own bay and technician: it is a much smaller
slice, and it makes `PATCH` **refuse while capacity exists** — A at `[09,10)` in bay 1 wanting
`[11,12)`, bay 1 busy and bay 2 free, answered `409 /problems/no-capacity`. Refusing while capacity
exists is the one behaviour this system is about (QS-3), so the loop stays.

**The duplication is a finding, not a design.** Extracting the shared attempt loop is deferred to
**slice 09**, which must instrument both loops with `appointment.insert` / `appointment.update`
spans and `booking_attempts` (§8.4) and therefore opens both files anyway — cheaper there, and
stronger, because an extracted loop is instrumented once. Slice 09 re-measures on arrival.

## 2. The four decisions

### 2.1 AC-4 and AC-5 — one zero-row result cannot decide both

Ruled in **ADR-0025**, whose decisive fact was found by trying to write the statement: **a move
cannot be constructed without reading its own row**, because the interval is derived from the
appointment's service type and validated against its dealership's hours. So AC-5's *"decided by the
`UPDATE` affecting zero rows rather than by a preceding read"* is not merely unmet, it is
unimplementable.

**AC-5 is amended.** Replacement wording, for the orchestrator to land in the slice file:

> **AC-5** — Given an unknown id, when a move is requested, then `404` with
> `type=/problems/appointment-not-found`, decided by the appointment read the move needs anyway to
> know its own dealership and service type — **and the `UPDATE` is never issued.** Zero rows from
> the `UPDATE` therefore means exactly one thing, which is what makes AC-4 assertable.

The amendment is **stricter** than the original in the direction that matters: it forbids the
follow-up read §6.3 currently mandates, and it is falsified by any build that answers `404` after
issuing an `UPDATE` — observable by AC-2's instrument (§2.3).

**A read after a failed write would not have been check-then-act either, and the design still does
not have one.** ADR-0025 decision 5 gives the reason at the level of the mechanism rather than the
conclusion: §2.1 forbids a read whose answer *authorises* a write its own staleness could
invalidate. The move's read touches one row by primary key and can never answer *"is that bay
free"*; its `absent` answer cannot go stale; its `confirmed` answer can, and is re-adjudicated
atomically by the statement's own `status = 'confirmed'`.

**Ruled consequence, recorded because a test will hit it at step 3:** a cancelled appointment moved
to an out-of-hours slot answers `400 /problems/outside-opening-hours`, not `409`. The status guard
lives only in the statement, so the domain rule — which needs no database verdict — is evaluated
first. Cost if wrong: one taxonomy row reported in place of another on a doubly-invalid request.

### 2.2 AC-1 — the mechanism, and what makes the pass honest

§8.2 consequence 4 already states the mechanism; what slice 06 owes is the level below it, because
QS-11 is on this slice and *"it passed"* does not distinguish a working constraint from an absent
one.

**Why PostgreSQL does not see the row's own prior version.** An `UPDATE` is not an in-place edit.
It writes a **new heap tuple**, stamps the old one's `xmax` with this transaction's xid, and
inserts a **new index entry** into each index, the two partial GiST indexes included.
`check_exclusion_constraint` then runs *after* that index entry exists: it scans the index for
entries conflicting under `bay_id WITH =` and `tstzrange(…) WITH &&`, skips the entry it just
inserted by `ctid`, and for every other candidate fetches the referenced heap tuple to test whether
it is **live to this transaction**. The superseded version carries `xmax` = this transaction's own
xid, so it is *deleted by me* — not a live conflict. The index is never presented with it.

The load-bearing half is that this is a property of the **enforcement mechanism**, not of the row.
A `BEFORE UPDATE` trigger computing the same overlap reads the heap, therefore *does* see the prior
version, and is correct only if whoever wrote it remembered `AND o.id <> NEW.id`.

**What makes AC-1's pass honest** is a control in the same fixture, with the same statement, that
**must** fail: the same appointment moved onto an interval held by a *different* confirmed
appointment is refused with `23P01` naming `no_bay_overlap`, observed on the `booking.conflict` log
line (QS-1's observer — the constraint name is in neither the body nor the table). Without it, a
build with the constraints dropped passes AC-1 outright. Slice 00's AC-10 pins the same property at
the SQL level; AC-1's new evidence is that **the statement the application generates** is one the
mechanism protects.

### 2.3 AC-2 — "exactly one statement modified it", made falsifiable

The slice's own Definition of Done has the reviewer read the generated SQL. That stays, as a second
and independent check, but it is not the primary one: §10's rule is that a criterion be mappable to
an executable test, and *"the reviewer looked"* is not.

**The instrument is a row-level audit trigger, installed and dropped by the test**, in
`tests/integration/reschedule-is-one-statement.test.ts` (test-engineer's — it asserts a database
invariant). `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` on `appointment`, recording
`TG_OP`, `txid_current()` and `statement_timestamp()` into a scratch table. One successful `PATCH`
must leave **exactly one** audit row for that id, `TG_OP = 'UPDATE'`, at one distinct
`statement_timestamp()`.

| Implementation | Audit rows | Verdict |
|---|---|---|
| One `UPDATE` | `UPDATE` × 1 | pass |
| `DELETE` then `INSERT`, same id | `DELETE`, `INSERT` | **fails** |
| Cancel then book | `UPDATE`, `INSERT` | **fails** |
| Clear the interval, then set it | `UPDATE`, `UPDATE`, two timestamps | **fails** |
| Read, then one `UPDATE` | `UPDATE` × 1 | pass — correctly; the pre-read is AC-5's subject, not AC-2's |

A trigger as an instrument is already this project's idiom — the racing-moves obligation proposes
one as a mutant control — and this one is `AFTER`, blocks nothing and changes no semantics.
Rejected: `pg_stat_user_tables`, whose counters are table-wide and stats-collector-lagged, so it
would flake against a shared container; and `xmin`, which advances per transaction rather than per
statement and cannot count to two.

**No new quality scenario.** §10 has zero words of ratchet headroom (§4), AC-2 has an executable
falsifier of its own, and QS-5 at slice 07 is the scenario that makes *one statement* matter under
concurrency. Recorded so the gate is not left to notice the absence.

### 2.4 ADR-0024's two warnings

**Warning 1 — `cancel-appointment.test.ts:247`.** Routed, not fixed: the file is the
test-engineer's under §5, and the implementer that turns it red raises a DCR rather than editing
it. The design's instruction is that the re-derivation lands **in the same red commit**, so the
assertion is never a merged test degraded by a later fix. What still discriminates once
`setNotFoundHandler` exists is the `type` member, plus a negative control the media type used to
supply for free: `POST /appointments/{id}/nonsense` must answer `/problems/route-not-found`, which
is what proves the cancellation route exists.

**Warning 2 — `problem.ts` at the threshold. Prevented, and the prevention already exists.**
Measured from `reports/mutation/mutation.json` rather than assumed: `problem.ts` scores **75.00**,
9 killed of 12, and all three survivors are on **line 78** — the `additionalProperties: false` and
the schema description. Those are precisely the mutants slice 05 ruled must **not** be disabled.

The two new rows add two `StringLiteral` mutants. Both are killed by an assertion that is already
committed: `tests/unit/http/appointments.test.ts:799` asserts `PROBLEM_TYPES` by **set equality**.
Extending that list from seven to nine is not optional — the unit test fails otherwise — so the
kill is self-enforcing. Arithmetic: **11 of 14, 78.57**, above 0.75. The three survivors stay
three.

**And the taxonomy changes once, not twice.** `appointment-not-confirmed` and `route-not-found`
land in the same red commit and the same green commit, so `PROBLEM_TYPES` goes 7 → 9 in one step,
`error-taxonomy.test.ts`'s list is rewritten once, and §8.6 is edited once. That answers the
warning by removing the second change rather than budgeting for it.

**Stryker exhaustiveness disables.** Measured: `routes/appointments.ts` scores 83.93 with 18
survivors, of which **nine** are the three existing `const unhandled: never` arms — three each, on
two lines (`default: {` carries a `ConditionalExpression` and a `BlockStatement`; the `throw`
carries the template literal). `// Stryker disable next-line` cannot cover an arm; the instrument
is a `// Stryker disable all : <reason>` … `// Stryker restore all` pair **around each arm**, four
after this slice. Those arms only. Effect, holding this slice's new mutants aside: 94 of 103,
**91.3**, which discriminates again.

## 3. Interfaces and the delta

No table, column, constraint or migration changes. `PATCH /appointments/{id}`, body `{ startsAt }`,
`additionalProperties: false` — a client naming a bay or technician has it stripped before the
handler, the same structural argument AC-6 rests on.

```ts
// src/application/rescheduleAppointment.ts — its OWN union, not a reuse (§5.2's rule)
export type RescheduleOutcome =
  | { kind: 'moved'; appointment: AppointmentView }        // 200
  | { kind: 'not-found' }                                  // 404 — the read (ADR-0025)
  | { kind: 'not-confirmed' }                              // 409 appointment-not-confirmed — 0 rows
  | { kind: 'malformed-instant' }                          // 400 malformed-request
  | { kind: 'outside-opening-hours'; verdict: OpeningHoursVerdict }   // 400
  | { kind: 'no-capacity'; resource: ContendedResource; attempts: number;
      exit: 'exhausted' | 'capped' }                       // 409 no-capacity
  | { kind: 'no-verdict' }                                 // 500 — 40P01
  | { kind: 'reference-data-invalid'; detail: string };    // 500

// src/persistence/appointmentRepository.ts
export interface Move { readonly id: string; readonly startsAt: Date; readonly endsAt: Date }
export function rescheduleAppointmentById(db: Db, move: Move, lock: ResourceLock)
  : Promise<AppointmentRow | null>;
```

```sql
UPDATE appointment
   SET bay_id = $2, technician_id = $3, starts_at = $4, ends_at = $5, updated_at = now()
 WHERE id = $1 AND status = 'confirmed'
RETURNING <the ten columns>;
```

Four notes a reviewer will otherwise have to ask for.

- **`updated_at = now()`, with no `CASE`.** Slice 05 needed one because a cancellation replay is a
  no-op the client can reach; a move is never idempotent — every success changes the interval — so
  `now()` is never a client-reachable write to an unchanged row.
- **`bay_id` and `technician_id` come off the `ResourceLock`** (ADR-0026), not out of `Move`.
- **Zero rows aborts the loop**, it does not retry. Inside the loop zero rows still means one
  thing, a concurrent cancel, and retrying would mask it.
- **`bad-reference` (`23503`) maps to `reference-data-invalid`, not to `unknown-reference`.** The
  row's own references were already valid and the move sets none of them, so a `23503` here is the
  system's fault. It should be unreachable; if it fires, that is the finding.

**Deadlock argument, since a new locking path is F-02-9's subject.** The move takes
`lockResources(trx, newBayId, newTechnicianId)` and then the `UPDATE`, so advisory locks — totally
ordered by ADR-0018's disjoint classes — are always acquired *before* the row lock, and no cycle
can form between two moves or between a move and a booking. A concurrent **cancel** holds the row
lock and takes no advisory lock at all (ADR-0023), so the wait is one-directional, which is
ADR-0023's M3 argument extended by one path rather than a new one.

## 4. Step 7, and the constraint on it

**Measured before it becomes a surprise: four of the five arc42 files this slice touches have
essentially no ratchet headroom.** Ceiling minus current words —
§5 **15**, §6 **1**, §8 **7**, §10 **0**, §11 **2**. So every step-7 addition must be paid for by
a deletion in the same file, and the deletions are available: §6.3 loses the follow-up read and its
`0 rows` sentence, §6.6 loses its closing paragraph about slice 06 reproducing the ambiguity, §10
loses QS-11's *"at slice 06"* forward references and QS-6's *"pinned rather than assumed"*, §8.6
loses ADR-0024's *"slice 06 registers…"* sentence as the rows land.

Planned edits: §5.2 — `rescheduleAppointment`, `ResourceLock`, and the retirement of
`appointment.ts` with its reason; §6.3 — the statement as built, no follow-up read, ADR-0025's two
deciders; §6.6 — the two `0 rows` rows corrected; §8.6 — two rows and the residual invariant
discharged; §10 — QS-6 and QS-11 as built; §11 — the allowlist/denylist asymmetry, ADR-0026's
transaction-identity hole, the duplicated loop, and F-05-1 and D-05-1 struck.

## 5. What steps 2 to 4 are asked to do

- **Test-engineer** — one red commit: `tests/integration/reschedule-self-overlap.test.ts` (AC-1
  with its refusal control), `tests/integration/reschedule-is-one-statement.test.ts` (AC-2's
  trigger), `tests/contract/error-taxonomy.test.ts` extended to nine rows, the ADR-0024 hostile
  corpus, and the re-derivation of `cancel-appointment.test.ts:247`. Please object at step 2 if
  AC-5's amendment reads as weakening rather than tightening — that is the ruling most likely to
  be wrong.
- **AC-4's metric half is not assertable in this slice.** `booking_conflicts_total` does not exist
  until slice 09, which already carries it as that slice's AC-5. AC-4 here asserts the status and
  the `type`; the *"does not increment"* half is slice 09's and is already homed there.
- **Implementer** — the route, the use case, the statement, ADR-0026's signatures across the
  booking path, `setNotFoundHandler`, the `server.ts:36` docblock (D-05-1), the four Stryker
  disable pairs, and `PROBLEM_TYPES` at nine in `tests/unit/http/appointments.test.ts`.

## 6. Assumptions, findings and open questions

- **A-06-1** — §2.2's mechanism is read off PostgreSQL's documented `check_exclusion_constraint`
  behaviour and slice 00's AC-10 measurement, not re-measured here. AC-1's refusal control is what
  would catch it being wrong.
- **A-06-2** — an appointment id is unreachable by a client before it exists, so `absent` is
  permanent. It rests on `deps.newId()` being the only minting site, which nothing asserts.
- **F-06-1** — two attempt loops, one design. Extraction deferred to slice 09 (§1).
- **OQ-06-1** — a move that changes nothing (`startsAt` equal to the current one) is a successful
  `200` that rewrites the row and advances `updated_at`. Slice 05 spent a `CASE` avoiding exactly
  this on the cancel path. Ruled **out of scope** here — a move to the same instant is not a replay
  of a request, it is a request — and recorded because the gate may disagree.
