# Slice 05 — design, as merged

Slice file: [`05-cancellation.md`](05-cancellation.md) — five acceptance criteria, QS-7, implementing
[ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md), raising
[**ADR-0024**](../adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md) and narrowing one
sentence of F-02-9. An appointment moves to `cancelled` and the slot it held becomes bookable. arc42
as built: **§5.2, §6.1, §6.4, §6.6, §8.6, §10, §11**. No data-model delta, no migration, no layering
change.

**An as-built record, not the working document**: a fact now living in arc42 is cited here, not
repeated.

## 1. What AC-1 proves — the claim this slice got wrong twice

Step 1 claimed AC-1 was the sole guard on the constraints' *not cancelled* predicate. Measured false:
slice 00 pins it **definitionally**, by string equality on `pg_get_constraintdef`, and
**behaviourally on the bay side** in its AC-4. Step 2 re-based it onto *"the sole guard on the
allocator re-deriving over a cancelled row"* — false too, `candidateResources` never reading
`appointment` — and the test-engineer sharpened it past us both: `freeResources` serves **slice 08's
endpoint, which AC-1 never calls**. Not a claim arriving early but one about the wrong code path,
still wrong in the finished system.

**Two premises, both false, neither measured before it was written down.** The third is measured and
lives in arc42 §6.4 and QS-7; slice 08 deletes its second ground and owes a re-derivation, written
there.

## 2. What was decided

| # | Decision, and what was measured | Where it lives now |
|---|---|---|
| **D1** | Idempotency is one unconditional `UPDATE` with a `CASE` holding `updated_at` on a replay — no guard predicate, no pre-read, so check-then-act is never invoked and zero rows means one thing. Measured: the guarded alternative returns zero for a replay too; a plain `now()` makes a replay a client-reachable write; the `CASE` changes no column, though `xmin` advances 739 → 740 | §6.4, §6.6; §11 |
| **D2** | Cancellation takes **no** advisory lock, F-02-9 being narrowed to an *iff* — §2.1. Measured, not asserted: an inserter waits on an uncommitted cancel and then gets `201` (M1); the cancel never waits on an exclusion check (M2 — 2 ms with a conflicting insert in flight); twenty cancels racing twenty inserts on one bay give zero `40P01` with no lock taken (M3) | §2.1; §6.4; §11 |
| **D3** | AC-2 needs no change to slice 02's read path — zero production lines. **Half withdrawn at step 2:** not *"still honestly red"*, since it fails at step 3 for the reason the other three do, the route 404ing at its arrange step. A newly reachable regression guard | slice file, AC-2 |
| **D4** | `gate: light` revoked: three of four named risks did not happen and the fourth arrived in a form none named — AC-1's *reason* false twice, the same severity by another route | slice frontmatter |

### 2.1 A transaction takes both advisory locks iff it writes into an exclusion constraint's scope

ADR-0018's consequences generalised its two advisory locks to *every* write path to `appointment`,
and slice 05 is the first it is wrong about. **ADR-0018 is not superseded**; one sentence is
narrowed:

> A **transaction** takes those two locks **iff any statement in it writes a row version *into* an
> exclusion constraint's scope** — iff a constraint can adjudicate something it writes.

Booking and rescheduling write `confirmed` rows, so slice 06 inherits ADR-0018 unchanged. **The unit
is the transaction, not the statement**: M1–M3 measure one `UPDATE` alone in its transaction, and the
wait licensing them is one-directional, a property of the transaction — so in the first draft an
exempt statement in a transaction that also waited on something else could close a cycle, reopening
ADR-0018's own deadlock rate. And ***into*, not out of**: a statement only removing a version from
scope makes others wait on it and never becomes a waiter.

Obeying F-02-9 literally was refused: the request carries only an id, so it costs a pre-read
reintroducing the read-before-write shape, and M2 and M3 show it buys nothing. Keys from `RETURNING`
are impossible — a lock taken after the write is not a lock. A third lock class on `appointment.id`
was refused because cancels of one row already serialise on that row's lock, cancellation is
commutative and idempotent, and a third class is a third position in an order ADR-0018 kept
unsortable.

**Two corrections worth more than this slice.** D3's three claims were put to a role **forbidden to
read `src/`**, so agreement would have been deference wearing verification's clothes — a defect in
how step 1 addresses step 2. And AC-3's `CASE` became falsifiable only because step 2 insisted:
`updated_at` is in neither `AppointmentRow` nor the response body, so *"the response body is
identical"* is satisfied **equally** by the `CASE` and the `now()` it rejects. AC-3 is asserted
twice, its integration half by `to_jsonb` equality — stronger than reading `updated_at`, asserted
over every column rather than ones an author picked.

## 3. Rulings

All under the standing delegation, **provisional until the gate**.

| Ruling | Outcome |
|---|---|
| **OQ-05-1 → AC-5** | Both Fastify content-type-parser codes map to `400 /problems/malformed-request`, named **by code** and not by `statusCode < 500`: a `415` is not malformed. §8.6's `400` row records it |
| **Scope — one concurrency file** | `cancellation-takes-no-lock.test.ts`, respecified at step 2 so it can fail for the reason it exists, the step-1 assertion set having been invariant under the mutation it detects |
| **R-02-2, R-02-3** | Build now, not a fourth deferral: ADR-0019's premises measured 0-for-2 (D-05-3) |
| **R-05-2** | (a). Every deferral sits in its destination file — F-05-1 → 06, AC-1's ground → 08, OQ-05-2 → 09, A-05-6 → 07 |
| **R-05-3 and the DCR** | (d) → ADR-0024. The split is ruled and §8.6 corrected **now**, arc42 overstating what the system does being a defect today. The handler waits for slice 06 because registering it **breaks the media-type half of AC-4's vacuity guard**, and degrading a test committed red here, no test-engineer round left, is the worse trade |
| **R-05-4** | Accepted; §1 is that rewrite |
| **The exhaustiveness disables** | Narrowly, at slice 06: the `const unhandled: never` arms only. **Not** the schema-option or description mutants, inert for reasons that change when Fastify's config or slice 09's OpenAPI assertion does — disabling those hides a mutant as it turns killable |
| **Phase 4's simultaneity, at step 7** | Phases 1–3 report `maxInFlight` and deliberately do not assert it, their verdicts holding for sequential inserts, so an assertion buys flake. Phase 4 asserts it, where `1` **is** the claim; its one-unit margin is in §11 |

## 4. Findings and assumptions

- **F-05-1** — two write functions in one file, one locking and one correctly not, where *"correctly
  exempt"* reads identically to *"forgot the lock"*, and a docblock is a marker, not a mitigation. The
  QS-12 route is closed: markers are **file-granular**, and splitting the repository to separate them
  breaks slice 00a's AC-5. Remedy in
  [`06-reschedule-atomic-move.md`](06-reschedule-atomic-move.md); standing risk in §11.
- **A-05-1**, amended at step 2 — AC-3 means *no column changes* **and** *the response body is
  identical*, discharged by two assertions in two suites.
- **OQ-05-2** — an empty body on a bodyless route answers `400`: defensible, unfriendly. Deferred to
  **slice 09** after first being routed to slice 10, **a tombstone two days before this design named
  it** — exactly the failure R-05-2 is about, by the role that ruled on it.
- **A-05-2** — M1–M3 are three readings of one PostgreSQL version. The structural argument carries
  §2.1; the measurements would have caught it wrong.
- **D-05-1** — ADR-0024's second exit ships knowingly, `src/http/server.ts:36` still asserting §8.6's
  totality *"is kept"* there. Standing risk in §11.
- **D-05-3** — ADR-0019's deferral criterion, 0-for-2 on its own premises at its first destination
  (§11).
