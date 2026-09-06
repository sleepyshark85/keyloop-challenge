# Report · slice 06 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 06 step 2 test-engineer review
- Returned: 2026-09-06T12:54:53.956Z
- Duration: 318s

---

I have read `06-design.md`, `06-reschedule-atomic-move.md`, ADR-0025, ADR-0026, ADR-0024, and the two contract/acceptance test files these touch (`tests/contract/error-taxonomy.test.ts`, `tests/acceptance/cancel-appointment.test.ts`) — all test-engineer territory, no `src/`. Verdicts follow, item by item.

## 1. AC-5's amendment (ADR-0025) — AGREE, and yes, falsifiably

The structural claim is sound: computing the new interval needs the row's service-type duration and its dealership's hours (ADR-0001/0003), so a read precedes every move unavoidably. That's not a preference for one option over another — it's a fact about what the statement can be built from.

But the row-level audit trigger the design already specifies for AC-2 (`FOR EACH ROW`) **cannot** distinguish "UPDATE issued, zero rows matched" from "UPDATE never issued" — a `FOR EACH ROW` trigger simply doesn't fire when zero rows match, either way. So as scoped, nothing in the design actually falsifies Option A (guarded UPDATE + follow-up read) against Option C (read decides, no UPDATE at all) for the 404 path.

I will add a **statement-level companion trigger** (`AFTER UPDATE FOR EACH STATEMENT`, which fires once per statement execution *regardless of rows matched*) alongside AC-2's row-level one. For an unknown-id request I assert: response is `404`, **and zero statement-level firings occurred** — proving the `UPDATE` was never issued, not merely that it matched nothing. Against the rejected Option A this test would correctly fail (the statement-level trigger would fire once, even for zero rows), so it's a genuine discriminator between the two designs, not a restatement of one. This is an addition beyond the design's named test list (§5); I'll land it in `tests/integration/` since it asserts a database invariant.

## 2. A-06-2 (`deps.newId()` as sole minting site) — AGREE it's real, DISAGREE it should route through me or block here

I don't think AC-5 is unsound without it closed, and I can't write a test for it regardless: there is no client-facing surface in this API that lets a caller supply an arbitrary id at creation, so I have no way to construct the race the gap describes from the HTTP boundary I own. Even if some other minting path existed, the read-decides/no-follow-up-read design wouldn't produce an *incorrect* response from it — at worst a request racing an as-yet-uncommitted create gets a 404 that was true at the moment it was checked, which is ordinary eventual-consistency behavior, not a correctness violation of §2.1's kind. This is a code-structure invariant (single call site) that belongs behind a dependency-cruiser rule or grep-based CI check, owned by the architect/reviewer — not a runtime test. I recommend it be tracked there rather than treated as something step 2 should hold up on.

## 3. AC-2's audit trigger — AGREE, no hole found, one addition

Walked the failure modes: savepoint-scoped retries roll back their trigger-inserted audit rows along with the failed statement (same subtransaction), so a multi-candidate loop's failed attempts leave no trace; `statement_timestamp()` correctly varies per statement even within one transaction where `xmin`/`transaction_timestamp()` would not, which is the right reason to reject those alternatives. I don't see a hole in the mechanism itself.

What I will **add**: this slice introduces the second attempt loop (re-allocation to a different bay/technician). AC-2's existing test list doesn't obviously exercise the case where the loop tries and discards a candidate before landing the winning one — that's exactly the shape most likely to leak a stray audit row if a candidate's failed attempt isn't cleanly isolated. I'll add a re-allocation scenario to `reschedule-is-one-statement.test.ts` (contended original slot, forcing a second candidate) asserting still-exactly-one audit row.

## 4. AC-1's self-overlap mechanism and control — AGREE

The MVCC reasoning is correct and matches documented Postgres behavior: `check_exclusion_constraint` skips the just-inserted entry by `ctid` and the superseded tuple's `xmax` (this transaction's own xid) makes it dead-to-self, so no self-conflict is raised. The `BEFORE UPDATE` trigger contrast is apt — such a trigger reads the heap before the swap and would see the live prior version, correct only with an explicit `id <> NEW.id`. The refusal control (same appointment onto an interval held by a *different* confirmed appointment, `23P01`/`no_bay_overlap`) is the right honesty check.

One addition: the design's control names only the bay-side constraint. I'll build **both** a bay-conflict and a technician-conflict negative control, mirroring slice 00's dual assertions — a build that only got the bay side right (e.g., a partial fix) would otherwise pass AC-1 while still capable of self-conflicting on the technician side.

## 5. ADR-0024 warning 1 re-derivation — AGREE with the remedy

Worked through why `setNotFoundHandler` breaks the media-type half specifically: `cancel-appointment.test.ts`'s AC-4 case hits a *matched* route with an unknown id, so ordinary operation is unaffected — the assertion's real job is as a **mutation-testing discriminator**: if a mutant removed the cancel route's registration, today's fallback (Fastify's bare `application/json` 404) is caught by the content-type check; once `setNotFoundHandler` also answers `problem+json`, that same mutant would produce `problem+json` too and the content-type assertion would stop catching it — but the `type` assertion (`appointment-not-found` vs. `route-not-found`) still would. So the remedy is right: keep the `type` assertion as the surviving discriminator, add the negative control (`POST /appointments/{id}/nonsense` → `/problems/route-not-found`) to prove the route genuinely exists and `setNotFoundHandler` is wired, and land both `error-taxonomy.test.ts` rows (`appointment-not-confirmed`, `route-not-found`) in the same red commit as this re-derivation — one taxonomy change, not two, per the design.

## 6. Two recorded consequences — noted, will assert both

I'll include an explicit case for cancelled-plus-out-of-hours → `400 /problems/outside-opening-hours`, **not** `409` (mirroring the existing `not.toBe(409)` pattern already in `error-taxonomy.test.ts`'s AC-7), so the ordering is pinned rather than assumed. AC-4 here asserts status and `type` only — no `booking_conflicts_total` assertion; that's slice 09's, correctly.

---

### Found, not asked about

- **ADR-0026's transaction-identity hole** ("the type doesn't prove the write runs in the same transaction as the lock") is real but I can't write a failing test for it: the exclusion constraint provides a correctness backstop regardless of whether the advisory lock and the write share a transaction, so a black-box test can't observe the hole without also observing a correctness failure that the constraint already prevents. This is a defense-in-depth situation — worth flagging to slice 07's design (its racing-moves harness is the closest thing to coverage here), not something I can close.
- **`bad-reference` (23503 → reference-data-invalid)** is designed to be unreachable in normal operation; constructing a test that reaches it would require deliberately deleting reference data mid-flight (a genuine race), which reads as slice 07 material, not this slice's.
- **OQ-06-1** (same-instant move, ruled out of scope) — I won't add a test either enforcing or forbidding the no-op behavior, consistent with the ruling; flagging only that its absence from my red commit is deliberate, not an oversight, in case the gate looks for it.

```json
{
  "role": "test-engineer",
  "outcome": "agreed",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-6", "QS-11"],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [],
  "dcr": null,
  "message": "Agreed on all six items, with three additions I'll build at step 3: a statement-level trigger to make AC-5's 'no follow-up read, no UPDATE issued' claim actually falsifiable (the row-level trigger alone can't distinguish it), a technician-side negative control alongside AC-1's bay-side one, and a re-allocation scenario for AC-2's audit trigger given this slice's second attempt loop. A-06-2 and ADR-0026's transaction-identity hole are real gaps I can't close with a black-box test and are routing recommendations, not objections."
}
```

Relevant files (all read, none in `src/`):
- `/home/agentadmin/sources/keyloop-challenge/docs/slices/06-design.md`
- `/home/agentadmin/sources/keyloop-challenge/docs/slices/06-reschedule-atomic-move.md`
- `/home/agentadmin/sources/keyloop-challenge/docs/adr/0025-existence-is-the-reads-legality-is-the-statements.md`
- `/home/agentadmin/sources/keyloop-challenge/docs/adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md`
- `/home/agentadmin/sources/keyloop-challenge/docs/adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md`
- `/home/agentadmin/sources/keyloop-challenge/tests/contract/error-taxonomy.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/cancel-appointment.test.ts`
