---
id: "0019"
title: Defer a control only to the slice that makes it cheaper or stronger
status: proposed
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§8.5", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  RULED BY THE ARCHITECT at slice 02 step 5, adjudicating reviewer findings R-02-2 and R-02-3 as
  CLAUDE.md §6 (b). The two deferrals are within the architect's authority; the CRITERION that
  permits them is what this record exists to make refusable, and it is the human's to rule.
  The matrix below was measured twice — by the architect while ruling T-02-9, and independently
  by the reviewer on `postgres:16-alpine` against this repository's own migrations, with matching
  results. It is recorded here because the reviewer's control script is a scratchpad file that
  does not survive the slice, and a measurement nobody can re-read is not evidence.
---

## Context and problem statement

Slice 02's review found two mechanisms this design argues for and the suite does not assert.

**R-02-2.** ADR-0018 puts two advisory locks in front of each insert, and design §4.5 admits that
this weakens §4: inside a per-resource lock a reintroduced check-then-act would be *correct*, not
merely harmless. The reading that bounds the damage — *correctness is entirely the constraint's,
liveness entirely the lock's* — rests on a four-cell matrix. Three cells are standing tests:

| Locks | Constraints | Result | Asserted by |
|---|---|---|---|
| off | on | 1 row | `exclusion-constraint-adjudicates.test.ts`, phases 1 and 3 |
| off | off | 20 rows | the same file, phase 2 |
| on | on | 1 confirmed, 19 × `23P01` named | both `tests/concurrency/` files |
| **on** | **off** | **20 overlapping rows** | **nothing** |

Design §4.5 named that cell's home in an existing file. It was never added, and nothing recorded
that it had not been.

**R-02-3.** The GET route's whole `response` map survives as an `ObjectLiteral "{}"` mutant while
the POST route's sibling is killed. §2.6 argues for a union of literals on `status` precisely
because slice 05 renders `cancelled` at that URL — and that is the path with no assertion.

Neither is a defect: no acceptance criterion, no `QS-*` and no §2 clause fails, so neither can be
(c). Both are (b), and (b) obliges a named home.

## Considered options

- **A — build both in slice 02**, at step 5, after the review has reported.
- **B — defer both into slice 05 under a stated criterion**, booked as debt.
- **C — defer with no criterion**, as a backlog note.
- **D — no action**: this record's numbers and the compiler are the evidence.

## Decision

Chosen option: **B**, and the criterion is the decision rather than the destination: **a control is
deferred only to a slice that makes it cheaper or stronger, and a deferral that cannot name such a
slice is an omission, to be built now.**

Slice 05 makes R-02-2's cell **cheaper** — it reopens that same file anyway, to show that the
constraint's `WHERE status <> 'cancelled'` predicate frees a cancelled slot. It makes R-02-3's
assertion **stronger** — `cancelled` becomes producible, so the test stops needing a cast no
production path can make.

## Consequences

**Good**

- The criterion bites in the direction that matters: it forbids deferring a control whose subject
  exists today. §4.4's DDL-drop control failed it and was built here; F-02-6's `pg_stat_statements`
  detector passes it, on slice 11's deployment surface.
- The measurement outlives the scratchpad it was taken in.

**Bad, or deferred**

- The missing cell's unique content — *the lock cannot replace the constraint* — is prose until
  slice 05. What bounds the exposure is that dropping the constraint fails both concurrency tests
  today, with twenty confirmed instead of one: the regression is guarded, the reading is not.
- The deferred control must hand-write ADR-0018's lock statement, because a `tests/integration/`
  file may not import `src/`. It shows that locks *of that shape* prevent nothing; a divergence from
  the production lock is residue, bounded by the concurrency tests that exercise the real one.
- Two rows in arc42 §11 until slice 05 reaches `done`.

## Pros and cons of the options

### A — build both in slice 02

- Good, because the evidence would land in the slice whose whole subject is §2.1, and evidence
  deferred out of the slice that motivated it has a poor record of returning.
- Bad, because the cell's consumer is not this gate. ADR-0018 is `proposed`, and a merge does not
  rule it — ADR-0011 has been `proposed` since slice 00. Two agent invocations and a database run
  at step 5 buy the reading five slices early.

### B — defer under a criterion

- Good, because it names *which* slice and *why*, so the deferral is checkable at slice 05's
  Definition of Ready rather than rediscovered at its review.
- Bad, because a criterion invented while deferring is the shape a rationalisation takes. It is
  offered as `proposed` for exactly that reason.

### C — defer with no criterion

- Good, because it costs nothing to write.
- Bad, because it is indistinguishable from forgetting — which is what produced R-02-2.

### D — no action

- Good, because the matrix was measured twice, by two roles, with matching numbers.
- Bad, because neither run repeats. A mechanism whose evidence does not run is one nobody is
  checking — a finding this project has recorded six times.
