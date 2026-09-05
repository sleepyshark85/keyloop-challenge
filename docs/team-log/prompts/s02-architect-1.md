# Prompt · slice 01 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 design, step 1
- Sent: 2026-09-05T07:04:59.070Z

---

Slice 02, **step 1 — DESIGN**. You are the architect, on `main` at `27ad342`. Slice 01 is `done`; `slice:check 02 --ready` is green.

Read `docs/slices/02-book-and-read-an-appointment.md` first — it changed under two human rulings today and is bigger than you last saw it.

## What this slice is

The booking path end to end, plus the whole error taxonomy, plus two ratified domain remedies. **19 acceptance criteria.** It is the flagship slice: §2.1 — double-booking prevented by the database, never by check-then-act — becomes real here, and QS-1/QS-2 are its concurrency scenarios.

- **AC-1–AC-6** the booking path and read-back
- **AC-7–AC-12** the error taxonomy (absorbed slice 03, Gate D)
- **AC-13–AC-16** ADR-0014, the epoch bound in `instant()` *and* in `withinOpeningHours` step 1
- **AC-17–AC-19** ADR-0015, an interval ending at local midnight

**ADR-0013, 0014 and 0015 are ACCEPTED and immutable.** 0014 and 0015 already name their remedies exactly, so do not re-derive them — design the slice that *applies* them. If you think either ratified decision is wrong, that is a DCR and a superseding ADR, not a revision.

The slice file states the fold's cost itself: it now carries three things, which is why it keeps the **full human gate**. Its own guidance is to **sequence** — booking path green first, taxonomy on top, the domain fixes independent of both. If your design concludes it genuinely needs two red commits, say so plainly: §7 allows exactly one, so that is a DCR at step 1, which is the cheapest possible moment for it.

## Also yours, batched here rather than as a separate dispatch

I fixed AB-01-7 by giving the debt register its second source, so §11.1's *"Agreed and unbuilt"* hand-written table is **now generated** and your prose introducing it ("what the generated register above cannot show") is false. Reconcile §11.1 to what the generator now does: it reads `deferred_from` on slices, as a list of `"<finding>:<adr>"` pairs carried by the ABSORBING slice, so the two remedies survived the fold into 02 and still show as *agreed and unbuilt*. Keep whatever of your hand-written framing is still true — the "a merge is not a ratification" paragraph in particular — and drop only what the generator now covers.

Note the trap it avoided, because it is your kind of finding: a tombstone carries no `id:` and drops out of the slice list, so folding 12 and 13 would have taken both remedies straight back out of the register — AB-01-7 again, caused by the fix for it.

## What the design must settle

§3 left these to you and Gate B decided the stack; this is where the booking path's shape gets decided. At minimum: the `src/application` use case's boundary and its return type (§8.6's outcome-not-exception mapping), the single SQLSTATE `23P01` translation site, how the route's TypeBox schemas relate to the problem+json serialiser, and where composition order lives now that literal AC-6 keeps it out of `src/domain`.

Two things I will hold you to at step 5, so build them in now:

1. **§2.1 is NON-NEGOTIABLE and this is the slice that either honours it or does not.** The design must make check-then-act unrepresentable, not merely absent. Name what would fail if someone reintroduced it.
2. **Every mechanism you assert must be one you ran.** This slice has produced, across 01 alone, five cases of a mechanism stated and never exercised. Where you claim a rule, a marker or a guard does something, say how you measured it.

State applicable §10 quality scenarios, proposed arc42 edits (the slice declares `["§5.2", "§6.1", "§8.6"]` — anything outside that, tell me and I will route it rather than you taking it), and any ADR needed for a genuinely new decision.

## Constraints

`docs/arc42/`, `docs/adr/`, `docs/slices/02-design.md`. **Not yours:** `docs/slices/02-book-and-read-an-appointment.md` (mine — acceptance criteria are the human's per §6), `docs/team-log/`, `tests/`, `src/`. Conventional Commits scoped `(02)` for the design, `docs(arc42)` for the §11 reconciliation — separate commits, since one is slice work and one is not. Verify with `npm test`, `npm run lint:arch`, `npm run docs:build`, `npm run log:check`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

The human is away and has asked that the team keep moving; I will run steps 2–5 and park at the gate. So flag anything genuinely needing their authority rather than resolving it — I will queue it — and do not treat their absence as licence to decide scope.
