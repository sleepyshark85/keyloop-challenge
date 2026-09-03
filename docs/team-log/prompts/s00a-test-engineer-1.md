# Prompt · slice 00a · test-engineer · invocation 1

**BACKFILLED.** The capture hook was live but matched only the tool name `Task`; this build spawns
agents with `Agent`, so nothing was written. Reproduced verbatim from the session transcript. The
matcher now accepts both and carries a regression case — see `README.md`.

- Task: Slice 00a step 2 agree

---

You are the test-engineer at **step 2 (Agree)** of the slice loop for **slice 00a — the walking skeleton**. Branch `slice/00a-walking-skeleton` is checked out. PR #4 is the venue.

This step is a **review of the design only**. Write no tests, no code, no config. Your output is a judgement: **agree** or **object**, with reasons. You write the failing acceptance test at step 3, but not yet — and objecting now is cheap, whereas the same ambiguity surfacing at step 5 costs a full cycle plus a loopback.

## Read

- `docs/slices/00a-walking-skeleton.md` — the slice and its six acceptance criteria, approved by the human at Gate C. You may not change them.
- `docs/slices/00a-design.md` — the architect's design. This is what you are reviewing.
- `docs/adr/0011-health-is-an-operational-probe.md` — raised by this design, `status: proposed`.
- `CLAUDE.md` §5 (test ownership — note `tests/architecture/` and `tests/performance/` were ruled to you at Gate B) and §6 (the loop, and DCRs).
- `docs/arc42/10-quality-requirements.md` QS-10, which this slice must make true.
- `.dependency-cruiser.js` and `.github/workflows/verify.yml`.
- `docs/team-log/process-criteria.md` — what the pilot is measured against.

## The question you are answering

**Can you write a failing acceptance test for every acceptance criterion from this design, and would that test fail for the right reason?**

Judge specifically:

1. **Is every AC testable as written, from this design?** AC-1 through AC-6. Name any AC where the design leaves you unable to write an assertion that would fail before the implementation exists and pass after.
2. **AC-4 — the fixture-tree injection.** The design specifies what the layering test must establish. Is that enough for you to write it? QS-10's standard is that the ruleset is proved to *fire*, not merely to parse.
3. **The two bootstrap paradoxes.** The architect states that C1 is unmeasurable for 00a, and that AC-6's own `red-proof` job cannot judge 00a's red commit. Do you accept the alternative evidence proposed — the red commit SHA, the phase-3 `verify` run passing on it, the four-case test of the discriminator, and the human's observation? If not, say what would satisfy you instead.
4. **Ownership.** The design says `tests/setup/` and `vitest.config.ts` are yours, so the red commit carries the test toolchain. Do you accept that? Note the design also flags that `guard-paths.mjs` guards neither path today.
5. **The design's flagged item 3** — that AC-5 and AC-6's evidence is implementer-authored in `tools/test/`, because test-engineer-authored equivalents would be red at step 3 and would fail `npm run test:tools`. Is that reasoning sound, or is there a shape that keeps the evidence yours?
6. **`src/domain` shipping empty.** The architect predicts you may object. Do you?

## Rules

- Do not read `src/` — it does not exist yet, and independence is a read restriction as much as a write one.
- You may not edit the slice's acceptance criteria. If one is wrong, that is a DCR, not an edit.
- Do not write to `docs/team-log/events.jsonl`, do not move the board, do not push, do not comment on the PR, do not commit. The orchestrator posts your position on your behalf.

## Report back

Lead with your verdict: **AGREE** or **OBJECT**. Then, per numbered point above, your reasoning. If you object, name the acceptance criterion or the specific design statement you dispute and what change would resolve it — an objection without a named target is a preference. If you agree, say what you will write at step 3 and in which files, so the implementer knows what is coming.

Be specific and be willing to disagree. A step-2 review that has never produced an objection is rubber-stamping, and the pilot retro measures exactly that.
