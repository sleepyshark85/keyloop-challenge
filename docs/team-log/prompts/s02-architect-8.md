# Prompt · slice 02 · architect · invocation 8

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Adjudicate T-02-9 deadlock DCR
- Sent: 2026-09-05T18:38:38.116Z

---

Slice 02, **step 3 DCR — T-02-9**. You are the architect, on `slice/02-book-and-read-an-appointment` at `199cc9a`. The red is committed at `34b057b` and observed in CI.

**Read this first: your authority changed yesterday.** The human ruled on 2026-09-06 that **nothing escalates between steps 1 and 5.** You now decide scope, acceptance criteria and quality goals mid-slice as well as architecture. Every such ruling is recorded and is **provisional until the gate**; `slice:check` lists them for the human at step 6. CLAUDE.md §6 Authority and METHODOLOGY §2 are amended, and DCR outcome **(d)** is no longer *"Escalate — human decides"* but *"Defer to the gate — you rule it, record it, continue."*

**This is the first exercise of that rule, and it is exactly the class that would have escalated yesterday** — the honest remedies here may include changing what AC-3 and AC-4 assert. That is now yours. Rule it.

## The finding

**Under N simultaneous inserts against one exclusion range, PostgreSQL refuses the losers with `40P01` (deadlock_detected), not `23P01`** — all-or-nothing per race, in roughly **one race in three**, at every N from 2 to 20. Cause: `check_exclusion_constraint` inserts the index tuple and *then* scans, so simultaneous inserters wait on each other's in-progress tuples and form a cycle.

- **§2.1 is untouched** — exactly one row survives in every trial. The invariant holds.
- But design **§2.6 classifies `40P01` as `other` ⇒ rethrow ⇒ `500`**, so AC-3's and AC-4's *"the other 19 receive `409` with `type=/problems/no-capacity`"* becomes a coin toss, and **QS-1 and QS-2 with them**.

**Remedies the test-engineer measured, so you are not starting from zero:**

- naive retry clears 7 of 8 runs, but one gave up after 8 attempts;
- **jittered retry (0–50 ms) is no better — 3 of 8 still exhausted 8 attempts**, because 50 ms is nothing against a 1 s `deadlock_timeout`;
- neither ADR-0009's shuffle nor the in-scope prune-and-retry loop helps: with one bay every racer is in the same wait graph regardless of candidate order;
- **naming a resource from a deadlock is barred by ADR-0016** — the error carries no `constraint`.

## What I want from you

Rule it, and say which outcome — (a), (b), (c) or (d). To rule **(c)** you must still name the failing AC, §10 scenario or §2 invariant; that test did not change.

Weigh at least these, and I am not steering you toward any of them:

- **Is a `409` even the honest answer for a deadlock victim?** The request did not lose on capacity; it lost on a lock cycle. A `409 no-capacity` would be a true statement about the outcome and a false one about the cause — and ADR-0016 exists precisely to stop a refusal being constructed without the evidence for it.
- **`deadlock_timeout` is configurable.** So is the isolation level, and so is whether the insert takes an advisory lock first — though an advisory lock is the shape §2.1 forbids for *correctness*, and using it for *liveness* is a distinction you would need to make explicitly rather than in passing.
- **What AC-3 and AC-4 can honestly assert.** They currently assert over the table *and* over the 19 responses. The over-the-table half is unaffected by this finding. If the response half is not deterministic, saying so is a legitimate outcome — and it is now your call, not the human's.

## Two things I will hold you to

1. **Whatever you rule, the mechanism must be run, not asserted.** If you propose a retry policy, the number of attempts and the backoff must come from a measurement against a real container, not from a plausible default. This project has caught six mechanisms that were stated and never exercised.
2. **If your ruling changes what an AC asserts, say so in those words** and make it easy for the human to find at the gate. You are exercising delegated authority; the record is the whole of what makes that safe. Do not soften a scope change into a clarification.

## Constraints

`docs/slices/02-design.md`, `docs/adr/`, and arc42 only within `["§5.2", "§6.1", "§8.6"]`. **Not yours:** `docs/slices/02-book-and-read-an-appointment.md` — if your ruling changes an AC, tell me the exact wording and I will make the edit and log it; `tests/` (the test-engineer's, and the red is committed); `src/`; `docs/team-log/`.

Verify with `npm test`, `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`. Note `02-design.md` is far over budget already — do not add net words without saying what you cut. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the ruling, the measurements behind it, any AC wording you want changed, and anything you decided that you would have escalated yesterday — I want that last one called out explicitly, because it is the evidence the new rule is working or not.
