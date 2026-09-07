---
id: "0019"
title: Defer a control only to the slice that makes it cheaper or stronger
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§8.5", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 02 step 5, adjudicating reviewer findings R-02-2 and R-02-3 as
  CLAUDE.md §6 (b). The two deferrals are within the architect's authority; the CRITERION that
  permits them is what this record exists to make refusable.
  The matrix below was measured twice — by the architect while ruling T-02-9, and independently
  by the reviewer on `postgres:16-alpine` against this repository's own migrations, with matching
  results. It is recorded here because the reviewer's control script is a scratchpad file that
  does not survive the slice, and a measurement nobody can re-read is not evidence.

  RATIFIED `accepted` on 2026-09-06 by the architect under the human's standing delegation, the
  human being absent — replacing the `decided-by: human` this record was written expecting. It was
  offered `proposed` because a criterion invented while deferring is the shape a rationalisation
  takes. That question is now answered by evidence rather than by argument; see Consequences.
---

## Context and problem statement

A review finds a control the design argues for and the suite does not assert. The easy answer is
"later" — and later is where controls die. One of the two below was named, given a home in an
existing file, and never written.

**The missing cell.** Two advisory locks now stand in front of every insert, and the design admits
this weakens the case against check-then-act: inside a per-resource lock a reintroduced check would
be *correct*, not merely harmless. What bounds the damage — correctness is entirely the constraint's,
liveness entirely the lock's — rests on a four-cell matrix, three of whose cells are standing
tests:

| Locks | Constraints | Result | Asserted by |
|---|---|---|---|
| off | on | 1 row | `exclusion-constraint-adjudicates.test.ts`, phases 1 and 3 |
| off | off | 20 rows | the same file, phase 2 |
| on | on | 1 confirmed, 19 × `23P01` named | both `tests/concurrency/` files |
| **on** | **off** | **20 overlapping rows** | **nothing** |

**The surviving mutant.** The GET route's whole `response` map survives as an `ObjectLiteral "{}"`
mutant while the POST route's sibling is killed — and the design argues for a union of literals on
`status` precisely because cancellation will render `cancelled` at that URL.

Neither is a defect: no acceptance criterion, no quality scenario, no standing invariant would
fail. Both are deferred improvements, and that ruling obliges a named home.

## Considered options

- **A — build both in slice 02**, at step 5, after the review has reported.
- **B — defer both into slice 05 under a stated criterion**, booked as debt.
- **C — defer with no criterion**, as a backlog note.
- **D — no action**: this record's numbers and the compiler are the evidence.

## Decision

Chosen option: **B**, and the criterion is the decision rather than the destination: **a control is
deferred only to a slice that makes it cheaper or stronger, and a deferral that cannot name such a
slice is an omission, to be built now.**

Slice 05 makes the missing cell **cheaper**: it reopens that file anyway, to show that the
constraint's `WHERE status <> 'cancelled'` predicate frees a cancelled slot, and the mutant's
assertion **stronger** — `cancelled` becomes producible, so the test stops needing a cast no
production path can make.

## Consequences

**Good**

- The criterion bites in the direction that matters: it forbids deferring a control whose subject
  exists today. The DDL-drop control failed that test and was built here; a `pg_stat_statements`
  detector passes it, because the deployment surface it needs does not exist yet.
- **It has caught its own author.** A later slice routed work to slice 08, whose own file forbade
  it; the implementer cited this criterion and slice 08 was amended (`4d172cc`).

**Bad, or deferred**

- The missing cell's unique content — *the lock cannot replace the constraint* — is prose until
  slice 05. Dropping the constraint fails both concurrency tests today, with twenty confirmed
  instead of one: the regression is guarded, the reading is not.
- The deferred control must hand-write the advisory-lock statement, because an integration test may
  not import `src/`. It shows that locks *of that shape* prevent nothing; divergence from the
  production lock is residue, bounded by the concurrency tests that exercise the real one.
- Two debt-register rows until slice 05 is done.

## Pros and cons of the options

### A — build both in slice 02

- Good, because the evidence would land in the slice whose whole subject is that invariant, and
  evidence deferred out of the slice that motivated it has a poor record of returning.
- Bad, because the cell's consumer is not this gate. Two agent invocations and a database run at
  step 5 buy the reading five slices early.

### B — defer under a criterion

- Good, because it names *which* slice and *why*, so the deferral is checkable at slice 05's
  Definition of Ready rather than rediscovered at review.
- Bad, because a criterion invented while deferring is the shape a rationalisation takes. It is
  offered as `proposed` for exactly that reason.

### C — defer with no criterion

- Good, because it costs nothing to write.
- Bad, because it is indistinguishable from forgetting — which produced the missing cell.

### D — no action

- Good, because the matrix was measured twice, by two roles.
- Bad, because neither run repeats. A mechanism whose evidence does not run is one nobody checks —
  a finding this project has recorded six times.
