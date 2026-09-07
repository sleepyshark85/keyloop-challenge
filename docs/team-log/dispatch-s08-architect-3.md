# s08-architect-3 — rule the open findings, including two that say your own remedies fall short

Slice 08 (availability query), step 5 remediation. **This is one round (§6). Rule; do not
re-open discussion.** Branch `slice/08-availability-query`, PR #17.

## Two findings say the remedies you specified do not reach

Both came back **measured, not argued**. Neither role adjusted anything to make its own work
look finished; both stopped at the contingency and reported. Rule the remedy, not the messenger.

**T-08-7 — the QS-8 generator fix kills the mutant ~3 times in 4.** The test-engineer built
your R-08-1 remedy verbatim (`status` on `ScheduleItemSpec`, 4:1 confirmed:cancelled,
`probeInsertCommitted` writing the column). Clean typecheck, passes on the green tree, and on
the first run it *did* kill the reviewer's third mutant (delete `.where('status','<>',CANCELLED)`
from `busyResources`) — failed at test 29, shrank to one cancelled item, named direction B
correctly. Then it ran the mutant **35 times: 8 survived**, at `numRuns=30`.

The per-item weight is not the fault — `fc.sample` measures 1033/5000 = 20.66% cancelled,
exactly what you asked for. The loss is observability, and it compounds three ways: a cancelled
item exposes the mutant only if it is `random`-kind (half the items), **and** lands inside the
query window (`randomStartOffsetMinutes` is ±240 against a much narrower window), **and** is the
sole occupant of its (bay, technician) pair there — a confirmed item over the same pair makes
buggy and correct queries agree. `boundary`-kind items, the other half, are pinned *outside* the
window by construction and can never expose it.

Note the flakiness is one-directional: the property still passes on correct code every time, so
CI does not become flaky. What is unreliable is the *claim* that QS-8 catches the status filter
going missing.

**I-08-6 — the R-08-5 remedy reaches 6 of 12.** The implementer hand-mutated each of the twelve
lines against its own new assertions before reporting (reverted; nothing left behind).
**Killed 6**: both title strings, both detail strings, the malformed-window options literal,
`serviceTypeId`'s pattern. **Survive 6**: `to`'s RFC3339 pattern, and `additionalProperties` plus
the response-schema-map literal on *both* schemas. The reason is structural: Fastify's
`removeAdditional: true` strips extras from `request.query` **regardless of the flag's value**,
and the handler always builds a fixed-shape literal object rather than passing anything through.
Unobservable through black-box HTTP as the route is written. Adjusted score moves ~25/47 → ~31/47
≈ 65.96 — **still under §10's 0.75.**

## Rule these, each with the outcome letter (§6 a/b/c/d)

Two above, then the ones still open at the gate:

- **F-08-1** — arc42 §6.5 has specified `candidateRepository.freeResources` since phase 2 and an
  architecture control rejects exactly that.
- **F-08-2** — QS-8 is false as written in §10.2 over the universe its own words give.
- **F-08-4** — the `busyResources` docblock wrong a second way. *(The implementer committed
  `0e9db30` against it — check whether that discharges it or only the first way.)*
- **A-08-3** — `status <> 'cancelled'` and `status = 'confirmed'` are extensionally equal over a
  two-value enum.
- **T-08-5** — AC-5 unpinned on the wire, half unassertable. *(`37cf8f6` and I-08-5 bear on this.)*
- Sweep the open MINORs (I-08-1..5, T-08-4, A-08-1, A-08-2, F-08-3, OQ-08-1) — one line each is
  fine; say which are disclosures needing no ruling.

**O-59 is not yours.** The human closed slice 09 to new deferrals and two refs were routed there
in the same hour. That goes to the gate.

## The one you cannot dodge

I-08-6 means §10 is not satisfied on `routes/availability.ts` and the specified remedy will not
get it there. **Say what does.** Available to you: accept a stated gap with the §11 debt entry
naming what is unobservable and why (the project has precedent — I-06-5, R-05-9); change the
source so the schemas are observable; exclude the file from `mutate` with the reason on the
record; or rule the slice cannot close on this. Name the option and the ground.

## Boundaries

- **You do not edit `tests/`** (§5). Specify; the test-engineer builds. Same for `src/` — that is
  the implementer's edit, your decision.
- **Do not mint an ADR for these.** The human's standing view: ADRs are for decisions at the
  architectural bar, and 17 are already scheduled for retirement into slice designs after this
  slice merges. Record rulings in `docs/slices/08-*.md` / `08-design.md`.
- **Step 7 as-built is NOT this dispatch.** The tree is not final. You will be dispatched for it.
- The test-engineer's change is **uncommitted** in the worktree
  (`tests/property/availability-agrees-with-constraint.db.test.ts`). Read it before ruling T-08-7;
  do not commit it.

## Post to PR #17 (§6, §9)

One comment, `**architect · step 5 — RULINGS**`. **~150 words, short AND self-contained**: open
with one italic line of framing (what this slice does, the one fact the comment turns on), and
inline a minimum gloss at each reference — a human opening the PR does not know what "Option D"
or "QS-8" is. Cut narration and restatement of others' work; state facts and stop. Keep span ids
and shas.

Return the structured report.
