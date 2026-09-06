# Prompt · slice 04 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 design, step 1
- Sent: 2026-09-06T04:46:18.964Z

---

Slice 04, **step 1 — DESIGN**. You are the architect, on the new branch `slice/04-candidate-allocation-and-retry` at `1f92d7a`. Slice 02 is merged and `done`; `slice:check 04 --ready` is green.

Read `docs/slices/04-candidate-allocation-and-retry.md` — **5 acceptance criteria**, claiming **QS-3**, implementing **ADR-0004** and **ADR-0009**.

## What slice 02 left you, and one hazard you named yourself

Slice 02 shipped the **minimal** loop: attempt, classify, prune *that candidate value*, retry; the constraint reported at refusal is the list that emptied. Explicitly out of scope and now yours: **ADR-0009's seeded shuffle and the cap of 16.**

**You flagged the hazard rather than pre-empting it, and this is the slice that pays it.** From your T-02-9 ruling:

> the 16-attempt cap adds a **second** refusal exit, reached with both lists non-empty and therefore with **no emptied list to name**. At that exit the resource has to be *chosen*, and a chosen `ContendedResource` is exactly what ADR-0016 forbids — so slice 04 must either carry a minted value forward or accept that its capped refusal is a different outcome from an exhausted one.

That is the design question of this slice. It is a measurement to make, not a position to argue: ADR-0016's brand is minted only by `pgError.classify`, and slice 02 measured that a cast is what the marker forbids. Decide it on evidence.

Also inherited: **F-02-9** — every write path to `appointment` takes ADR-0018's two advisory locks in the same order, bay then technician. The retry loop is inside those locks per attempt; a shuffle that changes which bay is attempted must not change lock ordering, because the disjoint lock classes are what make the order total by construction.

## Two arc42 corrections, batched here rather than sent separately

Both were found at slice 02's step 7 and are outside that slice's declaration, so they were routed to you rather than taken:

1. **§8.3 is stale.** It says ADR-0015 is *"Accepted, and not yet written; §11.1 carries it as agreed and unbuilt."* It shipped in slice 02 (AC-17–19). Correcting it also frees ~120 words from a section over budget.
2. **§11 reuses the id `R-02-2`.** Under *The cost of ADR-0018's locks* it labels the weakened-ADR-0016 argument `R-02-2`, but `R-02-2` is the reviewer's finding *"the lock-drop control is not in the suite"*, which ADR-0019 adjudicates. Two different things, one id — a reader following ADR-0019's citation lands on the wrong row.

Do these in a **separate commit** from the design; they are not slice 04's work.

## The concision rule is now enforced, and it applies to you here

`npm run docs:budget:check` runs in CI and `test:tools`. **Nothing may grow past `max(budget, its current size)`, and a new file must meet its budget outright** — so a new design or ADR starts under its budget rather than being condensed later. Your own role definition now carries the rule under `## Writing anything down`; it reached you from METHODOLOGY §4 via the generator rather than from this prompt, which is the point of it.

A slice design's budget is **3,000 while in flight** and drops to 1,200 at `done`. Slice 02's went to 13,566 and had to be cut back by 12,366 — please do not repeat that. If the design genuinely needs more, say so with the enumeration.

## Constraints

`docs/slices/04-design.md`, `docs/adr/`, and arc42 within `["§6.2", "§5.2"]` for slice work — the two corrections above are outside it and go in their own commit, which is fine because they are not this slice's. **Not yours:** `docs/slices/04-candidate-allocation-and-retry.md` (mine), `tests/`, `src/`, `tools/`, `docs/team-log/`.

Your authority is the delegated one: nothing escalates to the human between steps 1 and 5, you rule scope, acceptance criteria and quality goals mid-slice, and every such ruling is listed at the gate. The human is away and I hold the gate under a mechanical bar.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget:check`, `npm run docs:adr-check`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the design, your decision on the capped-refusal outcome with the measurement behind it, any ADR needed, and anything you ruled that would have gone to the human under the old rule.
