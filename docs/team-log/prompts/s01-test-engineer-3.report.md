# Report · slice 01 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 01 AC-6 control + R-01-5/6
- Returned: 2026-09-05T04:55:56.236Z
- Duration: 928s

---

All three items are implemented, each with its mutant run and observed. `npm test` and `npm run lint:arch` green; `.dependency-cruiser.js` untouched and clean in git.

## Files

- `/home/agentadmin/sources/keyloop-challenge/tests/architecture/layering.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/property/opening-hours-dst.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/architecture/ambiguity-containment.test.ts`

Commits: `e8d6e16` (R-01-3), `234540c` (R-01-5), `8bf9d39` (R-01-6). All green, pathspec-pinned, one file each.

## 1. The planted intra-domain control — R-01-3

Added `src/domain/duration.ts` (legal target) and `src/domain/interval.ts` (imports `./duration.js`) to `VIOLATING_SOURCES`, a table row asserting `domain-is-pure` by name at error severity on that edge, and `src/domain/interval.ts` to the expected list in the per-file case. Named after the real pair on purpose.

**Mutant run.** `.dependency-cruiser.js` reverted in the working tree to `to: { pathNot: '^src/domain/' }`, this fixture in place:

| | Result |
|---|---|
| mutant | **2 failed \| 19 passed (21)** — `expected domain-is-pure to fire on src/domain/interval.ts; all violations reported were []`, plus the per-file case at 10 files against an expected 11 |
| restored | 21 passed (21) |

The 19 that stay green are what make it discrimination rather than a broken fixture. Config restored, byte-identical, not committed.

## 2. R-01-5 — the two floors

The pedestal is removed rather than out-numbered: counters now record **generated** verdicts only; `verdictKinds` still records deterministic ones because `malformed-interval` has no generated source.

**`SPANS_LOCAL_DAYS_FLOOR = 100`.** 100 trials each, P1 at N=1800: healthy min 197 / max 268; broken (`fc.integer({min:1,max:2})`) min 15 / max 36.

| | Result |
|---|---|
| mutant | **1 failed \| 16 passed (17)** — `expected 22 to be greater than or equal to 100` |
| restored | 17 passed (17) |

**`MALFORMED_SHAPE_FLOOR = 40`** — and here I did something other than what was asked, which is the disagreement below. Measured: `malformedInterval` from the generated surface is **exactly 0 in all 100 trials**, necessarily. So the floor moved onto `malformedArb`'s four strata (healthy min 74/81/82/78, max 125; each stratum dropped from the `oneof` in turn takes its counter to exactly 0 while the others rise to ~133), plus a partition assertion that the four sum to `P7_RUNS`.

| | Result |
|---|---|
| mutant (drop `nonFiniteFirstArb`) | **1 failed \| 16 passed (17)** — `NaN or +/-Infinity as the START: expected 0 to be greater than or equal to 40` |
| restored | 17 passed (17) |

## 3. R-01-6 — the concept, not the spelling

Three patterns cover the six rows. Row 3 needs no pattern (a three-term product *contains* `60 * 1000`); row 4 needs none (a divisor is the same token in a different operator position); row 5 falls out of `\b` sitting between the final `0` and the `.`. The word-boundary correction stands — `600000` and `600_000` are both asserted not to match. §7.4 fixture 2 is now row 3, fixture 2b added at row 6. Added the spelling table as an executable `it.each`: 12 positives, 6 negatives.

| | Result |
|---|---|
| mutant C — marker reverted to the step-2 spelling | **10 failed \| 26 passed (36)** — both §7.4 fixtures and 8 table rows |
| mutant D — segment classifier → substring test | **4 failed \| 32 passed (36)** — conforming control, row-6 boundary, and the `admin` / `minimumSpend` negatives |
| restored | 36 passed (36) |

**Row 6 does not false-positive on the real corpus.** AC-5's "exactly one file, and it is `src/domain/duration.ts`" is green with all six rows live. No finding to raise there.

---

## Where I disagree, and residue

**1. R-01-5's remedy for `malformedInterval` was not implementable as stated, and I did not implement it.** The instruction was to size both floors "to a measured healthy minimum that the named regression actually breaks". For `spansLocalDays` that works. For `malformedInterval` there is no such number at any size: P1's composed surface produces `malformed-interval` **zero** times, always, because `appointmentInterval` on a valid instant and a positive duration is well-formed by construction — which is precisely what P7's second case asserts. The tautology there was **structural, not a number chosen too low**, and raising it from 1 to 400 would have re-stated "P7 ran" in a bigger font. I accepted the finding and rejected the remedy, and floored the shape mix instead. The file's own accumulator comment already said `malformed-interval` is reachable only through P7 — so the file knew, and the floor was written anyway. That is worth the retro's attention more than the floor is.

**2. The reviewer's "about 2" is wrong, and the error is the load-bearing kind.** Regressing `durationMinutesArb` to 1–2 collapses the generated `spans-local-days` contribution to **15–36 over 100 trials**, not ~2. The reviewer's 2/1440 reasoning ignores S1/S2, which concentrate samples near midnight-adjacent local times. It matters because `VERDICT_FLOOR = 50` — the obvious reuse, and what a careless fix would have picked — is only 1.4× the broken maximum and **would have passed under the very regression it was added to catch**. That would have been R-01-5 a second time, at a bigger number. Hence a separate constant at 100.

**3. Residue in §7.2.1's spelling set, for the architect's "not made true" section.** The set is open by construction and these are outside it — gaps, not licences: exponent notation (`6e4`, `60 * 1e3`), a conversion routed through a named constant defined in another file (`import { MS_PER_MINUTE }` … `minutes * MS_PER_MINUTE` — the scan sees an identifier, not a number, and §2.1's refusal to export the constant is what keeps this hypothetical), and any computed form (`Math.pow(10, 3)`). Row 6's classifier is also blind to a quantity whose name does not say minutes or seconds (`elapsed * 1000`) — deliberately, since scoping it by name is the only thing that keeps `kilobytes * 1000` out. This is the same class of residue ADR-0013 now names as irreducible for a text scan; I do not think a better regex closes it, and I would not promise one.

**4. Nothing here is red-committed.** Per §7 this slice's one red commit is `0550d09`; all three of mine are green, with the red observations recorded in the commit messages and above. Every mutant was reverted and re-verified green in the same run.
