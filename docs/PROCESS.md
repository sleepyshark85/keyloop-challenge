# Process and logging coverage

A reader's view of how the machine actually runs, and — more importantly — **which parts of it
record themselves and which depend on the orchestrator's diligence.**

`docs/METHODOLOGY.md` owns the rules; this document owns the picture and the coverage map. Where
they disagree, the methodology wins and this file is stale.

---

## 1. The whole flow

```
   ┌── phase 0 ──┐  ┌── phase 1 ──┐  ┌── phase 2 ──┐  ┌── phase 3 ──┐
   │  FOUNDATION │─▶│ REQUIREMENTS│─▶│ ARCHITECTURE│─▶│   BACKLOG   │─┐
   │  ✓ complete │  │  ← current  │  │             │  │             │ │
   └─────────────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
                        GATE A           GATE B           GATE C      │
                     assumptions      design + stack    scope/order   │
                                                                      │
   ┌── phase 7 ──┐  ┌── phase 6 ──┐  ┌───── phase 5 ─────┐  ┌ phase 4 ┐
   │    VIDEO    │◀─│CONSOLIDATION│◀─│    SLICE LOOP     │◀─│  PILOT  │◀┘
   │             │  │             │  │  ×13 · §2 below   │  │ slice 00│
   └─────────────┘  └──────┬──────┘  └─────────┬─────────┘  └────┬────┘
                        GATE F              GATE E each        GATE D
                       final read           merge slice     is the machine
                                                              working?
```

Gates are the only points where the human decides. Everything between them is mechanical or
delegated. **Each phase from 1 onward is a branch and a pull request**, so a gate decision is an
approval with rationale attached to a merge rather than something the orchestrator reports.

Phase 4 is a pilot of *the process*, not the product — judged against criteria fixed in advance in
`docs/team-log/process-criteria.md`.

---

## 2. The slice loop

![The slice loop](diagrams/slice-loop.svg)

*Source: [`diagrams/slice-loop.html`](diagrams/slice-loop.html)*

Architecture governs rather than being discovered: step 1 precedes all downstream work. Step 2 is
the cheapest step in the loop — an objection there costs one round, where the same ambiguity found
at step 5 costs a full cycle plus a loopback.

When any role hits a mismatch it raises a **DCR**, the slice goes `blocked`, and the architect rules:

| Ruling | Effect |
|---|---|
| **(a)** clarification | design was right, wording ambiguous → resume from the raising step |
| **(b)** deferred improvement | work is **correct** under the agreed ADR → **merge anyway**, file as debt |
| **(c)** design defect | work would be incorrect or unshippable → **loop back to step 1**, supersede the ADR |
| **(d)** escalate | genuine trade-off → the human decides |

Ruling (c) is *refused by the log schema* unless the architect names the acceptance criterion or
`QS-*` that would fail. Without one the correct ruling is (b) — so a preference cannot masquerade as
a blocker. Max two loopbacks per slice; a third auto-escalates, because a slice needing three design
changes is a slicing problem rather than a design problem.

---

## 3. Who writes the record

Four layers, each compensating for gaps in the one below.

![What the record can be trusted for](diagrams/logging-trust.svg)

*Source: [`diagrams/logging-trust.html`](diagrams/logging-trust.html)*

---

## 4. Coverage map — what is logged, and how far it can be trusted

`Writer`: **H** harness hook · **T** tooling · **O** orchestrator.
`Corroborated`: whether an independent artifact could contradict a false record.

| Step | Event | Tier | Writer | Corroborated by | Residual risk |
|---|---|---|---|---|---|
| any agent finishes | `agent.finish` | derived | **H** | its own transcript | **none** — automatic |
| agent invoked | `agent.start` | reported | O | transcript first-timestamp | low — audit could check, doesn't yet |
| step 1→2, 2→3 … | `handoff` | reported | O | — | **omittable, unverifiable** |
| board column change | `board.move` | reported | O | — | **omittable, unverifiable** |
| slice opens / closes | `slice.ready` `slice.done` | reported | O | slice-file `status` | low |
| CI run | `check.run` | derived | **T** | — | **NOT EMITTED YET** |
| step 3 red proof | `check.run` (failing) | derived | **T** | — | **NOT EMITTED YET** — C1 cannot pass |
| commits | `git` on other events | reported | O | `git log` | low — audit reports unreferenced commits |
| step 5 findings | `review.finding` | reported | O | PR comments | low once PRs are live |
| finding answered | `review.response` | reported | O | PR thread | low once PRs are live |
| DCR raised | `dcr.raised` | reported | O | — | **omittable** |
| DCR ruled | `dcr.resolved` | reported | O | superseding ADR file | medium — ruling (c) needs `failing_criterion` (enforced) |
| loopback | `loopback` | reported | O | ADR supersession chain | medium |
| gate opened / decided | `gate.opened` `gate.decided` | reported | O | PR approval | low once PRs are live |
| ADR written | `adr.recorded` | reported | O | `docs/adr/*.md` | low — audit could check, doesn't yet |
| arc42 corrected | `arc42.updated` | reported | O | `git diff docs/arc42/` | low — audit could check, doesn't yet |
| escalation | `escalation` | reported | O | — | **omittable** |

### What this map says honestly

**One event type is fully trustworthy.** `agent.finish` — because a hook writes it outside my
context, with numbers computed from the agent's own transcript. That covers the single most
important question: *did this agent actually run, for how long, at what cost.*

**Two are not emitted at all.** `check.run` needs a test command and a CI step, neither of which
exists until slice 00. Criterion **C1** — *test-first genuinely held* — is therefore unpassable
today, which is a predicted failure recorded in advance rather than an excuse.

**Four are omittable and unverifiable**: `handoff`, `board.move`, `dcr.raised`, `escalation`. If I
never write them, nothing notices. These are the honest residual trust surface. The mitigation is
partly structural — a DCR that changes a design leaves a superseding ADR behind, and a loopback
without one would look odd at the gate — but it is not enforcement.

**Three could be corroborated and are not yet.** `adr.recorded`, `arc42.updated` and `agent.start`
all have ground truth sitting on disk (`docs/adr/`, `git diff`, transcript timestamps) that
`log:audit` does not currently read. That is cheap to close and worth doing before phase 5.

---

## 5. Commands

| | |
|---|---|
| `npm run board` | the four-panel view — board, waterfall, thread, metrics |
| `npm run log -- --slice 03` | the same data in the terminal |
| `npm run log:audit` | **reconcile the log against reality — run at every gate** |
| `npm run slice:check 03` | Definition of Ready / Done, with `UNVERIFIED` blocking Done |
| `npm run test:tools` | the path-guard regression suite |
| `npm run docs:build` | assemble `docs/system-design.md` from arc42 sections |

---

*The two mechanism diagrams are drawn with the `diagram-design` skill and committed as both `.html`
source and exported `.svg`, so they render for a reader with no plugin installed. §1's phase
pipeline stays ASCII on purpose: a linear eight-stage sequence is exactly the case where the skill's
own guidance says to prefer a table or plain text over an editorial diagram.*
