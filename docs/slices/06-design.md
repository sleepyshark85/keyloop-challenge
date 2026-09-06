# Slice 06 — as-built record

Slice file: [`06-reschedule-atomic-move.md`](06-reschedule-atomic-move.md).
Merged with [**ADR-0025**](../adr/0025-existence-is-the-reads-legality-is-the-statements.md),
[**ADR-0026**](../adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md),
[**ADR-0027**](../adr/0027-a-move-attempts-the-pair-it-already-holds-before-it-shuffles.md),
[**ADR-0029**](../adr/0029-a-deadlock-names-the-write-path-a-conflict-does-not.md) accepted and
[**ADR-0028**](../adr/0028-the-lock-carries-the-transaction-it-was-taken-on.md) `proposed`.

**The design is now in arc42** — §5.2, §6.3, §6.6, §8.2, §8.6, §10, §11, reconciled at step 7. This
file keeps only what has no other home: the measurements, the rulings that shaped the build, and the
questions left open. Everything it argued is either in an ADR or in the section it moved to.

## What shipped

`PATCH /appointments/{id}` `{ startsAt }`, one guarded `UPDATE` inside ADR-0018's two advisory locks,
re-allocating across ADR-0004's candidates when the incumbent pair conflicts. No data-model delta, no
migration, no `.dependency-cruiser.js` change. Plus `setNotFoundHandler` and two taxonomy rows
(ADR-0024), landed in the same red and green commits so `PROBLEM_TYPES` went 7 → 9 once.

Two obligations named for this slice were re-ruled at step 1: **racing moves deferred to slice 07**
(`A-06-3`, beside QS-4 and QS-5 — the reason for keeping them here was equally true of those two and
did not distinguish its own case), and **`src/domain/appointment.ts` retired**, not deferred
(ADR-0025 decision 6). One item was added and was larger than both: a move needing a different bay or
technician re-runs candidate selection, because without it `PATCH` refuses while capacity exists —
the one behaviour this system is about (QS-3).

## Measurements with no other home

**The exclusion mechanism, read off `check_exclusion_constraint` rather than re-measured** (`A-06-1`).
An `UPDATE` writes a new heap tuple, stamps the old one's `xmax` with this transaction's xid, and the
constraint check runs after the new index entry exists: it skips that entry by `ctid` and tests every
other candidate for liveness, so the superseded version is *deleted by me* rather than a live
conflict. The load-bearing half is that this is a property of the **enforcement mechanism**: a
`BEFORE UPDATE` trigger computing the same overlap reads the heap, sees the prior version, and is
correct only if someone remembered `AND o.id <> NEW.id`. §8.2 consequence 4 carries it; AC-1's two
constraint-name controls are what would catch it being wrong.

**`problem.ts` is immune to mutation testing, not cushioned** (`I-06-1`, the round's one objection,
and a measurement). Stryker run against it with and without the two new rows: **12 mutants both
times, 9 killed, 75.00 either way.** Cause, verifiable from the committed
`reports/mutation/mutation.json`: `@stryker-mutator/instrumenter`'s `syntax-helpers.js` lists
`TSAsExpression` among `tsTypeAnnotationNodeTypes`, so `[…] as const` is classed as a type node and
its whole subtree is skipped — the array and all seven string literals. Extending the set-equality
assertion to nine members stayed mandatory but is a **compiler-and-assertion** fact, not a kill.
Booked as **F-06-2**, §11.

**The Stryker disables over-applied by a factor of eleven** (`R-05-9`). `// Stryker restore all` on a
block's last line is a trailing comment the instrumenter never reads, so **93 mutants were suppressed
where 8 were ruled**. Replaced with four `disable next-line all` directives at L234/268/318/419, two
each: **ignored fell 93 → 8**, exactly the four `never` arms. The wrong 91.3 prediction was the
symptom; the tooling was the fault (`O-45`). §11 R-12 carries it as that risk's second instance.

**Mutation, after remediation:** repository 100.00, booking 96.80, reschedule 92.50 (from 70.00, with
exactly the 9 unkillable survivors the reviewer's classification predicted), server 90.91, routes
76.13, problem 75.00; aggregate 89.33, repo-wide 93.77. **Every changed file clears §10's 0.75
per file** (`I-06-5`). Eight structurally unkillable mutants remain on the `default: {` line above
each `throw`, and the suppression was **deliberately not widened** to reach them — raising a passing
score by suppressing more is the failure R-05-9 exists to prevent.

## The rulings that shaped the build

- **AC-5 amended** (ADR-0025). The decisive fact was found by trying to write the statement: a move
  cannot be constructed without reading its own row, the interval being derived from the row's
  service type and validated against its dealership's hours. The amendment is *stricter* — it
  forbids the follow-up read §6.3 mandated — and `T-06-1` showed that as first written the falsifier
  could not run: an `AFTER … FOR EACH ROW` trigger does not fire on a zero-row `UPDATE`. The
  statement-level companion (§2.3's instrument) is what makes it executable.
- **AC-1's worked example corrected** (`T-06-6`): `PATCH` carries `startsAt` only, so the original's
  duration change could never be issued. §10's QS-6 corrected with it.
- **AC-1's bay-and-technician clause added** (`I-06-2`, ADR-0027). Under a shuffle-from-first
  candidate order AC-1 *could not fail*: the self-overlap semantics are only exercised when the new
  version lands in the same bay with the same technician. The omission was the architect's.
- **Two controls, not one** (`T-06-2`): one per constraint, each raising `23P01` and asserted on the
  constraint **name** — under ADR-0004's retry a move onto a bay held by another confirmed
  appointment succeeds elsewhere, so a control expecting a `409` would pass for the wrong reason.
- **AC-2's window opens after the fixture's arrange** (`R-06-1`, ruled (a) at step 4) — never by
  filtering `op`, which lets cancel-then-book pass.
- **AC-4's metric half is slice 09's**; `booking_conflicts_total` does not exist yet.
- **`OQ-06-1` ruled out of scope**: a move to the same instant is a request, not a replay of one, so
  it is a `200` that rewrites the row. Recorded because the gate may disagree.

Rejected instruments, independently confirmed: `pg_stat_user_tables` (table-wide and stats-lagged)
and `xmin` (per transaction, cannot count to two).

## Debt booked, and what is still open

Six items, each defined here and carried in arc42 §11:

| ref | What it is |
|---|---|
| **D-06-1** | The move guards on an allowlist where the constraints carry a denylist (ADR-0025) |
| **D-06-2** | A `ResourceLock` cannot be forgotten and *can* be forged — R-06-D, ruled at step 7 |
| **D-06-3** | AC-2's audit instrument can fail falsely and cannot pass falsely (`T-06-7`) |
| **D-06-4** | A `rescheduleAppointment.ts` docblock cites I-02-6 for a principle ADR-0029 holds |
| **F-06-1** | Two attempt loops, one design — extraction to slice 09 |
| **F-06-2** | `problem.ts` has no margin, and its taxonomy is invisible to the mutation score |

Still open elsewhere:

- **`A-06-2`** — nothing asserts `deps.newId()` is the only id-minting site, which ADR-0025 rests on.
  Declined here (the mechanism exists, the hazard does not) and deferred to slice 09, which emits the
  OpenAPI document and can assert over ∀operations.
- **`T-06-5` / ADR-0028** — the type does not prove the write runs in the lock's transaction. The
  test-engineer's contribution was a **negative result**: no black-box test can observe it, because
  the constraint backstops correctness either way. Deferred to slice 09 with F-06-1. ADR-0026 is not
  superseded.
- **`A-06-4`, `A-06-5`, `A-06-6`** — process findings routed to the retro, not ruled here.
