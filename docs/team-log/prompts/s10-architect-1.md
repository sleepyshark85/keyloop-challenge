# Prompt · slice 10 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 1 design
- Sent: 2026-09-08T03:34:52.784Z

---

# Slice 10 · step 1 — DESIGN. The contract half, on its own terms at last.

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `slice/10-openapi-and-curl-harness`** (checked out off `main` at `fe24c4e`, clean). Slice 09 is merged and done; WIP is free.

You wrote `docs/slices/10-openapi-and-curl-harness.md` when you un-folded the tombstone — seven criteria, six inherited obligations, `QS-11`. Read it first. `10-design.md` does not exist yet; that is this dispatch.

**Definition of Ready is green on all eight clauses**, including `inherited obligations declared` naming all six refs, so the re-routing is binding rather than a note.

## What this slice is, and why it exists separately

The human ruled `A-09-4` on your recommendation: all three of slice 09's BLOCKING findings sat on the contract half, the half Gate D folded in. You argued at step 1 of slice 09 that the seam was falser than Gate D knew, then reversed on evidence — this slice is that reversal being paid for.

The work is **small and well-understood**; what makes it a slice is that all three things were asserted by tests that could not fail:

- **AC-9's test** collected `/problems/*` **type strings** and never read `content[…]`, while all 25 responses declare `application/json` and `problem.ts:76` has sent `application/problem+json` since slice 03.
- **A-06-2** was declared discharged *"over the emitted document"* by an assertion containing zero occurrences of `requestBody`, `parameters` or `appointmentId`.
- **AC-10/AC-11's harness** checks the book status only, and the double-booking script counts nothing and always exits `0` — its "one 201, the rest 409" claim lives in a *header comment*.

**That is the through-line worth designing against:** every failure here was a green test that asserted the wrong thing. A design that produces three more of those has failed even if it merges.

## Design it

The usual step-1 output — building blocks touched, interfaces, data-model delta if any, applicable quality scenarios, proposed arc42 edits, an ADR only if something genuinely sits at the human's 2026-09-07 bar.

Five things I want your judgement on, as questions:

1. **AC-2 asks §8.6 to carry a `type` × operation matrix.** That is a new structure in a document that already has an error taxonomy. Is the matrix the right shape, or is it a second home for a fact §8.6 already states — the thing seventeen ADRs were retired for?

2. **AC-1 asserts each operation's problem set by equality.** Equality is what makes deleting a `422` fail, and it is also what makes every future route touch this test. Is that the right trade here, and does it stay honest when a route legitimately gains a `type`?

3. **`R-09-13`** — the TypeBox implementation note now published to API consumers as contract prose. It was relocated there to make three literals killable. Does it move, and if so where do those mutants go?

4. **`R-09-12`** — `date -u -d` is GNU-only, and AC-11's *"from a terminal, without the test suite"* is unachievable today: both scripts need four pre-seeded UUIDs and there is no seed script. What does "runnable from a terminal" have to mean concretely for it to be assertable?

5. **The harness is shell.** `tests/acceptance/harness.test.ts` is the test-engineer's; the scripts under `harness/` are the implementer's. Say which is which in your remedy table — slice 09 lost work twice to an ownership table that was right about the work and wrong about the owner (`T-09-5`, `O-72`).

## Boundaries

- `docs/slices/`, `docs/arc42/`, `docs/adr/` are yours. **Not `src/`, not `tests/`, not `harness/`.**
- Step 1 **proposes** arc42 edits; step 7 makes them.
- Commit `docs(10):`, **explicit pathspecs, never `git add -A`** (O-65). Push. **No PR** — I open it.

## Return

The structured report, plus: whether this is genuinely one slice, what you decided on each of the five, and any criterion you think cannot be asserted in a way that could fail — say it now, because that is the exact defect this slice exists to correct.
