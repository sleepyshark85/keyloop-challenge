# Prompt · slice 01 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 AC-6 control + R-01-5/6
- Sent: 2026-09-05T04:40:26.592Z

---

Slice 01, step 5 continued. You are the test-engineer. Three items, all in files you own. Two came from the reviewer and one is a human gate ruling. Read `docs/team-log/prompts/s01-architect-1.report.5.md` and `docs/slices/01-design.md` §7.2.1 and §7.4 before you start — the architect's respecification is the spec for item 3 and I am not restating it.

---

## 1. The planted intra-domain control — `tests/architecture/layering.test.ts`. This one is a gate blocker.

**Background.** AC-6 reads: *"…then `src/domain` imports nothing at all — the `domain-is-pure` rule holds with no allowlist."* The reviewer found (R-01-3) that the literal ruling was enforced by nothing: `domain-is-pure` was `to: { pathNot: '^src/domain/' }`, which permits intra-domain edges by construction, and your fixture plants its `domain-is-pure` violation **outside** the domain (`src/domain/bad.ts → src/platform/config.js`), so the intra-domain form has never been exercised.

The human ruled at the gate that `pathNot: '^src/domain/'` **is** an allowlist and AC-6's second clause was **unmet**. The architect has since committed `to: {}` (commit `9c266c2`). The architect's own words on what remains, and it is your half:

> "These commits do not make AC-6's second clause met. They make the rule's *text* allowlist-free, which is the half I own. The clause is only met once the planted intra-domain control exists in `tests/architecture/layering.test.ts` and has been observed failing under the mutant. Until then `domain-is-pure`'s new absoluteness is a fifth mechanism in this slice that has been stated and never run. I would not sign the gate on the config change alone."

**What to add.** A fixture file under `src/domain/` that imports another `src/domain/` file, and an assertion that `domain-is-pure` is reported **by name, at error severity**, on that edge. It belongs in `VIOLATING_SOURCES` and in the `it.each` table, and — note this, because your own existing assertion would otherwise catch you — the *"reports exactly one violation per planted violating file, and none besides"* case derives its expected list from the fixture, so the new file has to appear there too.

**The mutant, named. Independently measured three times — by me, and by the architect out of tree:**

| Config | Tree | Result |
|---|---|---|
| `to: {}` | clean | `no layering violations. 54 module(s) cruised` |
| `to: {}` | planted `src/domain/interval.ts → src/domain/duration.ts` | `1 layering violation(s): domain-is-pure: src/domain/interval.ts → src/domain/duration.ts` |
| `to: { pathNot: '^src/domain/' }` | **same planted import** | **clean, at 91 dependencies — up from 90** |

The third row is your control's mutant, and the dependency count is the detail worth keeping: the cruise demonstrably *saw* the edge and the old rule chose not to object. **Run that mutant.** Revert `.dependency-cruiser.js` to `pathNot: '^src/domain/'` in your working tree, confirm your new control **fails**, restore the file, confirm it passes, and report both observations. Restore it — do not commit the mutant, and do not commit `.dependency-cruiser.js` at all; it is the architect's file.

A control that has never been watched to fail is the exact thing this slice has now produced five times. Do not let it be six.

---

## 2. R-01-5 — the two tautological floors in `tests/property/opening-hours-dst.test.ts`

The reviewer's measurement, verbatim from the log:

> `coverage.spansLocalDays` is incremented immediately after `expect(...).toBe('spans-local-days')` over 300 deterministic runs, and `coverage.malformedInterval` likewise over 400. Both are at least 300 whenever the preceding tests pass, whatever the generator does. The file's own comment records a measured healthy minimum of 196 and does not use it. Regressing `durationMinutesArb` to `fc.integer({min:1,max:2})` collapses P1's `spans-local-days` contribution from about 200 to about 2 — a 2-minute job crosses local midnight with probability about 2/1440 — and the guard still passes on P6's deterministic 300.

Design §5.3 rules out the `>= 1` floor by name, and the other nine floors the reviewer checked were verified correctly sized against three distinct generator breakages. Size these two the way the nine are sized: to a measured healthy minimum that the named regression actually breaks. **Demonstrate it** — apply the `fc.integer({min:1,max:2})` regression, show the guard now fails, restore, show it passes.

---

## 3. R-01-6 — `tests/architecture/ambiguity-containment.test.ts`, against the respecified §7.2.1

The architect ruled the root cause **its own**: §7.2 defined `duration-arithmetic` as a *spelling* (`60_000` / `60000`), not a concept, so `minutes * 60 * 1000`, `1000 * 60`, `ms / 60000` and `secs * 1000` all go unflagged — and the planted control used the one spelling the pattern was written for, which proves only that the pattern matches itself.

§7.2.1 now defines the marker by **what it must catch** — any minutes/seconds↔milliseconds conversion under `src/` outside `duration.ts` — with a six-row spelling table, and §7.4's fixtures are respecified: fixture 2 moves from `minutes * 60_000` to `minutes * 60 * 1000` (row 3) and a fixture 2b is added at `seconds * 1000` (row 6). Implement against that.

Two things the architect asked me to pass on explicitly:

- Your word-boundary correction **stands and is not being undone** — `600000`, an ordinary six-hundred-second timeout, must still not match.
- **Row 6 is the widest and the architect expects you to argue with it.** Its ruling: *"If it false-positives on something that is genuinely not duration arithmetic, that is a finding to raise, not a licence to narrow the concept back to a spelling."* So if row 6 false-positives on the real corpus, **raise it as a finding and report it** — do not quietly narrow the pattern, and do not silently drop the row.

Also: R-01-6's stated remedy included recording this in the design's *"not made true"* limitations. That section is the architect's, not yours; if the residue after your implementation is not what §7.2.1 assumes, say so in your report and I will route it.

---

## Constraints

- Yours: `tests/architecture/`, `tests/property/`. **Not yours:** `src/`, `tests/unit/`, `.dependency-cruiser.js`, `docs/adr/`, `docs/arc42/`, `docs/slices/01-design.md`, `docs/team-log/events.jsonl`. You do not read `src/` (§5) — every item above is satisfiable from fixtures and the design.
- §7 says **exactly one red commit per slice** and this slice already has it (`0550d09`). So these commits are **green**: measure each red observation, record it, restore, and commit green. The red evidence lives in your report and in the event log, with the mutant named — that is this project's rule for a discrimination claim.
- `npm test` and `npm run lint:arch` green before each commit. Conventional Commits scoped `(01)`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

- Note `docs/slices/01-domain-policy-core.md` has an unstaged frontmatter edit of mine and `docs/team-log/events.jsonl` has unstaged appends of mine. Leave both alone; do not `git add -A`.

Report: what you changed, each red-then-green observation with its numbers, and anything you disagree with. Disagreement is expected and is not failure — §6 reads an adjudication round that never produced one as deference.
