---
id: "0020"
title: Test the attempt cap inside the conflict arm, so a capped refusal still carries a database verdict
status: proposed
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.2", "§11"]

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

ADR-0016 makes `BookOutcome`'s `no-capacity.resource` a `ContendedResource`, mintable only by
`pgError.classify` from `err.constraint`: a capacity refusal must be *constructed from* a database
verdict. Slice 02 shipped one refusal exit — the candidate list that emptied — and it holds a value
the classification that emptied it minted.

ADR-0009's cap of 16 adds a second exit, reached with candidates remaining. **Is a minted value in
scope there, and if not, what does the capped refusal say?**

## Considered options

Four trees, `typescript` 6.0.3 under this repository's `compilerOptions` (`strict`,
`noUncheckedIndexedAccess`, `noImplicitReturns`).

| | Option | `tsc` | Verdict |
|---|---|---|---|
| **A** | The cap as the **loop's bound** — `while (attempts < cap)` — refusing after the loop with `resource: 'bay'` | **exit 2**, `TS2322: Type '"bay"' is not assignable to type 'ContendedResource'` | Rejected. ADR-0016 firing exactly as designed |
| **B** | A, carrying the last minted resource forward in a `ContendedResource \| null` local | **exit 2**, `TS2322: Type 'ContendedResource \| null' is not assignable` | Rejected. The shape *forces open* a null branch no correct run reaches, and the cheapest way to discharge it is C |
| **C** | B plus `'bay' as ContendedResource` to discharge the null branch | **exit 0** | Rejected. The escape hatch, landing in `src/application` — outside the one file `contended-resource-cast` permits a cast in, so the marker catches it. That it is B's path of least resistance is why B is rejected too |
| **D** | A second `BookOutcome` variant for the capped exit, carrying no resource | — | Rejected. AC-4 fixes the client rendering at `409 /problems/no-capacity`, so this splits one §8.6 row in two and drops `resource` from one of the two refusals for no reason a client can act on |
| **E** | **Test the cap inside the `conflict` arm**, immediately after pruning | **exit 0**, no cast | **Chosen** |

## Decision

Chosen option: **E — the cap is tested inside the `conflict` arm of the classification switch, beside
the exhaustion check, and never as the loop's bound.**

```ts
if (next === null)          return { kind: 'no-capacity', resource: o.resource, attempts, exit: 'exhausted' };
if (attempts >= attemptCap) return { kind: 'no-capacity', resource: o.resource, attempts, exit: 'capped' };
```

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

**Good.** The most-argued sentence of ADR-0016 — *you cannot refuse a booking for capacity reasons
without holding a value PostgreSQL produced* — survives the cap unqualified, and slice 04 adds no
taxonomy row, no ADR-0016 exception and no cast. The guard is `tsc`, at the exact line, and
`contended-resource-cast` stands behind it: two mechanisms in series.

**Bad, or deferred.** It is a **placement** rule, and nothing states it structurally: `tsc` only objects
once someone moves the cap *and* tries to refuse from outside the arm, which is the whole failure and
also the whole detection. §11 carries that. `exit` is a field slice 09 will duplicate as
`booking_conflicts_total{outcome}`; it stays because the metric does not exist yet and an outside-in test
may read only the response, the database and stdout.
