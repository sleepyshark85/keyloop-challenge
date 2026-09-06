# Slice 05 — design

Slice file: [`05-cancellation.md`](05-cancellation.md) — four acceptance criteria, QS-7,
implementing [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md).
New: [**ADR-0023**](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md).
arc42 scope: **§5.2, §6.4, §6.6, §8.6, §10, §11**.
**No data-model delta, no migration, no `.dependency-cruiser.js` change.**

## 1. What AC-1 uniquely proves — corrected twice: step 2 (T-05-1), step 5 (R-05-4)

**Both earlier justifications were false of this repository; the third is measured.** Step 1 claimed
AC-1 was the sole guard on `WHERE (status <> 'cancelled')`; the test-engineer showed the predicate
already carries a **definitional** guard — `EXPECTED_CONSTRAINT_DEFS` pins `pg_get_constraintdef` by
string equality for both constraints, predicate included — and a **behavioural** one, slice 00's AC-4. Step 2 re-based the claim onto *"AC-1 is the sole guard on the
allocator re-deriving over a cancelled row."* The reviewer measured that too: `candidateResources`
reads `service_bay`, `technician` and `technician_qualification` and **never reads `appointment`**, so
there is no re-derivation to guard. `freeResources` serves `GET /availability` — slice 08's endpoint,
which AC-1 never calls — so this was not a claim arriving early. It was a claim about the wrong code
path, and it would still be wrong in the finished system.

**What AC-1 proves, on two grounds, both measured:**

- **The technician constraint releases.** The fixture is 1×1, so `no_technician_overlap`'s predicate
  must release too. Slice 00's AC-4 puts its neighbour on `techB` *"so the bay is the only conflict"*,
  and the technician constraint appears everywhere else only as a rejection or a string-equality pin —
  so **nothing else asserts the technician side releases, behaviourally.**
- **The `201` is attributable to the predicate and to nothing else.** *Because* the candidate list
  carries no availability filter, it is identical before and after the cancel. The only thing that
  moved between the `409` and the `201` is the constraint's verdict on ADR-0004's retry attempts.

Together: **AC-1 is a proof at the edge that D1's `UPDATE` removes the row from *both* constraints'
scope.** That is this slice's production code. **D4 clause 2 keeps MAJOR** — the finding was right all
three times, and the reason is now one a reader can check rather than one this repository falsifies.
Slice 08 deletes the second ground and owes it a re-derivation (§7).

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
`AppointmentRow`'s ten columns nor the response body, so A-05-1's *"the response body is identical"*
half is satisfied **equally** by the `CASE` and by the plain `now()` it rejects — my own argument
against shipping a construct no test can distinguish, turned on the `CASE`, and it lands. So AC-3 is
asserted twice: the **contract** test takes the `200` and the identical body; the **integration** test
takes `to_jsonb(appointment)` equality across the replay — a database invariant, therefore the
test-engineer's (§5), and stronger than reading `updated_at` because it asserts over every column
rather than the ones an author picked.

**And the replay writes a new row version** — `xmin` advances 739 → 740, measured. *Changes no column*
is true; *writes nothing* is false, and a reader may take the second from the first. `to_jsonb`
equality is chosen because it is the strongest claim that is **true**. (§6.4 prints
`updated_at = now()`; that edit at step 7 carries this sentence.)

### D2 · Cancellation takes no advisory lock — [ADR-0023](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md)

F-02-9 says *every* write path takes both locks. Slice 05 is the first path that sentence is wrong
about, so the ADR narrows it to an **iff** — and step 2 narrowed the iff again (T-05-3): the unit is
the **transaction**, not the statement, which is what M1–M3 measured and what the one-directional-wait
argument is a property of. The reasoning is the ADR's. A cancelled row
satisfies no constraint's `WHERE`, so there is no adjudication for a lock to serialise — and the locks
are keyed on bay and technician, which a cancel request does not carry, so obeying the sentence
literally would require the pre-read D1 removes.

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
verified by the implementer against the code it owns.

**Two corrections at step 2 (T-05-5), both accepted.** First, *"still honestly red"* is withdrawn.
AC-2 fails at step 3 for the same reason AC-1, AC-3 and AC-4 do — the cancel route 404s at its arrange
step — so it never failed for its own reason, and at green it passes with no line written for it.
§2.4's letter is met by the other three; claiming a red that carries meaning it does not have is worse
than the limitation. AC-2 is **a regression guard over slice 02's read path, newly reachable**, which
kills the `Type.Literal` substitution mutant. How it arranges is the test-engineer's, stated in the
file.

Second, and more important than this slice: those three `src/` claims were addressed to a role
**forbidden to read `src/`**, so agreeing would have been deference wearing verification's clothes — a
defect in how step 1 addresses step 2, not in the design. They are **implementer-verifiable**, the
test-engineer is excused, and the implementer's verification is the evidence.

### D4 · What revokes `gate: light`

The slice is designed to stay light: one route, one use case, one repository function, no migration,
no schema change, no change to the booking path. It is revoked by any open MAJOR/BLOCKING, and four
risks were named in advance. **Three did not happen; the fourth did, in a form none of them named.**

1. **ADR-0023 being wrong** — a cancel measured taking or waiting on an exclusion check. It was not.
2. **AC-1 passing vacuously** — §3. It does not; the reviewer verified all four traps closed. What
   happened instead is that AC-1's **stated reason** was false twice (§1) — the same severity by a
   different route, because AC-1 is the slice.
3. **A surviving mutant on the cancel `switch`.** None: no survivor sits between lines 230 and 275.
4. **The `server.ts` predicate** (§4, AC-5) — the only line in this slice changing behaviour on an
   **already-merged** route, named as an exception the gate must exercise.

**`gate: light` is revoked**, by three open MAJORs before this review and four more from it. Recorded
rather than argued down: a light gate skipping the only shared-path change was already the wrong
economy, and seven open MAJORs is not a light slice.

## 3. The trap in AC-1, named so step 3 does not discover it

*"The same booking now succeeds"* is easy to satisfy dishonestly. Four ways, and the design closes
all four in the fixture and the test's structure rather than by asking for care:

- **The fixture is exactly one bay and one technician.** With `|B| = |T| = 1` there is one
  permutation, so slice 04's seeded shuffle cannot vary the candidate and `BOOKING_SEED` must **not**
  be pinned — pinning it is ADR-0021's Order-A, making the test depend on a knob instead of on the
  fixture. The trap dissolves by shape.
- **One request value, posted twice**, so *"the same booking"* is enforced by the program rather than
  by a reader comparing two literals.
- **The refusal must be the right refusal**: `409`, `type=/problems/no-capacity`, `resource` present.
  A `400` read as "refused" would pass the sequence with no capacity conflict in it at all.
- **The `201` must name A's bay and technician**, and a different `id`. With this fixture it must, so
  asserting it makes a future widening of the fixture fail loudly rather than weaken the test quietly.

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
implementer on Fastify 5.12.1 and **re-measured independently here**: a `POST` carrying
`content-type: application/json` with no payload returns **`500 /problems/internal`**, and so does an
unparseable body **on the existing booking route**. Both codes carry `statusCode: 400` and set no
`validation`, so both miss the validation arm and fall to the catch-all — which inverts that row's own
justification, *"a 4xx would tell a service advisor to correct something they did not send and cannot
see"*. Here they sent it, can see it, and can correct it.

**Ruled: both codes map to `400 /problems/malformed-request` (AC-5), in this slice.** Not the narrower
empty-body-only option: both are one predicate, and the invalid-JSON case is live on merged code
today. Named **by code**, not by `statusCode < 500` — `server.ts` already records a broader
disjunction deleted after mutation for reaching no second input, and a 415 is not a malformed request.
Both `type`s already exist and are reused verbatim: no new status, no new `Problem` member.

**Step 5 overturns half of that reason and none of the ruling.** This paragraph also argued that 415
and an unrouted `404` *have no §8.6 row*, and that widening a predicate until the taxonomy grows to
meet it is the tail wagging the dog. The second still holds. The first read an **absence** as a
**decision**: ADR-0024 gives the unrouted `404` a row from the opposite direction — the taxonomy grows
because a response escaped it, not because a predicate reached for it.

**`src/domain/appointment.ts` is not created.** Under D1 the first half of §5.2's prediction is a
property of the statement's totality and the second half is slice 06's, so the module would ship with
no caller — dead code and free survivors. It moves to slice 06. §5.2 correction at step 7.

## 5. Scope ruling — one added concurrency file, respecified at step 2 (T-05-2)

ADR-0023 exempts a write path from F-02-9 on a claim, and ADR-0018 set the house standard that lock
claims are **measured**. The step-1 spec did not meet it: N cancels racing N bookings with zero
`booking.deadlock`, zero `500`s and one `confirmed` row is an observable **the rejected Option A also
produces**, because the bookings still lock. The assertion set was invariant under the mutation the
file exists to detect — `no-spurious-refusal.test.ts`'s own standard turned on the new file, an
absence assertion with no positive witness.

`tests/concurrency/cancellation-takes-no-lock.test.ts`, two cases:

1. **The discriminating one.** A second session holds the **bay** advisory lock, keyed exactly as
   ADR-0018 derives it. Under it the cancel must return `200` within a deadline (a liveness
   assertion, not a timing one: M2 read 2 ms against blocks-indefinitely); a booking for that bay
   must **not** complete, without which a changed key derivation makes the `200` vacuous; and —
   beyond what the objection asked — releasing the lock must let that booking through, so "blocked"
   is witnessed rather than inferred from a timeout.
2. **M3's liveness reading**, kept, with its limit stated *in the file*: it separates
   catastrophically-unsafe from safe and **not** Option A from D.

A scope ruling under the standing delegation, **provisional until the gate**. Cost if wrong: one test
file the gate can delete.

## 6. Findings, assumptions, open questions

- **F-05-1 — remedy ruled, and it now lives in its destination.** Two write functions in one file, one
  locking and one not, and *"correctly exempt"* reads identically to *"forgot the lock"*. A docblock is
  not a mitigation and the QS-12 marker route is closed (markers are file-granular and
  `appointment-table-access` pins exactly one file). **Remedy: a branded `ResourceLock` that
  `insertAppointment` takes as a parameter — deferred to slice 06 under ADR-0019 and written into
  `06-reschedule-atomic-move.md`**, where the specification, the reason and the residue now live.
  arc42 §11 at step 7.
- **A-05-1, amended** — AC-3 means *no column of the row changes* (integration, `to_jsonb` equality)
  *and the response body is identical* (contract). D1's `CASE` is now the only one of the two options
  that passes the first half, which is what step 2 said it needed to be. Provisional.
- **OQ-05-1 — closed by measurement, and the answer changed the contract.** See §4 and AC-5.
- **OQ-05-2, opened and re-routed.** With AC-5 in place, `content-type: application/json` plus an
  empty body on a route that reads **no body** answers `400`: defensible, and unfriendly to a correct
  client. Deferred under ADR-0019 to slice 10 — **which has been a tombstone since 2026-09-04, two
  days before this design named it.** Corrected at step 5 to **slice 09**, where the harness went and
  where `postBooking` is the real client that emits the header; the parser remedy is specified there.
  AC-5 pins `400` meanwhile, so slice 09 moving it is a decision with a diff attached.
- **A-05-2** — ADR-0023's measurements are three readings of one PostgreSQL version on this
  repository's own constraint definitions. The structural argument carries the decision; the
  measurements are what would have caught it being wrong.

## 7. Step-5 rulings — R-05-1 to R-05-4 and the DCR

Ruled under the standing delegation, **provisional until the gate**. Specs are in the slice file,
deferrals in their destinations, the argument in [ADR-0024](../adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md).

- **R-02-2 — build now (a), not a fourth deferral.** ADR-0019's "cheaper" premise was true of the
  *file* and untrue of the *branch*: slice 05 never opened it. The criterion then applies to itself —
  a deferral that cannot name a cheaper or stronger slice is an omission, to be built now.
- **R-02-3 — build now, and the reviewer's residue is falsified.** It is killable by one unit case
  with **no production change**; the measurement and the spec are in the slice file. And **ADR-0019
  misidentified its own mutant** — §2.6 argued from the `status` union, whose three mutants at line
  111 are killed; what survives is the whole `response` map, which the producibility of `cancelled`
  never reached. The criterion is 1-for-2 on outcomes and **0-for-2 on premises**: the finding.
- **R-05-2 — routed (a); the criterion is right and nothing enforces it.** F-05-1 → slice 06; AC-1's
  second ground → slice 08; OQ-05-2 → **slice 09, not the slice-10 tombstone**. All three now sit in
  the destination file. The enforcing check is specified to the orchestrator (`tools/` is not mine);
  the half that would have caught *this* case is that an ADR may never be the only place a
  destination is recorded.
- **R-05-3 and the DCR — (d), ADR-0024, at slice 06.** The split is ruled and §8.6 corrected **now**:
  arc42 overstating what the system does is a defect today. The handler waits for a reason that is not
  cost — it **breaks the media-type half of AC-4's vacuity guard**, and degrading a test committed red
  in this slice, at a step with no test-engineer round left, is the worse trade.
- **R-05-4 — accepted, §1 rewritten.** Severity stands; its reason was wrong twice and is now measured.
- **The Stryker exhaustiveness disables are mine to decide** — the Definition-of-Done ground that
  gives me `stryker.config.mjs`'s `mutate` list — **and the implementer's to write**, being comments in
  `src/`. Ruled in narrowly at slice 06: the `const unhandled: never` arms only, where a fourth route
  makes it one pass instead of two. **Not** the schema-options or description mutants — inert for
  reasons that change when Fastify's config or slice 09's OpenAPI assertion does, so disabling them
  hides a mutant at the moment it becomes killable.
