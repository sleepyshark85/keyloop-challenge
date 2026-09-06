---
id: "0025"
title: Existence is the read's, legality is the statement's — a move is adjudicated by one guarded UPDATE
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.3", "§6.6", "§8.6", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 06 step 1 under the human's standing delegation, and
  PROVISIONAL until slice 06's gate.

  It amends slice 06's AC-5, which required the `404` to be "decided by the `UPDATE` affecting
  zero rows rather than by a preceding read". That criterion is unimplementable, and the reason
  is structural rather than a matter of effort: the `UPDATE` cannot be constructed at all
  without first reading the row it moves. The amendment was found by attempting to write the
  statement, not by preferring a different shape.

  It also retires a §5.2 prediction that slice 05 had already declined once. Declining twice
  without a record is how a prediction becomes a dangling pointer, which is R-05-2.
---

## Context and problem statement

§6.3 guards the move with `WHERE id = $1 AND status = 'confirmed'` and resolves the resulting
ambiguity *"by a follow-up read"*; §6.6 records, in its own words, that this **reproduces** the
ambiguity slice 05's unguarded cancel had removed. Slice 06 makes the cost concrete: **AC-4 wants
`409 /problems/appointment-not-confirmed` for a cancelled row and AC-5 wants `404` for an unknown
id, and one zero-row result cannot decide both.**

The fact that settles it was not in the design. **A move cannot be constructed without reading its
own row**: the new interval is derived from the appointment's service-type duration and validated
against its dealership's hours (ADR-0001, ADR-0003), both named by the row rather than by the
request. A read precedes every move, unavoidably. The question is what it may decide.

## Considered options

- **Option A — guarded `UPDATE`, plus a follow-up read on zero rows.** §6.3 as designed.
  - Good, because one statement still does the writing
  - Bad, because the read exists only to disambiguate a result the design chose to make
    ambiguous, and must then be argued against §2.1 rather than simply not existing
- **Option B — unguarded `UPDATE`, the status guard moved into the `SET`**, slice 05's `CASE`
  generalised: zero rows means unknown, a returned `cancelled` row means not-confirmed.
  - Good, because one statement's output decides both, unambiguously
  - Bad, because it makes a **refusal write** — a rejected move takes the row lock and leaves a
    dead tuple, so a client can bloat a cancelled row by retrying
  - Bad, because a guard spread over five `CASE`s is discoverable only by reading all of them
- **Option C — the read decides existence; the guarded `UPDATE` decides legality.** **Chosen.**
- **Option D — Option C, and the read short-circuits on `cancelled` too.**
  - Good, because a doomed request skips the opening-hours derivation
  - Bad, because status then has two adjudicators, and the cheaper one is a read

## Decision

Chosen option: **C.**

1. **The read decides `404`.** Sound because absence is permanent: appointment ids are minted by
   `deps.newId()` and are never client-supplied, so no concurrent transaction can create the id
   the client named.
2. **The guarded `UPDATE` decides `409`.** Zero rows is unambiguous *because* existence is already
   established and `cancelled` is terminal (ADR-0003).
3. **There is no follow-up read.** §6.3's sentence and §6.6's closing paragraph are corrected.
4. **The status guard lives only in the statement** (not D). Ruled consequence: a cancelled
   appointment moved out of hours answers `400`, not `409` — the domain rule needs no database
   verdict and is evaluated first (§6.6's ordering).
5. **This is not check-then-act, and the reason is not that the read comes first.** §2.1 forbids
   a read whose answer *authorises* a write that its own staleness could invalidate. This read
   touches one row by primary key and never another appointment's interval — nothing on the move
   path can answer *"is that bay free"*. Its `absent` answer cannot go stale; its `confirmed`
   answer **can**, and is re-adjudicated atomically by the statement's own `status = 'confirmed'`.
   A read is check-then-act when the write trusts it. This write does not.
6. **Therefore `src/domain/appointment.ts` is not built, and §5.2's prediction is retired.**
   Transition legality is a database verdict on ADR-0016's ground — the refusal is *constructed
   from* the statement's zero rows rather than from an application belief about status — so a
   module holding one allowlist whose only consumer is a SQL predicate is a relocation of a
   literal. Slice 05 measured what that ships as: dead code with free survivors.

## Consequences

**Good**

- Every outcome has exactly one decider, and §6.6's two `0 rows` rows stop being a pair
- `PATCH` gains no statement, no `CASE` and no round trip beyond the one it already owed

**Bad, or deferred**

- **The scope predicate and the move guard point in opposite directions.** The constraints carry a
  denylist (`status <> 'cancelled'`), which `0003_appointment.sql` argues is the safe direction;
  the move carries an allowlist (`= 'confirmed'`). A third status — `no_show`, `in_progress` —
  would be automatically *occupying* and automatically *unmovable*, the second half being the
  direction the migration calls unsafe. §11 carries it, and it is what would earn the module back.
- AC-5's original wording is amended; the gate reviews the amendment rather than the outcome
- A move refused for status still pays for the derivation it will not use
