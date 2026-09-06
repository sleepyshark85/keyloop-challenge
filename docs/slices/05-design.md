# Slice 05 — design

Slice file: [`05-cancellation.md`](05-cancellation.md) — four acceptance criteria, QS-7,
implementing [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md).
New: [**ADR-0023**](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md).
arc42 scope: **§5.2, §6.4, §6.6, §8.6, §10, §11**.
**No data-model delta, no migration, no `.dependency-cruiser.js` change.**

## 1. What AC-1 uniquely proves — corrected at step 2 (T-05-1)

**The step-1 claim that one acceptance criterion is the entire guard on `WHERE (status <>
'cancelled')` was false, and the test-engineer measured it.** The predicate already carries two
committed guards in `tests/integration/exclusion-constraints.test.ts`: a **definitional** one —
`EXPECTED_CONSTRAINT_DEFS` pins `pg_get_constraintdef` by string equality for `no_bay_overlap`
*and* `no_technician_overlap`, predicate included, so every drop-one and drop-both variant dies
there with no behavioural inference — and a **behavioural** one, case AC-4, already the before/after
pair and already titled *"the predicate is live and not decorative"*. §1 misnamed the mutant and
pointed step 3 at a target that is already dead twice over.

What AC-1 uniquely adds is narrower and better:

- **The technician side, behaviourally.** Slice 00's AC-4 keeps `techB` deliberately free so the bay
  is the only conflict. Nothing yet frees a slot through the technician predicate.
- **The predicate is live *through the allocator*** — the one that matters. Slice 00 inserts a
  hand-chosen pair; AC-1 proves candidate allocation **re-derives** one over a cancelled row. §6.5
  records that the constraint's predicate and `freeResources`'s overlap predicate live in two files
  with nothing forcing them to agree, and QS-8 holds that seam under quiescence. AC-1 is a second,
  cheaper hold on it — and that mutant is in **TypeScript, where Stryker reaches it**, the opposite
  of the unreachable `.sql` mutant §1 claimed.

**D4 clause 2 keeps MAJOR on a rewritten reason** (finding accepted, narrower remedy). It was
justified by AC-1 being the sole guard on the predicate, which is false. It is justified instead by
AC-1 being the sole guard on the allocator re-deriving over a cancelled row — which is the slice.

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
statement, one round trip, zero-rows still unambiguous, and the second call changes **no column**. It
reads `status` inside the statement that writes it, which is atomic under the row's own lock and is
not a check-then-act window.

**The `CASE` is falsifiable, at step 2's insistence (T-05-6, OBJ-3).** `updated_at` is in neither
`AppointmentRow`'s ten columns nor the response body, and appears nowhere in `tests/` — so A-05-1's
"the response body is identical" half is satisfied *equally* by the `CASE` and by the plain `now()`
it rejects, and does no discriminating work. That is my own §4 argument against shipping
`src/domain/appointment.ts` — a construct no test can distinguish — turned on the `CASE`, and it
lands. So AC-3 is asserted in two places, not one: the **contract** test takes `200` and the
identical body; the **integration** test takes `to_jsonb(appointment)` equality across the replay,
which is a database invariant and therefore the test-engineer's (§5). `to_jsonb` rather than a read
of `updated_at`, because it asserts over every column instead of the ones an author picked.

**And the replay writes a new row version.** `xmin` advances, 739 → 740, measured by the implementer.
*Changes no column* is true; *writes nothing* is false, and a reader may take the second from the
first. A replay takes the row lock and leaves a dead tuple. `to_jsonb` equality is chosen because it
is the strongest claim that is **true**. (§6.4 prints `updated_at = now()`; that is the §6.4 edit at
step 7, and it carries this sentence.)

### D2 · Cancellation takes no advisory lock — [ADR-0023](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md)

F-02-9 says *every* write path takes both locks. Slice 05 is the first path that sentence is wrong
about, so the ADR narrows it to an **iff** — and step 2 narrowed the iff again (T-05-3): the unit is
the **transaction**, not the statement, because that is what M1–M3 measured and what the
one-directional-wait argument is a property of. The reasoning and the risk it closes are the ADR's;
they are not restated here. A cancelled row satisfies no constraint's `WHERE`, so there
is no adjudication for a lock to serialise — and the locks are keyed on bay and technician, which a
cancel request does not carry, so obeying the sentence literally would require the pre-read D1
removes.

Measured, not asserted: an inserter **waits** on an uncommitted cancel and then gets `201` (M1); the
cancel never waits on an exclusion check (M2, 2 ms with a conflicting insert in flight); 20 cancels
racing 20 inserts on one bay give **zero `40P01`** with no lock taken (M3). The wait is
one-directional and a one-directional wait cannot cycle. **Slice 06 is unaffected** — a reschedule
writes a `confirmed` row, which is in scope, so it locks **by the rule** and no longer by the
accident of which half you look at.

### D3 · AC-2 needs no change to slice 02's read path, and the scope says so

`readAppointment` already returns `found` for a cancelled row and says why in its own comment;
`AppointmentView.status` is already the two-member union; and `AppointmentBody.status` is already
`Type.Union([...])` rather than `Type.Literal('confirmed')` **specifically so this slice's test can
fail** (a single literal substitutes the constant). Slice 02 built AC-2 and could not exercise it,
because nothing could produce a cancelled row.

So AC-2 is a **contract assertion over existing behaviour, newly reachable** — zero production lines,
which the implementer verified against the code it owns.

**Two corrections at step 2 (T-05-5), both accepted.** First, *"still honestly red"* is withdrawn.
AC-2 fails at step 3 because the cancel route 404s at its arrange step — the same reason AC-1, AC-3
and AC-4 fail — so it has never failed for its own reason and at green it passes with no line written
for it. §2.4's letter is met by the other three; claiming a red that carries meaning it does not have
is worse than the limitation. AC-2 is what it is: **a regression guard over slice 02's read path,
newly reachable**, which kills the `Type.Literal` substitution mutant. The test-engineer chooses how
it arranges — through the API, or through a directly seeded cancelled row (ADR-0012) which makes it
green from the start — and states which in the file.

Second, and more important than this slice: the three `src/` claims above were addressed to a role
**forbidden to read `src/`**, so agreeing to them would have been deference wearing verification's
clothes. That is a defect in how step 1 addresses step 2, not in the design. The claims are hereby
**implementer-verifiable and the test-engineer is excused from them**; the implementer verified them
and its verification is the evidence.

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
4. **The `server.ts` predicate** (§4, AC-5) — added at step 2 and the only line in this slice that
   changes behaviour on an **already-merged** route. `gate: light` **stands**, since no MAJOR is left
   open, **with that one line named as an exception the gate must exercise**. Recorded rather than
   waived: a light gate that skips the only shared-path change is the wrong economy.

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
| `src/persistence/appointmentRepository.ts` | `cancelAppointmentById(db, id): Promise<AppointmentRow \| null>` — D1's statement, no transaction block (one statement is its own), **no `lockResources`**, docblock quoting the constraint predicate beside it — the *interim* mitigation for F-05-1, not the remedy (§6) |
| `src/application/cancelAppointment.ts` | `CancelOutcome = { kind: 'cancelled'; appointment: AppointmentView } \| { kind: 'not-found' }` |
| `src/http/routes/appointments.ts` | `POST /appointments/:id/cancellation` — same `AppointmentParams`, `response: { 200: AppointmentBody, ...PROBLEM_RESPONSES }`, one exhaustive `switch` |
| `src/http/server.ts` | **New at step 2 (OBJ-1, T-05-4).** The error handler's `400` arm widens from `validation !== undefined` to *that, or* a **named set of two codes**: `FST_ERR_CTP_EMPTY_JSON_BODY` and `FST_ERR_CTP_INVALID_JSON_BODY` |
| `src/main.ts` | One wiring line, and it is **excluded from mutation** (`stryker.config.mjs:86`). It is guarded by AC-1/AC-3/AC-4 rather than by nothing, but only because ADR-0013 spawns `dist/main.js`: an unwired route 404s and all three fail. Stated because the implementer named it rather than letting anyone claim otherwise |

`CancelOutcome` is **its own union**, not a reuse of `ReadOutcome`, although they are structurally
identical today. Sharing them would mean a member added for one route silently changing the other
route's exhaustiveness check — §5.2's rule, and the reason each use case declares its own.

**§8.6 gains no row — and step 2 found the row it already had was not being kept.** Measured by the
implementer on Fastify 5.12.1 against `server.ts` verbatim and **re-measured independently here**: a
`POST` with `content-type: application/json` and no payload returns **`500 /problems/internal`**, and
so does an unparseable body **on the existing booking route**. Both codes carry `statusCode: 400` and
neither sets `validation`, so both miss the validation arm and fall to the catch-all. §8.6's `500`
row justifies itself by *"a 4xx would tell a service advisor to correct something they did not send
and cannot see"* — here the client sent exactly that, can see it, and can correct it. Inverted.

**Ruled: both codes map to `400 /problems/malformed-request` (AC-5), in this slice.** Not the offered
narrower option of empty-body-only, because both are one predicate — deferring half of a one-line fix
is a complication, not a deferral — and because the invalid-JSON case is live on merged code today.
Named **by code**, not by `statusCode < 500`: `server.ts` already records that a broader disjunction
was deleted after mutation because no input reached its second arm, and Fastify's other 4xx codes
(415 on a media type, 404 on a route) have no §8.6 row. Widening a predicate until the taxonomy has
to grow to meet it is the tail wagging the dog. `404 /problems/appointment-not-found` and
`/problems/malformed-request` both already exist and are reused verbatim: no new status, no new
`type`, no new `Problem` member. A taxonomy that absorbs a new operation without growing is evidence
it was drawn correctly; one whose totality claim goes unasserted for three slices is evidence it was
not being checked.

**`src/domain/appointment.ts` is not created.** §5.2 predicts it here, holding "cancellation is
terminal and idempotent; only a confirmed appointment may be moved". Under D1 the first half is a
property of the statement's totality and the second half is slice 06's — so the module would ship
with no caller, which is dead code and free Stryker survivors. It moves to slice 06, where the
`409 /problems/appointment-not-confirmed` arm gives it one. §5.2 correction at step 7.

## 5. Scope ruling — one added concurrency file, respecified at step 2 (T-05-2)

ADR-0023 exempts a write path from F-02-9 on a claim, and ADR-0018 set the house standard that lock
claims are **measured**. The step-1 spec did not meet it. N cancels racing N bookings, asserting zero
`booking.deadlock`, zero `500`s, every request a verdict and one `confirmed` row — but **the bookings
still lock**, so ADR-0023's *rejected* Option A produces that identical observable. The assertion set
was invariant under the mutation the file exists to detect, and F-05-1 predicts the likelier
regression anyway: someone adds `lockResources` to the cancel for uniformity, and nothing goes red.
That is `no-spurious-refusal.test.ts`'s own documented standard turned on the new file — an absence
assertion needs a positive witness, and this one had none.

`tests/concurrency/cancellation-takes-no-lock.test.ts`, two cases:

1. **The discriminating one.** A second session holds the **bay** advisory lock in an open
   transaction, keyed exactly as ADR-0018 derives it (class constant, `hashtext`). Under that held
   lock: the **cancel must return `200` within a deadline** — M2 read 2 ms against
   blocks-indefinitely, so the deadline is a liveness assertion and not a timing one — and, as a
   **non-optional control**, a **booking for that bay must not complete** while it is held. Without
   the control a changed key derivation makes the cancel's `200` vacuous. **Plus a third step the
   objection did not ask for: release the lock, and the booking must then complete** — otherwise
   "blocked" is inferred from a timeout rather than witnessed.
2. **M3's liveness reading**, kept, with its limit stated *in the file*: it separates
   catastrophically-unsafe from safe and **not** Option A from D, so it is a measurement and not this
   file's evidence.

Recorded as a scope ruling under the standing delegation, **provisional until the gate**. Cost if
wrong: one test file the gate can delete.

## 6. Findings, assumptions, open questions

- **F-05-1 — now with a ruled remedy and a slice, not a docblock (OBJ-2).** Two write functions in
  one file, one locking and one not, and "correctly exempt" reads identically to "forgot the lock".
  The objection is right that a docblock is not a mitigation, and right that the QS-12 marker route is
  closed: markers are file-granular and `appointment-table-access` pins **exactly one** file, so
  splitting `appointmentRepository.ts` would break AC-5 of slice 00a. **Remedy: `lockResources`
  returns a branded `ResourceLock` that `insertAppointment` takes as a parameter** — type-only,
  erased, one minting cast, the ADR-0016 shape. "Forgot the lock" becomes a compile error; "correctly
  exempt" becomes a signature that does not ask for one. **Deferred to slice 06 under ADR-0019,
  because 06 makes it stronger, not merely later**: today the brand's only consumer is a call site
  already written, already locking and already tested, so it catches nothing that exists; slice 06
  adds `rescheduleAppointment`, a *newly written* locking write path, which is the moment the mistake
  is live rather than historical. Residue, stated by the objection and not hidden here: it does not
  prove the keys match the row. **arc42 §11 at step 7**, with the remedy and the slice attached.
- **A-05-1, amended** — AC-3 means *no column of the row changes* (integration, `to_jsonb` equality)
  *and the response body is identical* (contract). D1's `CASE` is now the only one of the two options
  that passes the first half, which is what step 2 said it needed to be. Provisional.
- **OQ-05-1 — closed by measurement, and the answer changed the contract.** See §4 and AC-5.
- **OQ-05-2, opened** — with the AC-5 mapping in place, `content-type: application/json` plus an
  empty body on a route that reads **no body** answers `400`. Defensible: the client declared a JSON
  document and sent none. Also unfriendly: it tells a correct client to fix something the endpoint
  never reads, and `postBooking` already sets that header reflexively. The alternative is a
  content-type parser mapping an empty body to `undefined`, which would also route the booking
  route's empty body through TypeBox — §8.6's declared owner for that row — instead of a special case
  in the handler. **Deferred to slice 10 under ADR-0019**: the cURL harness is the real client that
  emits the header, so the assertion becomes end-to-end and the parser lands with what motivates it.
  AC-5 pins `400` meanwhile, so slice 10 moving it is a decision with a diff attached rather than a
  hole.
- **A-05-2** — ADR-0023's measurements are three readings of one PostgreSQL version on this
  repository's own constraint definitions. The structural argument carries the decision; the
  measurements are what would have caught it being wrong.
