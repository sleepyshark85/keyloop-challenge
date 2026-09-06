# Report · slice 04 · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: F2 — guard R-7a's mitigation outside-in
- Returned: 2026-09-06T08:05:50.323Z
- Duration: 812s

---

CI is green on the exact head I pushed. Report below.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 1, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": "86af39b",
  "ci_failure_confirmed": false,
  "objections": [],
  "dcr": null,
  "message": "R-7a's mitigation is now held outside-in at the level an operator actually runs at. Three mutants built in dist/ (never src/), each killed by this test alone and by nothing else in 529: the emission removed, the actionable sentence removed, the emission downgraded to debug."
}
```

`ci_failure_confirmed: false` is literal, not a gap: this is a step-5 remedy asserting behaviour that already ships, so its red evidence is the mutant runs below, not a CI red. Run **34020817061**, head **86af39b**, all three jobs success — which also closes F3 for this head.

## What I decided to pin, and why that much

Presence *and* content, but content as **obligations rather than prose**. Five assertions, each independently defeasible:

1. **Exactly one** `config.warning` record when `BOOKING_SEED` is set — zero is the missing mitigation, more than one is a per-request line, which is noise an operator filters.
2. **At `warn` or above (≥40), and at the artifact's own default log level.** This is the change that reaches beyond what the review asked. Every other test in the file starts the service at `LOG_LEVEL=trace`; a warning only reachable at `trace` is not a mitigation, and asserting it at `trace` would not notice. So `tests/support/service.ts` gained `logLevel: null` — LOG_LEVEL is *deleted* from the child env rather than set — and this is the only assertion in the suite that runs the artifact the way an unconfigured deployment runs it.
3. The text **names `BOOKING_SEED`** — which knob to unset. A contract fixed by ADR-0022 and §7.3, not prose, so no rewording moves it.
4. The text **carries the seed's value**, compared against the test's own constant. ADR-0021's entire argument is that a recorded seed is "a label, not a handle"; a warning without the value hands back the label.
5. The text says **`production`** — one word, lowercased, not the sentence. That is F2(a)'s loose half, and it is the better home for it: `config.ts:213`'s content is *operator guidance*, and the place to assert operator guidance is the run an operator sees.

**Deliberately left loose:** the wording; the sentence order; **which field carries any of it** — the record is read whole (envelope keys stripped, remaining values joined), so moving the seed out of the message into a structured field is not a failure, because the obligation is that the information reaches the operator, not where it sits; and ADR-0009's **"Order-A"** jargon. That last is a decision rationale rather than an instruction, it is already killed by a mutant *inside* `config.ts` — which is in Stryker's scope, unlike `main.ts` — and duplicating it here buys a second brittle pin and no new obligation. Two of the unit test's four fragments survived; I did not fix that by adding four of my own.

## Does it discriminate? Three mutants, all killed

I could not edit `src/`, so I mutated the **compiled artifact** and never read it: an AST script located the smallest statement containing `config.warning` and rewrote that range, printing only shape facts (`removed one ExpressionStatement of 50 chars`). Scripts in `/tmp/.../scratchpad/mutate.mjs` and `mutate-level.mjs`.

| | Mutant | Result |
|---|---|---|
| **M1** | the emission statement replaced by a no-op — **the reviewer's mutant** | service boots and serves normally, no `config.warning` on stdout. **Full suite: 1 failed, 528 passed.** Mine is the only test that fails. |
| **M2** | `"It is for reproducing a run, never for production."` deleted from the message | presence, level, name and value all pass; **only the `production` assertion fails**. The outside-in analogue of Stryker's `config.ts:213` survivor, now killed. |
| **M3** | the emission downgraded `.warn(` → `.debug(` | invisible at the default level: **0 records**. Under `trace` this would have survived the count and died on the level pin; the pair is what makes it unconditional. |

M1's 528/1 is the reviewer's claim (b) turned from a grep into a measurement. My first two attempts at M1 were invalid — a line-wise `sed` and then a raw statement deletion both broke the module, failing all 7 tests for a syntax error, which proves nothing. Substituting an empty statement is the faithful mutant.

I also checked the two things you told me not to take on report: `config.warning` occurs **once** in the repository, in `src/main.ts` (established by `grep -rl`/`grep -rc` — filenames and counts only, never contents), and the exclusion is real in `stryker.config.mjs`.

## The `!src/main.ts` justification

The architect corrected it in `b7c13e4` while I was working, and the new comment is **true after my change** — in fact my test is the remedy it names. Its true reason is capability, not coverage: `vitest.mutation.config.ts` includes `tests/unit/**` only, and `main.ts` is unimportable by a unit test by construction. What I would flag for whoever reads it next: the comment's stated cost — *"every line of `main.ts` is guarded by an outside-in assertion or by nothing at all, and the mutation score cannot tell which"* — remains exactly true. Line 46 is now guarded; the general claim is undischarged, and the file has no test that would tell you which other lines are in which class.

Files: `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/candidate-retry.test.ts` (+162), `/home/agentadmin/sources/keyloop-challenge/tests/support/service.ts` (+23, the `logLevel: null` seam). Commit `86af39b`, by explicit pathspec.
