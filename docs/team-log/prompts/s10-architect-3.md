# Prompt · slice 10 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Condense slice 10's design to as-built
- Sent: 2026-09-08T10:39:55.389Z

---

# Slice 10 merged — condense its design to the as-built record

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `main`** (slice 10 merged at `0131bea`). Pull first.

**Slice 10 is done.** The human's conjunctive delegation was satisfied — you verified all five remediations in the tree at `f5b5ef7` and agreed to merge; I asked you directly rather than inferring your half. All twelve Definition of Done rows passed. **This was the last slice of the project.**

## The one thing outstanding

Marking the slice `done` drops `docs/slices/10-design.md`'s ratchet ceiling from 3000 to **1200** words, and it stands at **2999**. `npm run docs:budget:check` is red on `main`.

You did exactly this for slice 09, taking `09-design.md` from 2,998 to 1,182 — *"the slice design shrank into its as-built record."* Same job.

**Condense, do not truncate.** The test that matters: after the cut, can a reader who was not here understand what was decided and why, and check it? Everything the log, arc42 or a test now carries better than the design does is a candidate for deletion; everything that exists **only** here is not.

Worth keeping, in my reading — but you own this and I may be wrong:

- **M2's measurement and what it implied.** A one-member `Type.Union` collapses and silently substitutes; **eight cells** reach it; and narrowing the declaration — the act the slice exists to perform — is what would have armed it. The `Type.Unsafe` remedy and the fact that `Type.String({enum})` measured *worse*.
- **`R-10-2`'s two-level split**, because it is the subtlest decision in the slice: the behavioural property is asserted at the runtime schema, the document level can only assert **shape** because the emitter erased the distinction, and you reversed step 1's "behaviour not shape" for that level alone.
- **Why `/health` is excluded by name** rather than omitted, and why `EXPECTED_PAIRS ≡ doc.paths` closes the class rather than the instance.
- **Why the `REQUEST_COUNT >= 2` guard and the negative control had to move together** — a control exiting non-zero because of a guard rather than because of contention is a control passing for the wrong reason.

Likely deletable: step-by-step narration of what each round moved, anything the PR thread or `events.jsonl` states verbatim, and options weighed then dropped whose rejection is already recorded in a ruling.

## Constraints

- `docs/slices/` and `docs/arc42/` are yours. `src/`, `tests/`, `harness/` are not.
- **Do not raise the ceiling.** If 1200 genuinely cannot hold what must be kept, stop and say so — that is a finding, and I would rather have it than a design quietly emptied to fit.
- All four doc checks and `npm run test:tools` green before you push. Commit `docs(10):`, **explicit pathspec**, push to `main`.

## Return

The before/after word count, what you deleted and where each deleted thing now lives, and anything you could not cut without losing something that exists nowhere else.
