# Slice 06 — design

Slice file: [`06-reschedule-atomic-move.md`](06-reschedule-atomic-move.md) — five acceptance
criteria, QS-6 and QS-11, implementing [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md).
New: [**ADR-0025**](../adr/0025-existence-is-the-reads-legality-is-the-statements.md),
[**ADR-0026**](../adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md),
[**ADR-0027**](../adr/0027-a-move-attempts-the-pair-it-already-holds-before-it-shuffles.md) and
[**ADR-0028**](../adr/0028-the-lock-carries-the-transaction-it-was-taken-on.md) (`proposed`).
**Amended at step 2** under I-06-1, I-06-2 and T-06-1 to T-06-3.
arc42 in scope: **§5.2, §6.3, §6.6, §8.6, §10, §11**. No data-model delta, no migration, no
`.dependency-cruiser.js` change.

All rulings below are the architect's under the standing delegation and **provisional until the
gate**. Facts already in an ADR or in arc42 are cited, not repeated.

## 1. Scope — the five inherited obligations, and one that is bigger than all of them

Slice 06 as handed over carries five inherited obligations, five acceptance criteria, a new route,
use case and statement. **Two of the five are ruled out**, one is retired, and the rest is
re-sequenced so it costs one pass rather than two.

| Obligation | Ruling |
|---|---|
| **Racing moves** — ADR-0003's claim that two racing reschedules behave like two racing bookings | **Deferred to slice 07 as `A-06-3`**, argued in full there. In short: the reason given for keeping it is equally true of QS-4 and QS-5, already slice 07's and deferred without complaint, and a reason that does not distinguish its own case is not one |
| **F-05-1 — `ResourceLock`** | **Kept, and strengthened.** ADR-0026. A third deferral is D-05-3's pattern, and slice 06 is the path it was deferred *to* |
| **ADR-0024 — `setNotFoundHandler`, the `route-not-found` row, the hostile corpus** | **Kept, and merged into one taxonomy change.** See §2.4 |
| **`src/domain/appointment.ts`** | **Retired, not deferred** — ADR-0025 decision 6. No destination to name because no obligation is left: §5.2's as-built cell records the retirement and its reason at step 7 |
| **The Stryker exhaustiveness disables** | **Kept.** Four comment pairs; measured effect in §2.4 |

**One item was added, and it is larger than anything removed.** ADR-0003 requires that a move
needing a different bay or technician re-runs ADR-0004's candidate selection and retry — a second
copy of `bookAppointment`'s loop. Considered and rejected: rule re-allocation out and let a move
keep its own bay and technician. Much smaller, and it makes `PATCH` **refuse while capacity
exists** — A at `[09,10)` in bay 1 wanting `[11,12)`, bay 1 busy and bay 2 free, answered `409
/problems/no-capacity`. That is the one behaviour this system is about (QS-3), so the loop stays.

**And the loop starts on the pair the move already holds** — ADR-0027, raised as I-06-2. Calling it
*a second copy of `bookAppointment`'s loop* said nothing about where it starts, writing ADR-0003's
*needing a different bay or technician* out of the design; under a shuffle-from-first order **AC-1
cannot fail**, because the self-overlap it pins is only exercised when the new version lands in the
same bay with the same technician. The omission was the architect's.

**The duplication is a finding, not a design** — `F-06-1`, deferred to slice 09 and written in full
there: slice 09 must instrument both loops anyway, so it opens both files regardless.

## 2. The four decisions

### 2.1 AC-4 and AC-5 — one zero-row result cannot decide both

Ruled in **ADR-0025**, whose decisive fact was found by trying to write the statement: **a move
cannot be constructed without reading its own row**, because the interval is derived from the
appointment's service type and validated against its dealership's hours. So AC-5's *"decided by the
`UPDATE` affecting zero rows rather than by a preceding read"* is not merely unmet, it is
unimplementable.

**AC-5 is amended**, and the replacement wording is landed in the slice file rather than copied
here. It is **stricter** than the original in the direction that matters: it forbids the
follow-up read §6.3 currently mandates, and it is falsified by any build that answers `404` after
issuing an `UPDATE`. **As first written that falsifier could not run** (T-06-1): an `AFTER … FOR
EACH ROW` trigger does not fire on an `UPDATE` matching zero rows, so AC-2's instrument was silent
on exactly the difference between rejected Option A and chosen Option C — and an amendment whose
strictness cannot be falsified is not stricter. §2.3's statement-level companion observes it, and
ADR-0025 decision 3 gets its first executable falsifier rather than an argument.

**This is not check-then-act, and ADR-0025 decision 5 gives the reason at the level of the
mechanism:** §2 forbids a read whose answer *authorises* a write its own staleness could invalidate.
This read authorises a **refusal**, touches one row by primary key, and cannot answer *"is that bay
free"*.

**Ruled consequence, recorded because a test will hit it at step 3:** a cancelled appointment moved
to an out-of-hours slot answers `400 /problems/outside-opening-hours`, not `409` — the status guard
lives only in the statement, so the domain rule is evaluated first. Cost if wrong: one taxonomy row
reported in place of another on a doubly-invalid request.

### 2.2 AC-1 — the mechanism, and what makes the pass honest

§8.2 consequence 4 states the mechanism; slice 06 owes the level below it, because QS-11 is on this
slice and *"it passed"* does not distinguish a working constraint from an absent one.

**Why PostgreSQL does not see the row's own prior version.** An `UPDATE` writes a **new heap
tuple**, stamps the old one's `xmax` with this transaction's xid, and inserts a new entry into each
index, the two partial GiST indexes included. `check_exclusion_constraint` runs *after* that entry
exists: it scans for conflicts under `bay_id WITH =` and `tstzrange(…) WITH &&`, skips the entry it
just inserted by `ctid`, and fetches every other candidate's heap tuple to test whether it is **live
to this transaction**. The superseded version carries `xmax` = this transaction's own xid, so it is
*deleted by me* — not a live conflict.

The load-bearing half is that this is a property of the **enforcement mechanism**, not of the row.
A `BEFORE UPDATE` trigger computing the same overlap reads the heap, so it *does* see the prior
version, and is correct only if whoever wrote it remembered `AND o.id <> NEW.id`.

**What makes AC-1's pass honest** are **two** controls in the same fixture, with the same
statement, each of which must raise a `23P01` — one per constraint. There are two, slice 00 asserts
both, and a bay-side control alone passes a build that got the bay right and left the technician
side able to self-conflict (T-06-2).

**They assert the constraint name, not the status code**, and that is not stylistic: under
ADR-0004's retry a move onto a bay held by another confirmed appointment does **not** produce a
`409` — it produces a *successful move to a different bay*, so a control expecting a refusal would
either fail or pass for the wrong reason.

| Control | Fixture | Asserted |
|---|---|---|
| Bay | the appointment's **own** bay held at the target interval, its technician free | `23P01` naming `no_bay_overlap` |
| Technician | the mirror image | `23P01` naming `no_technician_overlap` |

The request may then succeed by re-allocation, and that is **correct** rather than a failure of the
control. The observation is on the `booking.conflict` log line — QS-1's observer, and the only place
the constraint name appears. Pinning the `409` too, with a single-bay fixture, is optional: slice
00's AC-10 pins the SQL level, and AC-1's new evidence is that **the statement the application
generates** is one the mechanism protects.

### 2.3 AC-2 — "exactly one statement modified it", made falsifiable

The slice's own Definition of Done has the reviewer read the generated SQL. That stays, as a second
and independent check, but it is not the primary one: §10's rule is that a criterion be mappable to
an executable test, and *"the reviewer looked"* is not.

**The instrument is a pair of audit triggers, installed and dropped by the test**, in
`tests/integration/reschedule-is-one-statement.test.ts` (test-engineer's — it asserts a database
invariant). Both are `AFTER`: they block nothing and change no semantics.

- **Row level** — `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW`, recording `TG_OP`,
  `txid_current()` and `statement_timestamp()` into a scratch table.
- **Statement level** — `AFTER UPDATE REFERENCING NEW TABLE AS changed FOR EACH STATEMENT`,
  recording `(SELECT count(*) FROM changed)` as `affected`. It fires on a zero-row `UPDATE`, which
  the row-level trigger cannot.

**The discriminator is a statement-level row with `affected = 0`, not a count of firings.** Zero
firings is unsound against this harness: `vitest.config.ts`'s `db` project runs six directories
against one container on one `databaseUrl` without `fileParallelism: false`, and a statement-level
trigger has no `NEW` to filter by id — so a concurrent file's `UPDATE` would count, flaky toward
**false failures**. That `UPDATE` matches rows; only one issued and matching nothing records zero.

| Implementation | Audit rows | Verdict |
|---|---|---|
| One `UPDATE` | `UPDATE` × 1 | pass |
| `DELETE` then `INSERT`, same id | `DELETE`, `INSERT` | **fails** |
| Cancel then book | `UPDATE`, `INSERT` | **fails** |
| Clear the interval, then set it | `UPDATE`, `UPDATE`, two timestamps | **fails** |
| Read, then one `UPDATE` | `UPDATE` × 1 | pass — correctly; the pre-read is AC-5's subject, not AC-2's |
| Unknown id, ADR-0025's Option C | none, and **no statement row** | pass |
| Unknown id, rejected Option A | none, but **one statement row, `affected = 0`** | **fails** |
| A discarded candidate | `UPDATE` × 1 | pass |

**The discarded-candidate case is where a stray row would leak** (T-06-3): the original slot
contended, forcing a second candidate. Only constructible under ADR-0027, and it reuses §2.2's
bay-control fixture, so the marginal cost is one query and one assertion. No hole is found — a
failed attempt's `UPDATE` raises `23P01` before its row triggers fire at end of statement, and even
then the write rolls back with the attempt's savepoint (ADR-0004). It is asserted because the loop
is new, and the obviousness is exactly what nobody checks.

Rejected, and independently confirmed by the test-engineer: `pg_stat_user_tables`, whose counters
are table-wide and stats-collector-lagged, so it would flake against a shared container; and `xmin`,
which advances per transaction rather than per statement and cannot count to two.

**No new quality scenario**, recorded so the gate is not left to notice the absence: §10 has zero
ratchet headroom (§4), AC-2 now has two executable falsifiers of its own, and QS-5 at slice 07 is
the scenario that makes *one statement* matter under concurrency.

### 2.4 ADR-0024's two warnings

**Warning 1 — `cancel-appointment.test.ts:247`.** Routed, not fixed: the file is the
test-engineer's under §5, and the re-derivation lands **in the same red commit**, so the assertion
is never a merged test degraded by a later fix. What still discriminates once `setNotFoundHandler`
exists is the `type` member, plus the control the media type used to supply for free: `POST
/appointments/{id}/nonsense` must answer `/problems/route-not-found`, proving the cancellation route
exists.

**Warning 2 — `problem.ts` at the threshold. The arithmetic here was wrong, and the correction
inverts its reason.** I-06-1 is the round's one objection and it is a measurement: Stryker run twice
against `src/http/problem.ts`, with and without the two new rows, **12 mutants both times**, against
a claimed 11 of 14.

`problem.ts` is **immune, not cushioned**, and the root cause is in the instrumenter rather than in
the suite: `@stryker-mutator/instrumenter`'s `syntax-helpers.js` lists `TSAsExpression` among
`tsTypeAnnotationNodeTypes`, so `[…] as const` is classed as a **type node** and its whole subtree
is skipped — the array declaration and all seven string literals with it. Verifiable from the
committed `reports/mutation/mutation.json` without re-running anything: exactly 12 mutants, **none**
on lines 50–58 (the `PROBLEM_TYPES` array), and the only `ArrayDeclaration` plus `StringLiteral`
cluster on line 72, the inline `Type.Literal` array, which has no `as const`.

So the score is **9 of 12, 75.00, before and after** — the same three survivors on line 78, no new
mutants, **no new margin**. Extending `tests/unit/http/appointments.test.ts:799` from seven members
to nine stays mandatory, but it is a **compiler-and-assertion** fact rather than a kill, and calling
it a kill was the error. Nothing blocks: `slice:check` compares `>= 0.75`, `stryker.config.mjs`
breaks at 74.

**F-06-2, which is larger than the arithmetic that produced it.** Because the taxonomy is an
`as const` the instrumenter skips, **a deleted taxonomy row would be scored as no change**: the
mutation score is silent on precisely what QS-11 is about. What guards the taxonomy is
`tests/contract/error-taxonomy.test.ts` asserted ∀responses ∃row — which is why ADR-0024's corpus
*direction* is load-bearing. Ruled **accepted, no new control**: the guard exists and this slice
extends it. Residual to §11 at step 7 — with no margin, any future unkilled mutant in `problem.ts`
drops the file below threshold.

**And the taxonomy changes once, not twice.** Both rows land in the same red and green commits, so
`PROBLEM_TYPES` goes 7 → 9 in one step and §8.6 is edited once — answering the warning by removing
the second change rather than budgeting for it.

**Stryker exhaustiveness disables.** Measured: `routes/appointments.ts` scores 83.93 with 18
survivors, **nine** of them the three `const unhandled: never` arms. Effect of a
`// Stryker disable all` … `restore all` pair around each arm — four after this slice, those arms
only — holding this slice's new mutants aside: 94 of 103, **91.3**, which discriminates again.

## 3. Interfaces and the delta

No table, column, constraint or migration changes. `PATCH /appointments/{id}`, body `{ startsAt }`,
`additionalProperties: false` — a client naming a bay or technician has it stripped before the
handler, AC-6's structural argument.

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

Five notes a reviewer will otherwise have to ask for.

- **`updated_at = now()`, with no `CASE`.** Slice 05 needed one because a cancellation replay is a
  no-op the client can reach; a move is never idempotent, so `now()` is never a client-reachable
  write to an unchanged row.
- **`bay_id` and `technician_id` come off the `ResourceLock`** (ADR-0026), not out of `Move`.
- **Attempt 1 is the appointment's current `(bay_id, technician_id)`**, then ADR-0009's seeded
  shuffle over the remainder; Bound-2 pruning and the cap of 16 are unchanged (ADR-0027).
- **Zero rows aborts the loop**, it does not retry. Inside the loop it still means one thing, a
  concurrent cancel, and retrying would mask it.
- **`bad-reference` (`23503`) maps to `reference-data-invalid`, not `unknown-reference`.** The row's
  references were already valid and the move sets none of them, so a `23503` here is the system's
  fault. It should be unreachable; if it fires, that is the finding.

**Deadlock argument, since a new locking path is F-02-9's subject.** The move takes
`lockResources(trx, bayId, technicianId)` and *then* the `UPDATE`, so advisory locks — totally
ordered by ADR-0018's disjoint classes — are always acquired before the row lock, and no cycle can
form between two moves or between a move and a booking. A concurrent **cancel** holds the row lock
and takes no advisory lock at all (ADR-0023), so the wait is one-directional: ADR-0023's M3
argument extended by one path, not a new one.

## 4. Step 7, and the constraint on it

**Measured before it becomes a surprise: four of the five arc42 files this slice touches have
essentially no ratchet headroom.** Ceiling minus current words — §5 **15**, §6 **1**, §8 **7**,
§10 **0**, §11 **2**. Every step-7 addition must be paid for by a deletion in the same file, and
they are available: §6.3 loses the follow-up read and its `0 rows` sentence, §6.6 its closing
paragraph, §10 QS-11's *"at slice 06"* forward references, §8.6 ADR-0024's *"slice 06 registers…"*
sentence as the rows land.

Planned edits: §5.2 — `rescheduleAppointment`, `ResourceLock`, the retirement of `appointment.ts`
with its reason; §6.3 — the statement as built, no follow-up read, ADR-0025's two deciders; §6.6 —
the two `0 rows` rows corrected; §8.6 — two rows and the residual invariant discharged; §10 — QS-6
and QS-11 as built; §11 — the allowlist/denylist asymmetry, the transaction-identity hole now
carrying ADR-0028 rather than adding an entry, F-06-2's zero-margin residual, the duplicated loop,
and F-05-1 and D-05-1 struck.

## 5. What steps 2 to 4 are asked to do

- **Test-engineer** — one red commit: `tests/integration/reschedule-self-overlap.test.ts` (AC-1
  with §2.2's **two** constraint-name controls), `tests/integration/reschedule-is-one-statement.test.ts`
  (§2.3's two triggers, the `affected = 0` discriminator and the discarded-candidate case),
  `tests/contract/error-taxonomy.test.ts` extended to nine rows, the ADR-0024 hostile corpus, and
  the re-derivation of `cancel-appointment.test.ts:247`. **Step 2's outcome:** the ruling flagged
  as most likely wrong — AC-5's amendment — is the one the test-engineer *defended*, against the
  dispatch's framing (T-06-4); its five findings are folded in above, three of them narrowing a
  remedy rather than accepting it.
- **AC-4's metric half is not assertable here.** `booking_conflicts_total` does not exist until
  slice 09, which carries it as that slice's AC-5. AC-4 asserts the status and the `type`; the
  *"does not increment"* half is already homed there.
- **Implementer** — the route, the use case, the statement, the loop starting on the current pair
  (ADR-0027), ADR-0026's signatures across the booking path, `setNotFoundHandler`, the `server.ts:36` docblock (D-05-1), the four Stryker
  disable pairs, and `PROBLEM_TYPES` at nine in `tests/unit/http/appointments.test.ts`.

## 6. Assumptions, findings and open questions

- **A-06-1** — §2.2's mechanism is read off PostgreSQL's documented `check_exclusion_constraint`
  behaviour and slice 00's AC-10, not re-measured here. §2.2's two controls are what would catch it
  being wrong.
- **A-06-2** — an appointment id is unreachable by a client before it exists, so `absent` is
  permanent. It rests on `deps.newId()` being the only minting site, which nothing asserts.
  **Declined for slice 06 and deferred to slice 09.** ADR-0019 applied to the architect itself: the
  mechanism exists but the hazard does not — no client-supplied id exists — so a control here guards
  a future regression, not a live doubt. Slice 09 is *stronger* because it emits the OpenAPI
  document, so the check runs over ∀operations rather than over the files someone grepped — the
  direction-of-assertion move ADR-0024's corpus makes — and *cheaper* because that document is
  generated there anyway. **Slice 10 was named at step 2 and is a tombstone** Gate D folded into 09
  (O-42), the second routing to it after OQ-05-2: the reasoning was never at issue, only the label.
- **T-06-5 / ADR-0028** — ADR-0026's `ResourceLock` does not prove the write runs in the lock's
  transaction, and the test-engineer's contribution is a **negative result**: no black-box test can
  observe it, because the exclusion constraint backstops correctness either way, so any test that
  saw the hole would be seeing a failure the constraint already prevents. That is why types are the
  only available control. Accepted in full; the remedy is
  [ADR-0028](../adr/0028-the-lock-carries-the-transaction-it-was-taken-on.md), `status: proposed`,
  **declined here as §6 outcome (b)** and deferred to slice 09 with F-06-1, whose extraction
  reopens both write paths. ADR-0026 is not wrong and is not superseded.
- **F-06-1** — two attempt loops, one design. Extraction deferred to slice 09 (§1).
- **OQ-06-1** — a move that changes nothing (`startsAt` equal to the current one) is a successful
  `200` that rewrites the row and advances `updated_at`; slice 05 spent a `CASE` avoiding exactly
  this on the cancel path. Ruled **out of scope** — a move to the same instant is not a replay of a
  request, it is a request — and recorded because the gate may disagree.
