---
id: "0020"
title: Test the attempt cap inside the conflict arm, so a capped refusal still carries a database verdict
status: proposed
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.2", "§11"]

# Amended at slice 04 step 2 under I-04-2, which reopened the option set and corrected the framing.
# `contested: true` because the record is the only home for six trees' worth of `tsc` evidence and
# for a trade-off that runs in BOTH directions — the type guarantee E buys and the structural
# liveness bound E gives up. The 700-word version is the one whose option table has lost a row, and
# a rejected option is the evidence that the decision was a choice.
contested: true

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: architect
ai-input: >
  RULED BY THE ARCHITECT at slice 04 step 1, under the delegated mid-slice authority.
  PROVISIONAL until slice 04's gate.

  It answers a hazard the architect flagged at slice 02 rather than pre-empted, recorded in
  `bookAppointment.ts` at the refusal exit: ADR-0009's cap is a SECOND refusal exit, reached
  with both candidate lists non-empty and therefore with no emptied list to name, and a CHOSEN
  `ContendedResource` is what ADR-0016 forbids.

  Decided on measurement, not on position. Four trees were compiled under this repository's own
  `tsc --strict` before the record was written, and the outcome inverted the framing: the hazard
  is a property of WHERE THE RETURN STATEMENT GOES, not of what the capped refusal means. The
  obvious shape — the cap as the loop's bound — is the one that fails, and the fix costs nothing.
---

## Context and problem statement

ADR-0016 makes `no-capacity.resource` a `ContendedResource`, mintable only by `pgError.classify`: a
capacity refusal must be *constructed from* a database verdict. Slice 02's one refusal exit — the
candidate list that emptied — holds a value the classification that emptied it minted. ADR-0009's cap
adds a second exit, reached with candidates remaining. **Is a minted value in scope there, and if
not, what does the capped refusal say?**

## Considered options

Five trees, `typescript` 6.0.3 under this repository's `compilerOptions`.

| | Option | `tsc` | Verdict |
|---|---|---|---|
| **A** | The cap as the **loop's bound** — `while (attempts < cap)` — refusing after the loop with `resource: 'bay'` | **exit 2**, `TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` | Rejected. ADR-0016 firing exactly as designed |
| **B** | A, carrying the last minted resource forward in a `ContendedResource \| null` local | **exit 2**, `TS2322: Type 'ContendedResource \| null' is not assignable` | Rejected. The shape *forces open* a null branch no correct run reaches, and the cheapest way to discharge it is C |
| **C** | B plus `'bay' as ContendedResource` to discharge the null branch | **exit 0** | Rejected. The escape hatch, landing in `src/application` — outside the one file `contended-resource-cast` permits a cast in, so the marker catches it. That it is B's path of least resistance is why B is rejected too |
| **D** | A second `BookOutcome` variant for the capped exit, carrying no resource | — | Rejected. AC-4 fixes the client rendering at `409 /problems/no-capacity`, so this splits one §8.6 row in two and drops `resource` from one of the two refusals for no reason a client can act on |
| **E** | **Test the cap inside the `conflict` arm**, immediately after pruning | **exit 0**, no cast | **Chosen** |
| **F** | E **plus** a bounded `for` header with a `throw` at its tail | **exit 0**, no cast | **Chosen with E.** Raised at step 2 (I-04-2), and it exposes an assumption in A–E: the table read as though bound and placement were *alternatives*, because it assumed the tail had to return a `BookOutcome`. It only has to be **unreachable**, and a `throw` discharges `noImplicitReturns` without minting anything |

## Decision

Chosen option: **E — the cap is tested inside the `conflict` arm of the classification switch, beside
the exhaustion check, and never as the loop's bound.**

```ts
if (next === null)          return { kind: 'no-capacity', resource: o.resource, attempts, exit: 'exhausted' };
if (attempts >= attemptCap) return { kind: 'no-capacity', resource: o.resource, attempts, exit: 'capped' };
```

**The header carries Bound-2's bound, not the cap.** I-04-2 offered `attempts <= cap`; that states
one number twice, and two encodings of one number drift. `bays.length + technicians.length` is a
*structural* liveness bound doing a different job from the *policy* cap, and it leaves the tail
unreachable because the arm's exhaustion check fires by `|B| + |T| − 1`.

**The hazard dissolves rather than being conceded.** The loop `continue`s on `conflict` and returns on
every other classification and on success, so the cap exit is reachable **only from a classification** —
a minted `ContendedResource` is in scope at every refusal exit by construction, and B's nullable carrier
never has to exist. ADR-0016's claim needs no widening and no exception.

**What the two exits do differ in is recorded rather than erased.** `exhausted` names the list that
emptied; `capped` names the resource PostgreSQL refused on the last attempt. Both are verdicts; only the
first is also a statement about a list. So `no-capacity` gains `exit: 'exhausted' | 'capped'`, one
`booking.refused` log line carries it, and the HTTP rendering of the two is identical. Exhaustion wins a
tie: if the same attempt both empties a list and reaches the cap, nothing was left untried and the
stronger statement is true.

## Consequences

**Good.** ADR-0016's most-argued sentence — *you cannot refuse a booking for capacity reasons without
holding a value PostgreSQL produced* — survives the cap unqualified, and slice 04 adds no taxonomy
row, no exception and no cast. The guard is `tsc` at the exact line, with `contended-resource-cast`
behind it: two mechanisms in series.

**Bad, or deferred.** It is a **placement** rule, and nothing states it structurally: `tsc` only objects
once someone moves the cap *and* tries to refuse from outside the arm. **And the guarantee is
one-directional, which the step-1 record did not say.** Moving the cap out of the arm is loud; adding
a retried `PgOutcome` variant — a second `continue` — leaves the loop **unbounded** with no `tsc`
error, no test and a hang. Option A made that unrepresentable and E alone gives it up, which is why F
is taken with E: the tail's `throw` converts that hang into a loud fault. An outside-in test cannot
distinguish a capped refusal minted inside the arm from one cast outside it, because AC-4 requires
both to render identically. §11 carries all of it. `exit` is a field slice 09 will duplicate as `booking_conflicts_total{outcome}`; it stays because the
metric does not exist yet.
