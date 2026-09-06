# Slice 05 — design

Slice file: [`05-cancellation.md`](05-cancellation.md) — four acceptance criteria, QS-7,
implementing [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md).
New: [**ADR-0023**](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md).
arc42 scope: **§5.2, §6.4, §6.6, §8.6, §10, §11**.
**No data-model delta, no migration, no `.dependency-cruiser.js` change.**

## 1. What is actually being proved, and what would survive without it

The exclusion constraints carry `WHERE (status <> 'cancelled')`. Slice 00 exercised that predicate
in SQL. This slice is the only one that reaches it **through the API**, and AC-1 is the whole of it.

**If the predicate were silently dropped from both constraints, everything else in this slice would
still pass.** AC-2 (`200` + `status: cancelled`) reads a row and consults no constraint. AC-3
(idempotent) rewrites a status. AC-4 (`404`) touches no row at all. The `UPDATE` itself would still
succeed — a cancelled row conflicts with nothing either way. **Only AC-1's third step dies**, from
`201` to `409`. That is the mutant, it lives in a `.sql` file where Stryker cannot reach it, and one
acceptance criterion is the entire guard on it.

One property makes that guard stronger than it looks: **an `INSERT` is checked against every
exclusion constraint on the table**, so a single `201` after cancellation proves *both* predicates
live at once. AC-1 also kills the drop-one variants — with the fixture of §3, a re-book refused on
either constraint is still a refusal.

## 2. The four decisions

### D1 · Idempotency is one unconditional `UPDATE`, and §2.1's question never arises

```sql
UPDATE appointment
   SET status = 'cancelled',
       updated_at = CASE WHEN status = 'cancelled' THEN updated_at ELSE now() END
 WHERE id = $1
RETURNING …;
```

No guard predicate, no pre-read, no read-then-write. **Zero rows means exactly one thing — no such
id — which is AC-4 and §6.6's "unknown appointment id" row.** Measured: the guarded alternative
`WHERE id = $1 AND status <> 'cancelled'` returns zero rows for an already-cancelled row too, so it
buys ambiguity and a second round trip to resolve it.

**Does `CLAUDE.md` §2.1 reach here?** Its *reason* would not: cancellation is monotone and terminal,
so two racing cancels commute and there is no wrong end state to race into (ADR-0023 M3 — twenty
concurrent cancels, one row each, no error). But §2.1 is a **shape** rule with no exception clause,
and the unconditional statement performs no check at all, so the design never has to argue an
exemption. A rule you never invoke is cheaper than one you reason your way around.

**AC-3's "nothing changes" is met literally, not interpreted down.** Measured: a plain
`updated_at = now()` advances the column on the second call, which would make a replayed cancellation
a client-reachable write to a column §8.1 says the application maintains. The `CASE` keeps it in one
statement, one round trip, zero-rows still unambiguous, and the second call changes **no column** —
measured. It reads `status` inside the statement that writes it, which is atomic under the row's own
lock and is not a check-then-act window. (§6.4 currently prints `updated_at = now()`; that is the
§6.4 edit at step 7.)

### D2 · Cancellation takes no advisory lock — [ADR-0023](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md)

F-02-9 says *every* write path takes both locks. Slice 05 is the first path that sentence is wrong
about, so the ADR narrows it to an **iff**: a statement locks iff the row version it writes falls
inside an exclusion constraint's scope. A cancelled row satisfies no constraint's `WHERE`, so there
is no adjudication for a lock to serialise — and the locks are keyed on bay and technician, which a
cancel request does not carry, so obeying the sentence literally would require the pre-read D1
removes.

Measured, not asserted: an inserter **waits** on an uncommitted cancel and then gets `201` (M1); the
cancel never waits on an exclusion check (M2, 2 ms with a conflicting insert in flight); 20 cancels
racing 20 inserts on one bay give **zero `40P01`** with no lock taken (M3). The wait is
one-directional and a one-directional wait cannot cycle. **Slice 06 is unaffected** — a reschedule
writes a `confirmed` row, which is in scope, so it locks.

### D3 · AC-2 needs no change to slice 02's read path, and the scope says so

`readAppointment` already returns `found` for a cancelled row and says why in its own comment;
`AppointmentView.status` is already the two-member union; and `AppointmentBody.status` is already
`Type.Union([...])` rather than `Type.Literal('confirmed')` **specifically so this slice's test can
fail** (a single literal substitutes the constant). Slice 02 built AC-2 and could not exercise it,
because nothing could produce a cancelled row.

So AC-2 is a **contract assertion over existing behaviour, newly reachable** — zero production lines.
It is still honestly red at step 3: the cancellation route does not exist, so no cancelled row can be
created to read. `src/http` and `src/application` are the only places AC-2 could regress, and neither
is edited on the read path.

### D4 · What revokes `gate: light`

The slice is designed to stay light: one route, one use case, one repository function, no migration,
no schema change, no change to the booking path, no ruleset change. It is revoked by any open
MAJOR/BLOCKING, and three are foreseeable and worth naming now:

1. **ADR-0023 being wrong** — if step 3 measures a cancel taking or waiting on an exclusion check,
   the ADR is a design defect, superseded, and the gate is not light.
2. **AC-1 passing vacuously** — §3. A test that proves the freed slot only under a re-derived
   candidate is a MAJOR test-quality finding, not a nit, because AC-1 is the slice.
3. **A surviving mutant on the cancel `switch`** — the outcome union has two members and both are
   client-visible; a survivor there means the `404` arm is unasserted.

## 3. The trap in AC-1, named so step 3 does not discover it

*"The same booking now succeeds"* is easy to satisfy dishonestly. Four ways, and the design closes
all four in the fixture and the test's structure rather than by asking for care:

- **The fixture is exactly one bay and one technician.** With `|B| = |T| = 1` there is one
  permutation, so slice 04's seeded shuffle cannot vary the candidate and `BOOKING_SEED` must **not**
  be pinned — pinning it is ADR-0021's Order-A and would make the test depend on a knob instead of on
  the fixture. The trap dissolves by shape.
- **One request value, posted twice.** The refused attempt and the successful one must be the *same*
  `const` body sent again, so "the same booking" is enforced by the program rather than by a reader
  comparing two literals.
- **The refusal must be the right refusal**: `409` with `type=/problems/no-capacity` and `resource`
  present. A `400` or a differently-typed `409` read as "refused" would make the sequence pass with
  no capacity conflict in it at all.
- **The `201` must name A's bay and technician**, and a different `id` from A. With this fixture it
  must; asserting it makes any future widening of the fixture fail loudly rather than quietly weaken
  the test.

**AC-1 is its own control.** The same request, refused before the cancellation and accepted after it,
with nothing else changed — that before/after pair is what attributes the `201` to the predicate.

## 4. Interfaces

| Where | Delta |
|---|---|
| `src/persistence/appointmentRepository.ts` | `cancelAppointmentById(db, id): Promise<AppointmentRow \| null>` — D1's statement, no transaction block (one statement is its own), **no `lockResources`**, docblock quoting the constraint predicate beside it (ADR-0023's only mitigation for F-05-1) |
| `src/application/cancelAppointment.ts` | `CancelOutcome = { kind: 'cancelled'; appointment: AppointmentView } \| { kind: 'not-found' }` |
| `src/http/routes/appointments.ts` | `POST /appointments/:id/cancellation` — same `AppointmentParams`, `response: { 200: AppointmentBody, ...PROBLEM_RESPONSES }`, one exhaustive `switch` |

`CancelOutcome` is **its own union**, not a reuse of `ReadOutcome`, although they are structurally
identical today. Sharing them would mean a member added for one route silently changing the other
route's exhaustiveness check — §5.2's rule, and the reason each use case declares its own.

**§8.6 gains no row.** `404 /problems/appointment-not-found` already exists and is reused verbatim;
there is no new status, no new `type`, no new `Problem` member. An error taxonomy that absorbs a new
operation without growing is evidence it was drawn correctly.

**`src/domain/appointment.ts` is not created.** §5.2 predicts it here, holding "cancellation is
terminal and idempotent; only a confirmed appointment may be moved". Under D1 the first half is a
property of the statement's totality and the second half is slice 06's — so the module would ship
with no caller, which is dead code and free Stryker survivors. It moves to slice 06, where the
`409 /problems/appointment-not-confirmed` arm gives it one. §5.2 correction at step 7.

## 5. Scope ruling — one added test file

The slice file scopes one integration test. ADR-0023 exempts a write path from F-02-9 on a claim,
and ADR-0018 set the house standard that lock claims are **measured**. So:
`tests/concurrency/cancellation-takes-no-lock.test.ts` — M3's shape, one `it()`: N cancels racing N
bookings for the freed slot, asserting **zero `booking.deadlock` lines, zero `500`s, every request a
verdict, and exactly one `confirmed` row**. It is a *liveness* measurement and must say so:
correctness is not at risk here, because a cancelled row conflicts with nothing.

Recorded as a scope ruling under the standing delegation, **provisional until the gate**. Cost if
wrong: one test file the gate can delete.

## 6. Findings, assumptions, open questions

- **F-05-1** — `appointmentRepository.ts` will hold two write functions, one locking and one not, and
  "correctly exempt" reads identically to "forgot the lock". F-02-9's own complaint, now with a
  second case. Nothing structural separates them. **arc42 §11 at step 7**, alongside F-02-9's
  narrowed wording.
- **A-05-1** — AC-3 is ruled to mean *no column of the row changes and the response body is
  identical*, met literally by D1's `CASE`. If the gate prefers the plain `updated_at = now()`, the
  cost is that a replayed cancellation is a client-reachable write to a column §11.2 R-10 already
  carries as debt. Provisional.
- **OQ-05-1** — the route takes **no request body**; there is nothing to send (ADR-0002 puts *who
  cancelled* out of scope). Unmeasured: what Fastify does with `POST` + `Content-Type:
  application/json` + an empty body. Measure at step 3 and let the harness's finding fix the contract,
  rather than guessing a schema now.
- **A-05-2** — ADR-0023's measurements are three readings of one PostgreSQL version on this
  repository's own constraint definitions. The structural argument carries the decision; the
  measurements are what would have caught it being wrong.
