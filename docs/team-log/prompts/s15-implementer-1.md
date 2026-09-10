# Prompt · slice 15 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 15 step 2: agree or object
- Sent: 2026-09-09T16:43:44.740Z

---

Slice 15, step 2 (AGREE). Review the design and either agree or object, per CLAUDE.md §6 step 2. **Do not write or edit any file, and do not implement anything.** Verdicts and reasoning only.

Read `docs/slices/15-design.md` (design of record, `633737b`) and `docs/slices/15-seed-fixtures-and-capacity-harness.md` (`d79679b`). Branch `slice/15-seed-fixtures-and-capacity-harness`, cut from `main` at `e63fe17`. Read `harness/seed.mjs` and `harness/double-booking.sh` in full before judging — both carry docblocks stating properties as deliberate that a refactor would silently remove.

**What you would build:** `harness/fixture.json` (default) plus `HARNESS_FIXTURE` to override; a hand-written validator in `harness/seed.mjs`; two seeded subtrees — a **scarce** one at the empty export prefix reproducing today's exports exactly, and an **abundant** one under `CAPACITY_`; and a new `harness/spurious-refusal.sh` asserting `min(N,M)`.

**The design's central ruling, which you should test rather than accept:** slice 10's exported names survive **by construction**, because exports are derived mechanically as first-of-each-unprefixed and the scarce subtree is declared first. AC-9 makes that mechanical — `harness/double-booking.sh` and `tests/acceptance/harness.test.ts` must be **unchanged** by your diff. If you think the construction does not actually guarantee that, say so now; at step 4 it is a DCR.

**ADR-0038 is drafted and it constrains you directly:** the fixture carries **data, never schema**. The nine `INSERT`s stay hand-written naming every column, so `seed.mjs` remains a second independent transcription of arc42 §8.1's shape and a dropped column still fails loudly with PostgreSQL's `42703`. The rejected option is the refactor a maintainer reaches for twice — generating SQL from the JSON — under which the column vanishes from the fixture too and the `42703` never fires. Consequently the fixture carries **no uuids, no VINs, no instants, no export names**: fresh ids per invocation (`vehicle.vin` has a global UNIQUE and the `db` container is never truncated), the rolled-forward tomorrow-09:00Z, and prefix-derived naming all stay properties of the seeder.

**Things worth your scepticism, and dismiss any I have wrong:**

- **The validator is hand-written, no new dependency.** The design's argument is that half the rules are cross-references (`qualifiedFor` → declared service type, `owner` → same-subtree customer, exactly one empty prefix) a JSON Schema cannot express. Does that hold, and is a hand-written validator that rejects **unknown keys** actually maintainable here?
- **AC-3 demands an invalid fixture insert no row**, achieved by validating to completion before the first `INSERT`. Is validate-first equivalent to atomic in this context, given the container is never truncated between the acceptance test's repeated invocations? Would wrapping the inserts in a transaction be cheaper than proving the validator total?
- **`seed.mjs` has no `pre` hook, measured** — npm's own `pre`-hook stdout would interleave with, and be `eval`'d alongside, the export lines. Whatever you add must not reintroduce anything that writes to stdout outside the export shape. AC-1 asserts "nothing that is not an export line".
- **The new script derives *M* from the exported declared counts, never from the answers.** That is slice 10's AC-5 defect verbatim ("a script that always exits 0 regardless of what it saw is not a demonstration, it is a print statement"). Check the proposed shape cannot drift back into inferring capacity from what it received.
- **No mutation evidence will exist for this slice** — nothing under `src/` changes, and Stryker mutates neither `harness/**` nor tests. The four negative controls are what stands in for it. If you think that leaves something important unguarded, this is the step to say so.
- **D-15-1, already booked**: ADR-0009's cap of 16 is deliberately not encoded in the harness, so a fixture author setting *M* = 9 gets an unwarned flaky demo. Do you accept that trade for one home for the constant?

Per §6: **disagreement is expected and is not failure.** State finding and remedy **separately**. One verdict (AGREE or OBJECT) per point, with reasoning.
