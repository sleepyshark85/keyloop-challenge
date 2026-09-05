# Prompt · slice 02 · architect · invocation 11

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 step 7 as-built
- Sent: 2026-09-05T22:14:42.387Z

---

Slice 02, **step 7 — AS-BUILT**. You are the architect, on `main` at `32b14c8`. **Slice 02 is merged** (PR #12).

Gate E was taken by the **orchestrator under the human's 2026-09-06 delegation**, not by the human — recorded as `approved-under-delegated-authority`, and `slice:check`'s gate line now names the actor so a delegated gate is visibly not a human one.

## Your job

§6 step 7: reconcile arc42 to **what actually merged**. §4 makes arc42 the single source of truth, and right now it describes a system that predates this slice.

The slice declared `arc42: ["§5.2", "§6.1", "§8.6", "§10.2"]`. **If reconciliation needs a section outside that, tell me and I will route it** rather than you taking it — that rule now has a mechanism behind it, since `slice:check`'s arc42 check became gate-relative under R-02-1 and would have caught a mid-slice edit under any subject line.

The facts to reconcile against, so you are not re-reading the whole branch:

- **The booking path exists**: `POST /appointments`, `GET /appointments/{id}`, five layered modules, ADR-0004's prune-and-retry loop **per candidate value**, ADR-0018's two class-scoped advisory locks, one SQLSTATE translation site.
- **§8.6's taxonomy is built and reachable** — the reviewer confirmed all seven in-scope rows, including `reference-data-invalid` end-to-end via a seeded bad zone, which §5.1 had wrongly called unreachable.
- **ADR-0014 and ADR-0015 are implemented** — the `Instant` bound in two places, and an interval ending at local midnight.
- **ADR-0018 and ADR-0019 are `proposed` and were deliberately NOT ratified** under the delegation. Do not flip either. ADR-0018 is the one whose own Consequences record that **ADR-0016's argument is weaker after it than before** — arc42 §11 should carry that, and it is the most important single thing this slice added to the debt register.
- **AC-5's wording changed** mid-slice; AC-3 and AC-4 did not.

## Three corrections you already identified and owe to arc42

You named these in your own rulings and they belong in the as-built pass:

1. **E-02-3** — §8.5's serialiser table is incomplete and its guidance reverses under measurement. You routed it at step 1 and it has been waiting since.
2. **AC-6's over-claim** — `additionalProperties: false` is load-bearing for ADR-0005's emitted document, **not at runtime**, because Fastify's `removeAdditional: true` strips rather than rejects. You corrected the design; §8.5 is where the client-facing consequence goes.
3. **F-02-9** — every write path to `appointment` must take ADR-0018's two locks in the same order. Slices 06 and 07 inherit it, and it is ruled deferred with them as the named owner. arc42 §11 is where an inherited obligation lives so slice 06 does not rediscover a deadlock.

## What I want in the delta

Report the **as-designed versus as-built delta** explicitly — the scribe needs it and it is graded work. Slice 02 produced an unusual amount of it: a `(c)` ruling mid-slice, a remedy that livelocked, an acceptance criterion reworded, and a mechanism (advisory locks) that was not in the design at step 1 at all.

**Say plainly where the design was wrong rather than where it was incomplete.** §2.4's "no `db.transaction()` anywhere on this path" and §5.1's unreachability claim were both wrong, not merely thin, and an as-built record that smooths that into "refined" is worth less than one that says so.

## Constraints

`docs/arc42/` and `docs/adr/`. **Not yours:** `docs/slices/`, `tools/`, `tests/`, `src/`, `docs/team-log/`.

Several arc42 sections are over budget — `npm run docs:budget` is your meter, and the concision ruling stands: one home per fact, arc42 says what the system **is**, present tense, no history. The history of this slice is in the event log and on PR #12.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:build`, `npm run docs:budget`, `npm run docs:adr-check`. Conventional Commits, `docs(arc42): slice 02 as-built`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the delta, the sections touched, anything outside the declaration that needs routing, and anything you found drifting that this slice did not cause.
