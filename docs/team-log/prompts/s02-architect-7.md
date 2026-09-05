# Prompt · slice 02 · architect · invocation 7

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: QS-12 clarifying clause in arc42 §10.2
- Sent: 2026-09-05T17:18:19.315Z

---

A human ruling propagating into arc42. You are the architect, on branch `slice/02-book-and-read-an-appointment` at `6fd6d4f`. No other agent is running.

**E-02-2 is ruled.** The human decided on 2026-09-06 that **QS-12 reads by concept, not by spelling**: the clause *"any use of `Intl.DateTimeFormat` with a `timeZone`, or of a dealership's `time_zone`"* is **illustrative** of what wall-clock and IANA-zone reasoning looks like, not an exhaustive literal.

Your split is accepted as specified in `docs/slices/02-design.md`:

- **`wall-clock-reasoning`** — deriving a wall clock or calendar field from an instant by any route; permitted in `src/domain/openingHours.ts` alone; `getUTC*` deliberately excluded as zone-free by construction.
- **`zone-transport`** — the identifiers `time_zone` / `ianaZone`; permitted in a short named list, asserted by set equality.

The ruling rests on the reason you gave: **QS-12's response measure survives.** The transport files carry an opaque string they never interpret, so if ADR-0001's rule grows breaks or holidays, only `openingHours.ts` changes. Still *"one source file plus one migration"*.

## What I want from you

**Add a clarifying clause to QS-12 in `docs/arc42/10-quality-requirements.md` §10.2**, so the next reader does not re-derive this. It should make three things unambiguous:

1. the named forms are **illustrative of the concept**, not the definition;
2. the concept is *deriving a wall clock or calendar field from an instant* — which is what GC-1 and ADR-0001 are actually about;
3. **carrying an opaque zone string is not reasoning about a zone**, so the persistence layer naming the column does not breach it.

Say it as the scenario's own text, present tense, not as an account of a ruling — the ruling's reasoning is in the event log (`s-02-ruling-E-02-2`) and on the PR, and that is where §4 and the concision ruling put it.

**§10 is at 1,463 of a 1,500 budget — 37 words of headroom.** If the honest clause needs more, take it from QS-12's existing prose rather than from another scenario, and tell me what you cut. Do not compress a scenario's assertion to make room: §10's scenarios are the contract the concurrency and property tests assert against, and vaguer criteria have already cost this project two mid-slice human rulings.

## What I am not asking for

Do **not** implement the markers — `tests/architecture/` is the test-engineer's and it lands at step 3. Do not touch the slice-02 design; your specification there is accepted as written.

If, writing this, you conclude the split's boundary is wrong somewhere — a form that should be in `wall-clock-reasoning` and is not, or a file that should not be on the transport list — say so now rather than at step 5. The test-engineer implements from your spec, and this is the last cheap moment to change it.

## Constraints

`docs/arc42/10-quality-requirements.md` only. **Not yours:** `tests/`, `docs/slices/`, `docs/team-log/`, `src/`, other arc42 sections unless you tell me why first.

Verify with `npm run docs:budget`, `npm run docs:refs`, `npm run docs:build`, `npm run test:tools`. One commit, `docs(arc42): QS-12 names a concept, and says so`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the wording you chose, the word delta, and anything you cut to fit.
