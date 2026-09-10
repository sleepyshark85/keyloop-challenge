# Prompt · slice 14 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Post test-engineer reasoning to PR 22
- Sent: 2026-09-09T15:34:05.775Z

---

Slice 14 is at step 5, approved by the reviewer and awaiting the human gate. One obligation is outstanding and it is yours: `npm run slice:check 14` fails "reasoning is on the PR — PR #22: no attributed comment from implementer, test-engineer". CLAUDE.md §6 puts the reasoning on the PR because the reasoning is the graded artifact, not the code.

**Your only task: post one comment to PR #22 as the test-engineer.** Write no tests, change no files.

You did not author these commits in this session — a session restart lost that context — so reconstruct your reasoning from the record before writing. Read your red commit `fe574ea` and your correction `c061dc6`, `docs/slices/14-otlp-logs-and-service-identity.md` (AC-1 to AC-8), `docs/slices/14-design.md` including the DCR-14-1 ruling appended at `78be828`, and the two existing PR comments. Do not read `src/` — your role bars it, and nothing here requires it. Write only what the record supports.

**What is worth saying**, in your judgement, but these are the load-bearing decisions the record shows you made:

- The red set is a **property, not a count**: AC-1 to AC-6 all had to fail in the one red commit, while AC-7 and AC-8 had to **pass** — they are guards against this slice breaking what slice 09 already asserts, not criteria this slice earns. A guard that is red is a guard written wrong.
- That you caught **AC-6 passing vacuously** before committing red — both negative assertions read an empty exported-record set and silently passed over it — and how you fixed it.
- That the implementer raised **DCR-14-1** against two of your assertions, an architect ruled your correlation helper wrong rather than the code, and you corrected your own file under four binding constraints, the sharpest being that an uncorrelatable record must **fail** rather than be skipped.
- How you established that constraint held: you injected a synthetic unmatchable record, confirmed the test failed and named it, did the mirror-image probe from the other direction, then reverted both. Say that you falsified it rather than asserted it.

**Form — this matters as much as the content:**

- **Short.** A reader should get it in under a minute. Long comments do not get read, and an unread comment discharges nothing.
- **Self-contained.** Gloss every reference inline. Not "AC-4" but "AC-4, that an exported log record's own trace and span ids match a span from the same request". Not "§2.4" but "§2.4 (every slice starts with a test that was observed failing before any code existed)". A reader who has not opened another file must still follow it.
- Lead with the decision, not with a preamble.
- Attribute it as the test-engineer per §9's convention — follow the form of the two comments already on the PR.
- Do not smooth over the vacuous-pass or the DCR. A test author who caught their own vacuity and then had a second correlation defect found by someone else is the honest record, and it is more useful than a clean one.

Post with `gh pr comment 22`. Report the comment URL and nothing else of substance.
