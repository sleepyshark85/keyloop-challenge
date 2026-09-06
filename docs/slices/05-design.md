# Slice 05 — design, as merged

Slice file: [`05-cancellation.md`](05-cancellation.md) — five acceptance criteria, QS-7, implementing
[ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md). New:
[**ADR-0023**](../adr/0023-a-write-that-leaves-the-constraints-scope-takes-no-lock.md) and
[**ADR-0024**](../adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md).
arc42 as built: **§5.2, §6.1, §6.4, §6.6, §8.6, §10, §11**, reconciled at step 7. No data-model delta,
no migration, no `.dependency-cruiser.js` change.

**An as-built record, not the working document.** A fact now living in arc42 or an ADR is cited here,
not repeated; §5 says what moved and what was let go.

## 1. What AC-1 proves — the claim this slice got wrong twice

Step 1 claimed AC-1 was the sole guard on the constraints' `WHERE (status <> 'cancelled')` predicate.
Measured false: slice 00 pins the predicate **definitionally**
(`EXPECTED_CONSTRAINT_DEFS`, `pg_get_constraintdef` by string equality) and **behaviourally on the bay
side** (its AC-4). Step 2 re-based the claim onto *"AC-1 is the sole guard on the allocator re-deriving
over a cancelled row"*. False too — `candidateResources` reads reference data and never
reads `appointment` — and the test-engineer then sharpened it past both of us:
`freeResources` serves `GET /availability`, **slice 08's endpoint, which AC-1 never calls**. So the
second premise was not a claim arriving early but a claim about the wrong code path, and would
still be wrong in the finished system.

**Two premises, both false, and neither measured before it was written down.** The third is measured
and now lives in arc42 §6.4 and §10 QS-7. Slice 08 deletes its second ground and owes a
re-derivation, written into `08-availability-query.md`.

## 2. What was decided

| # | Decision, and what was measured | Where it lives now |
|---|---|---|
| **D1** | Idempotency is one unconditional `UPDATE`, with a `CASE` holding `updated_at` on a replay. No guard predicate and no pre-read, so §2.1's shape rule is never invoked rather than argued around, and zero rows means exactly one thing. Measured: the guarded alternative returns zero for a replay too; a plain `now()` would make a replay a client-reachable write; the `CASE` changes no column, though `xmin` advances 739 → 740 | arc42 §6.4, §6.6; §11 R-10 |
| **D2** | Cancellation takes **no** advisory lock. Measured, not asserted: an inserter waits on an uncommitted cancel and then gets `201` (M1); the cancel never waits on an exclusion check (M2 — 2 ms with a conflicting insert in flight); twenty cancels racing twenty inserts on one bay give zero `40P01` with no lock taken (M3) | ADR-0023; §11 F-02-9, narrowed to an *iff* scoped to the transaction |
| **D3** | AC-2 needs no change to slice 02's read path — zero production lines. **Half withdrawn at step 2:** it is not "still honestly red", because it fails at step 3 for the same reason the other three do, the route 404ing at its arrange step. It is a regression guard newly reachable, and says so | slice file, AC-2 |
| **D4** | `gate: light` is revoked. Four risks were named in advance; three did not happen, and the fourth did in a form none named — AC-1's *reason* was false, twice, the same severity by a different route because AC-1 is the slice | slice frontmatter |

**Two corrections worth more than this slice.** D3's three claims were addressed to a role
**forbidden to read `src/`**, so agreement would have been deference wearing verification's clothes —
a defect in how step 1 addresses step 2. And AC-3's `CASE` was made falsifiable
only because step 2 insisted: `updated_at` sits in neither `AppointmentRow` nor the response body, so
*"the response body is identical"* is satisfied **equally** by the `CASE` and by the `now()` it
rejects. AC-3 is therefore asserted twice, its integration half by `to_jsonb` equality — stronger than reading
`updated_at`, asserting over every column rather than the ones an author picked.

## 3. Rulings

All under the standing delegation, **provisional until the gate**.

| Ruling | Outcome |
|---|---|
| **OQ-05-1 → AC-5** | Both Fastify content-type-parser codes map to `400 /problems/malformed-request`, named **by code** and not by `statusCode < 500`: a 415 is not a malformed request. §8.6's `400` row now records it |
| **Scope — one added concurrency file** | `cancellation-takes-no-lock.test.ts`, respecified at step 2 so it can fail for the reason it exists: the step-1 spec's assertion set was invariant under the mutation it exists to detect. Cost if wrong, one file the gate can delete |
| **R-02-2, R-02-3** | Build now, not a fourth deferral. ADR-0019's premises measured 0-for-2 — §11 D-05-3 |
| **R-05-2** | (a). Every deferral now sits in its destination file: F-05-1 → 06, AC-1's second ground → 08, OQ-05-2 → 09, A-05-6 → 07 (the last at step 7, same rule) |
| **R-05-3 and the DCR** | (d) → ADR-0024. The split is ruled and §8.6 corrected **now**, because arc42 overstating what the system does is a defect today. The handler waits for slice 06 not on cost but because registering it **breaks the media-type half of AC-4's vacuity guard**, and degrading a test committed red in this slice, with no test-engineer round left, is the worse trade |
| **R-05-4** | Accepted; §1 above is the rewrite |
| **Stryker exhaustiveness disables** | Ruled in narrowly at slice 06: the `const unhandled: never` arms only. **Not** the schema-options or description mutants — inert for reasons that change when Fastify's config or slice 09's OpenAPI assertion does, so disabling them hides a mutant as it becomes killable |
| **Phase 4's simultaneity — ruled at step 7** | Phases 1–3 report `maxInFlight` and deliberately do not assert it: their verdicts hold for sequential inserts, so an assertion there buys flake rather than evidence. Phase 4 asserts it, where `1` **is** the claim. Its one-unit discriminating margin is adequate and recorded — §11 R-7i |

## 4. Findings and assumptions

- **F-05-1** — two write functions in one file, one locking and one correctly not, where *"correctly
  exempt"* reads identically to *"forgot the lock"*. A docblock is a marker, not a mitigation. Remedy in
  `06-reschedule-atomic-move.md`; standing risk in §11.
- **A-05-1**, amended at step 2 — AC-3 means *no column of the row changes* **and** *the response body
  is identical*. Discharged by two assertions in two suites.
- **OQ-05-2** — an empty body on a bodyless route answers `400`: defensible, and unfriendly to a
  correct client. Deferred to **slice 09** after first being routed to slice 10, **a tombstone since
  two days before this design named it**. Precisely the failure R-05-2 is about, committed by the
  role that ruled on it.
- **A-05-2** — ADR-0023's measurements are three readings of one PostgreSQL version. The structural
  argument carries the decision; the measurements are what would have caught it being wrong.
- **D-05-1** — ADR-0024's second exit ships knowingly, and `src/http/server.ts:36` still asserts
  §8.6's totality *"is kept"* there. Standing risk in §11.
- **D-05-3** — ADR-0019's deferral criterion, 0-for-2 on its own premises at its first destination.
  Standing risk in §11.

## 5. What step 7 moved, and what it let go

The ratchet takes this file from 2,996 words to 1,200, so the pass was a **relocation**. Moved: §1's
corrected claim to §6.4 and QS-7; D1's statement, the `CASE` and `xmin` to §6.4; the interface table
to §5.2's as-built; AC-5's predicate to §8.6's `400` row; `main.ts`'s unmutated wiring line to §11
R-12; and to §11, F-05-1, ADR-0024's shipped second exit with the stale `server.ts:36` docblock,
OQ-05-2, ADR-0019's score and phase 4's control margin.

**Let go, deliberately:** the four ways AC-1 could have passed dishonestly, the fixture closing all
four *by shape* and the test stating each at its own assertion; the step-2 objection transcript, on
the PR under §9's convention; and the prose arguing D1 and D2 at length, now ADR-0023's and §6.4's.
Nothing here is the only record of anything.
