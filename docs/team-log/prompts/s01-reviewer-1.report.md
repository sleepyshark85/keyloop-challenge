# Report · slice 01 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 01 step 5 — review
- Returned: 2026-09-04T20:17:03.581Z
- Duration: 970s

---

# Slice 01 review — `slice/01-domain-policy-core`, PR #10

Seven findings: **3 MAJOR, 4 MINOR, 0 BLOCKING**. Outcome **changes-requested**, not blocked. Four of the seven are the architect's to rule on, not the implementer's to fix, and on my reading none of them is a (c) — the merged work is correct under the agreed design in every case. No loopback pressure.

---

## What I checked and found nothing wrong with

**The three survivors are all genuine. I attacked both claims and both stand.**

`openingHours.ts:119` — OptionalChaining and StringLiteral. The claim is that `parts.find(...)` never returns `undefined`. Measured, not accepted: `formatToParts` returned all seven requested part types for every one of 418 × 9 = 3762 (zone, instant) combinations drawn from `Intl.supportedValuesOf('timeZone')`, plus 23 non-canonical forms Intl accepts but does not list (`UTC`, `GMT`, `Etc/GMT+5`, `Etc/GMT-14`, `+05:30`, `US/Pacific`, `Japan`, `W-SU`, `Antarctica/Troll`, `Pacific/Chatham`, `Australia/Lord_Howe`, `Asia/Kathmandu`, …), across instants including both `±8.64e15` extremes and year 1. Every `weekday` value was one of the seven keys in `WEEKDAY_INDEX`. The guarantee is the pinned `'en-US'` locale plus the seven explicitly-requested options in `buildFormatter` — `weekday:'short'`, `year:'numeric'`, `month/day/hour/minute/second:'2-digit'`. The only zone value that breaks it is one that makes the *constructor* throw, and step 2 already converts that to `unknown-zone`. So `find` cannot return `undefined`, `?.` never short-circuits, and `?? ''` never fires. Both equivalent.

`openingHours.ts:188` — I proved the value domain rather than restating it. The mutant is at column 32: `closesSeconds === null` → `false`, **not** the whole condition. When `opensSeconds` is a number and `closesSeconds` is `null`, the mutant falls through to `!(opensSeconds < null)`; JS coerces `null` to `0` in a relational comparison, so that is `!(opensSeconds < 0)` — `true` whenever `opensSeconds >= 0`, yielding `malformed-hours`, the same verdict. The regex `^(\d{2}):(\d{2})(?::(\d{2}))?$` admits no sign character, so `parseTimeToSeconds`'s non-null range is exactly `[0, 86400]`. Exhaustive differential over the entire reachable domain — all 1502 distinct parse outputs including `null`, all 1502² pairs — gives **zero** differing verdicts. The single input that would kill it is `opensSeconds < 0`, which the regex makes unrepresentable. Equivalent.

**The red was real, and the committed tests discriminate.** I rebuilt the reference implementation the test-engineer deleted — patching the gitignored `dist/domain/*.js` with eight deliberately wrong implementations and running `--project nodb` against each. All eight failed, and the failures land in `tests/property/opening-hours-dst.test.ts`, not only in the unit suite:

| wrong implementation | failing tests |
|---|---|
| renders in UTC instead of the dealership zone | 7 |
| a missing `opening_hours` row treated as open all day | 3 |
| `closesAt` exclusive rather than inclusive | 1 (P4) |
| `durationMillis` forgets the `* 60_000` (D-01-2, the debt entry §11 calls most likely to cash in) | 2 |
| the `spans-local-days` check dropped | 3 |
| step 7 compares the start twice, never the end | 3 |
| the seven-entry weekday lookup shifted by one | 4 |
| `appointmentInterval` subtracts instead of adds | 5 |

The two survivors, patched in as their Stryker replacements, left 187/187 passing — reproducing as survivors rather than as undetected kills.

**The coverage floors are correctly sized and the measurement behind them reproduces.** 200 trials × 1800 draws, healthy `fc.oneof(s1,s2,s3)` vs S1 removed: near-transition counters healthy min 67 / max 134, broken max 17. `NEAR_TRANSITION_FLOOR = 40` sits between with margin both ways; the file's stated "broken max 18 / healthy min 74" reproduces. I also broke it two further ways — S3-only (broken max 3) and anchors moved to the wrong year (broken max 12) — and the floor fails reliably in all three. `OFFSET_FLOOR = 150` is loose against healthy minima (gmt 879 / bst 808) but does discriminate the failure mode it names. The generators reach the boundaries; they do not merely permit it.

**Discipline.** Exactly one `(red)` commit — `0550d09`, touching only `tests/architecture/`, `tests/property/`, `vitest.config.ts`, no `src/`. Test ownership holds symmetrically in both directions; your check confirms. Conventional Commits with the slice id throughout. I verified the green-per-commit claim that CI did not: GitHub ran `verify` on only 3 of the 8 post-red commits (batched pushes), leaving five implementer commits unobserved, so I checked them out into a detached worktree — all six typecheck, build, and pass the unit suite, count rising 83 → 93 → 104 → 126 → 131 → 136. One fact worth stating so it is not misread later: **there are two failing CI runs on this branch, not one.** `1712f1f` (`chore(log): slice 01 red observed in CI`) also concluded `failure` — a docs commit sitting on the still-red tree. It introduces no red and §7 is satisfied.

`depcruise src tests tools`: no violations, 88 modules / 197 dependencies. `lint:arch`: 54 modules, every root covered. `src/domain/*.ts` contains zero `import` / `from` / `require(` / `import(` tokens. Mutation on changed files: `duration.ts` 9/9, `interval.ts` 4/4, `openingHours.ts` 139/142 — **0.9806, 3 survivors, all three equivalent.**

---

## Findings

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MAJOR
src/domain/openingHours.ts:152
claim:     step 1's guard uses Number.isInteger, which does not bound the value to the range
           new Date() can render, so withinOpeningHours throws an uncaught RangeError instead
           of returning a verdict — contradicting design §4.2 step 1's own stated reason for
           the check ("everything after it would otherwise be handed a value new Date(...)
           cannot render") and §2.2's "everything downstream is total".
scenario:  withinOpeningHours(8_640_000_000_000_000, 8_640_000_000_000_001, 'Europe/London',
           weekly) — both integers, end > start — throws RangeError: Invalid time value;
           reachable through the documented composition because instant(8_640_000_000_000_001)
           returns a valid Instant (measured), so src/application hands it straight through.
```
No caller exists today, so nothing shipped is wrong — but the slice that adds the HTTP parse inherits a function documented as total that is not, and `{"startsAt": 1e16}` becomes a 500 rather than a 400. Where the range check belongs (`instant()`, step 1, or the request parser) is the architect's call; I name the defect, not the fix.

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MAJOR
tests/architecture/ambiguity-containment.test.ts:358
claim:     ADR-0013's narrowed consequence — the scan "fails when an outside-in test file
           references src/ by any route", so it is "no longer review is the only thing
           standing there" — is not delivered: SRC_REFERENCE matches only relative ../src/
           climbs, and tests/architecture/ (one of the eight directories
           outside-in-tests-do-not-import-src covers) is not scanned at all.
scenario:  a future tests/property/foo.test.ts writes
             const ROOT = fileURLToPath(new URL('../../', import.meta.url));
             await import(pathToFileURL(join(ROOT, 'src/domain/openingHours.ts')).href);
           measured: SRC_REFERENCE does not match, dependency-cruiser cannot see a computed
           import, and both mechanisms report green while the independence is spent.
```
**On T-01-3 specifically: the exclusion is sound; the ADR's claim about it is not.** I reproduced the two false positives (7 and 10 `../src/`-shaped fixture strings in `ambiguity-containment.test.ts` and `layering.test.ts` respectively) — a raw-text scan genuinely cannot tell those from real references, and excluding the directory was the right engineering call. What does not hold is the ADR's *narrowing*. It is `status: proposed` and reaches the human at Gate E; the wording is the architect's to correct or the scan is the test-engineer's to widen. The root-anchored evasion is the broader half, and it affects all seven scanned directories, not just the excluded one — it is the idiom the scan's own host file uses at line 26.

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MAJOR
.dependency-cruiser.js:48
claim:     the literal AC-6 ruling — src/domain imports nothing at all, intra-domain
           included — has no enforcing mechanism. domain-is-pure is
           from:^src/domain/ → to:pathNot ^src/domain/, which permits intra-domain imports;
           layering.test.ts:169 plants its domain-is-pure violation as an import of
           ../platform/config.js, outside the domain, so the intra-domain form is never
           exercised; and the containment scan reads markers, not imports.
scenario:  measured — a fixture in which interval.ts does
           `import { durationMillis } from './duration.js'` cruises clean under the
           repository's own config: "no dependency violations found (2 modules, 1
           dependencies cruised)". The slice that adds src/application finds the
           hand-composition awkward, adds that one import, and depcruise, lint:arch, the
           containment scan, the property suite and slice:check all stay green.
```
This is the finding I would most want the architect to see. The ruling reshaped the whole slice — it bought `malformed-interval`, P7, the unbranded parameters, and D-01-1 through D-01-4 — and today it holds by the implementer's discipline alone. AC-6 as *written* passes (it asserts that running depcruise is clean, and it is); AC-6 as *ruled* is unguarded.

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MINOR
src/domain/openingHours.ts:175
claim:     a dealership whose closes_at is 24:00:00 — data CHECK (closes_at > opens_at)
           permits and §3.2 argues at length must be supported because "a dealership open
           until midnight is legitimate reference data" — can never take the appointment
           that ends at midnight, because step 4 renders the half-open interval's EXCLUSIVE
           endpoint and rejects it as spans-local-days.
scenario:  weekOpen('09:00:00','24:00:00'), 60-minute job starting 23:00 local Monday
           2026-06-15 → {"kind":"spans-local-days","startsOn":"2026-06-15",
           "endsOn":"2026-06-16"}; one second shorter → within. [23:00, 24:00) occupies no
           instant on Tuesday.
```
Related and measured: swept over a whole local day at 1-second granularity, `closesAt: '24:00:00'` and `'23:59:59'` give **identical verdicts on every input** — `end.secondsOfDay ∈ [0, 86399]` always, so the `86_400` normalisation cannot change any comparison. The branch is real (it avoids `malformed-hours`) but the capability §3.2 justifies it with is not delivered. The implementation follows design §4.2 step 4 exactly — **this is the design's to answer, not the implementer's.**

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MINOR
tests/property/opening-hours-dst.test.ts:714
claim:     two of the eleven coverage assertions are >= 1 — the `> 0` floor design §5.3
           explicitly rules out — and both are tautologies given the tests that feed them.
           coverage.spansLocalDays is incremented at line 592 immediately after
           expect(...).toBe('spans-local-days') over 300 deterministic runs;
           coverage.malformedInterval at line 638 after the same assertion over 400. Both
           are >= 300 whenever the preceding tests pass, whatever the generator does. The
           file's own comment records a measured healthy minimum of 196 and does not use it.
scenario:  regress durationMinutesArb to fc.integer({min:1,max:2}) and P1's spans-local-days
           contribution collapses from ~200 to ~2 (a 2-minute job crosses local midnight
           with probability ≈ 2/1440); the guard still passes on P6's deterministic 300.
```

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MINOR
tests/architecture/ambiguity-containment.test.ts:89
claim:     DURATION_LITERAL detects one spelling of duration arithmetic, and the planted
           control at line 215 plants that same spelling — so the discrimination claim is
           proved only against what the scanner already looks for.
scenario:  measured — `minutes * 60 * 1000`, `minutes * 1000 * 60`, `minutes * 6e4`, a local
           `const MINUTE_MS = 60 * 1000`, and `const secs = minutes * 60; secs * 1000` are
           all NOT FLAGGED. A future src/application/bookAppointment.ts computing
           `const endsAt = startsAt + minutes * 60 * 1000;` violates AC-5, breaks QS-12's
           containment, and the scan reports green.
```
The word-boundary fix itself holds — `600000` is correctly not flagged. Design §7.2 specifies exactly this marker, so it is an honest proxy; it is just not among §9.2's recorded "not made true" limitations, and it should be.

```
**reviewer** · `.claude/agents/reviewer.md@30e0754` · MINOR
docs/slices/01-domain-policy-core.md:6
claim:     the slice declares arc42: ["§5.2","§8.3","§12"], but the branch changed
           docs/arc42/10-quality-requirements.md (QS-9's wording, under the human's O-13
           ruling), while §5.2/§8.3/§12 have not moved at all — correct, that is step 7.
scenario:  slice:check's "arc42 scope declared" gate tests for the field's presence, not for
           the diff matching it, so an undeclared arc42 edit merges unnoticed; here it is
           benign, and the declaration is the only thing that would catch one that is not.
```
**I am not blocking on this.** The §10 edit is a human-ruled correction, documented in three places. The §9 and §11 diffs are inside `<!-- generated -->` markers written by `npm run docs:build` and are not hand edits. The remedy is one word of frontmatter.

---

## AC-by-AC

| | Verdict |
|---|---|
| **AC-1** | Satisfied. `appointmentInterval` has no parameter for a client-supplied end; P2 asserts `endsAt − startsAt === d × 60_000` exactly over 600 cases; my subtract-mutant is caught 5 ways. |
| **AC-2** | Satisfied. Worked pair asserted in both files from measurement; P1 runs 1800 cases against an oracle that never calls `Intl`; my UTC-rendering mutant is caught 7 ways. |
| **AC-3** | Satisfied. P2 on the instants plus the explicit `00:30 → 02:30` spring-forward case. |
| **AC-4** | Satisfied **at the domain contract**, and the design says so honestly (§3.3, §9.1): nothing in slice 01 reads a row, so *no row → null* is untested and owed by the `referenceRepository` slice. P3 covers the domain half over 900 runs; my unbounded-day mutant is caught. |
| **AC-5** | Satisfied as written; the assertion is narrower than the criterion — F6. |
| **AC-6** | Satisfied as an **outcome** (zero imports, verified mechanically), unenforced as an **invariant** — F3. |

---

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "src/domain/openingHours.ts", "line": 152,
     "claim": "step 1's Number.isInteger guard does not bound the value to the range new Date() can render, so withinOpeningHours throws an uncaught RangeError rather than returning a verdict, contradicting design §4.2 step 1's stated reason for the check and §2.2's 'everything downstream is total'",
     "scenario": "withinOpeningHours(8_640_000_000_000_000, 8_640_000_000_000_001, 'Europe/London', weekly) throws RangeError: Invalid time value; reachable through the documented composition because instant(8_640_000_000_000_001) returns a valid Instant"},
    {"severity": "MAJOR", "file": "tests/architecture/ambiguity-containment.test.ts", "line": 358,
     "claim": "ADR-0013's narrowed consequence ('a source scan closes it ... by any route') is not delivered: SRC_REFERENCE matches only relative ../src/ climbs, and tests/architecture/ — one of the eight directories outside-in-tests-do-not-import-src covers — is not scanned",
     "scenario": "a tests/property/ file doing `await import(pathToFileURL(join(ROOT,'src/domain/openingHours.ts')).href)` with ROOT from import.meta.url is matched by neither the scan (measured: no match) nor dependency-cruiser (computed import), and both report green"},
    {"severity": "MAJOR", "file": ".dependency-cruiser.js", "line": 48,
     "claim": "the literal AC-6 ruling has no enforcing mechanism: domain-is-pure permits intra-domain imports, layering.test.ts plants its violation outside src/domain/, and the containment scan reads markers rather than imports",
     "scenario": "measured — a fixture in which interval.ts imports durationMillis from ./duration.js cruises clean under the repository's own config ('no dependency violations found'), so a later slice can add that import with every gate green"},
    {"severity": "MINOR", "file": "src/domain/openingHours.ts", "line": 175,
     "claim": "a dealership with closes_at = '24:00:00' — data the CHECK permits and §3.2 argues must be supported — can never take the appointment ending at midnight, because step 4 renders the half-open interval's exclusive endpoint; relatedly, '24:00:00' and '23:59:59' are behaviourally identical since end.secondsOfDay is always <= 86399",
     "scenario": "weekOpen('09:00:00','24:00:00'), 60-minute job starting 23:00 local Monday 2026-06-15 returns {kind:'spans-local-days'}; one second shorter returns 'within'"},
    {"severity": "MINOR", "file": "tests/property/opening-hours-dst.test.ts", "line": 714,
     "claim": "two of the eleven coverage assertions use the >= 1 floor design §5.3 rules out, and both are tautologies: P6 (300 runs) and P7 (400 runs) increment those counters immediately after asserting the very kind they record",
     "scenario": "regressing durationMinutesArb to fc.integer({min:1,max:2}) collapses P1's spans-local-days contribution from ~200 to ~2 and the guard still passes on P6's deterministic 300"},
    {"severity": "MINOR", "file": "tests/architecture/ambiguity-containment.test.ts", "line": 89,
     "claim": "DURATION_LITERAL detects one spelling of duration arithmetic and the planted control plants that same spelling, so the discrimination claim is proved only against what the scanner already looks for",
     "scenario": "measured — `minutes * 60 * 1000`, `minutes * 1000 * 60`, `minutes * 6e4` and a local `const MINUTE_MS = 60 * 1000` are all unflagged, so a future src/application/bookAppointment.ts breaks AC-5 and QS-12 with the scan green"},
    {"severity": "MINOR", "file": "docs/slices/01-domain-policy-core.md", "line": 6,
     "claim": "the slice declares arc42 scope §5.2/§8.3/§12 but the branch changed docs/arc42/10-quality-requirements.md (the §9 and §11 diffs are inside generated markers and are not hand edits)",
     "scenario": "slice:check's arc42-scope gate tests for the field's presence rather than for the diff matching it, so an undeclared arc42 edit merges unnoticed; benign here, and the declaration is the only thing that would catch one that is not"}
  ],
  "mutation": {"score": 0.9806, "survivors": 3},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "All three surviving mutants are genuinely equivalent — I attacked both claims and both stand, the :119 one across 418 IANA zones plus 23 non-canonical forms, the :188 one by exhaustive differential over all 1502 reachable parse outputs. The red is real: eight deliberately wrong implementations built into dist/ were each caught by the committed outside-in suite. Seven findings, none blocking: the code defect is that withinOpeningHours is not total (Number.isInteger admits values new Date() cannot render, so it throws), and the three that matter most are mechanism gaps the architect owns — ADR-0013's src-scan does not cover the route or the directory it claims, the literal AC-6 ruling this whole slice was reshaped around is enforced by nothing, and a dealership open until midnight cannot book the midnight slot. None makes the merged work incorrect, so none is a (c)."
}
```
