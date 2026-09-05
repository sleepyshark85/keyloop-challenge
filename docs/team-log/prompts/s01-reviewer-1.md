# Prompt · slice 01 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 01 step 5 — review
- Sent: 2026-09-04T20:00:50.981Z

---

You are the reviewer at **step 5 (Review)** for **slice 01 — the domain policy core**. Branch `slice/01-domain-policy-core`, PR #10. Scope marker `{"slice":"01"}`.

You are the first role on this slice who wrote none of it. Everything below has been argued into shape by roles with a stake in the outcome, and two of them already found real defects in a third's work. Your job is to find what all of them missed.

## State

`npm run slice:check 01` — Definition of Done 5 of 7 PASS. Outstanding are step 7's arc42 reconciliation and the human's Gate E, which is correct entering step 5.

```
test-first proven     PASS   red at 19:03, green after
tests green           PASS   CI 33913771072 success
mutation ≥ 0.75       PASS   0.9806 on changed files
layering clean        PASS   54 modules cruised, every root covered
loopbacks             1 of max 2
```

The red is `0550d09`, observed red in CI run **33911677881** (`nodb ran, 9 files, exit 1` / `db ran, 3 files, exit 0`), with `red-proof` reporting *"red observed … no unit test failed."* Verified from a clean `dist/`: 19 failures, **every one an `AssertionError`** inside a collected test body, zero import/collection/hook errors.

## Read

- The diff `1712f1f..HEAD` — six implementer commits, `src/domain/{duration,interval,openingHours}.ts` and `tests/unit/domain/*`.
- `docs/slices/01-design.md` as amended (`143b500`, `fb3ff83`), and `docs/slices/01-domain-policy-core.md` — six ACs, the human's.
- `docs/adr/0013-outside-in-tests-exercise-the-built-artifact.md` — **`status: proposed`, revised in place pre-ratification**. It reaches the human at Gate E on your reading of it.
- `docs/DEFECTS.md` — 67 findings.
- `docs/team-log/phase-4-retro.md`, *"The finding that is not a criterion"*, and its rule: **for a discrimination claim, name the mutant; for a mechanism claim, name the call site.** This slice has already produced three instances of that shape.

## What this slice's history means for your review

- **The human ruled AC-6 LITERALLY.** `src/domain` imports nothing at all, intra-domain included. I verified mechanically: zero `import`/`from`/`require` in `src/domain/*.ts`, depcruise clean. Check that the *consequences* were actually absorbed rather than worked around — `malformed-interval` and property P7 exist only because of that ruling.
- **T-01-2 was ruled (c)** against the architect's own design, naming §2.4. The remedy is `tools/ci/run-tests.mjs`. Its behaviour is now load-bearing for every future red in this project.
- **The three-file split now rests on the containment criterion alone.** The architect's own words: *"the split no longer justifies itself"*, and `interval.ts` is the file that feels it. That is recorded in §11 as the price of a ratified decision. Judge whether it is still the right shape.

## Your specific deliverables

**1. The three surviving mutants — this is the headline.** The implementer reported them rather than writing tests shaped to kill them, which is what it was asked to do. But its unreachability arguments are **reasoned claims by the role that wrote the code, and nobody who did not write it has checked them**:

```
openingHours.ts:119  OptionalChaining    parts.find(p => p.type === type).value
openingHours.ts:119  StringLiteral       "Stryker was here!"   (the ?? '' fallback)
openingHours.ts:188  ConditionalExpression -> false
```

- :119 — claimed unreachable because the fixed `Intl.DateTimeFormat` options guarantee every requested part is present.
- :188 — claimed a genuine **equivalent mutant** because `parseTimeToSeconds` never returns a negative number, so the mutated and original branches produce identical verdicts.

An equivalent-mutant claim is the strongest claim available about a survivor and the easiest to assert without proof. **Attack them.** If :119's is right, name the `Intl` configuration that guarantees it and try to construct a locale or option set that breaks it. If :188's is right, prove the value domain rather than restating it. If either is wrong, it is a real test gap in the file carrying this slice's entire DST rule.

**2. T-01-3, deferred to you.** The test-engineer excluded `tests/architecture/` from ADR-0013's `src`-reference scan, because a raw-text scan cannot tell a violation from that directory's legitimate fixture strings — two false positives, measured. Sound judgement, and it is a mechanism the design left to it. **But ADR-0013's consequences were narrowed from "review alone closes this hole" to "a source scan closes it" on the strength of that scan existing, and it turns out not to cover the directory it lives in.** Does the narrowing still hold? You are the "review" the original wording meant.

**3. Verify the red was real, not merely recorded.** The test-engineer built a throwaway reference implementation in gitignored `dist/`, confirmed all 31 tests pass when correct, hand-mutated P1/P3/P4/P6 and confirmed each was caught, then deleted it. That is a strong claim about test discrimination. It is also unrepeatable from the record. Judge whether the committed tests would actually catch a wrong implementation — you can build your own.

**4. The property test's coverage guard.** Design §5.3 required minimum counts sized so a broken stratum fails reliably, replacing a `> 0` floor that would pass ~29% of the time under a broken generator. Check the floors are actually sized to do that, and that the generators reach the DST boundaries rather than merely being able to.

**5. Discipline.** Commit shapes per §7, test-ownership per §5 (I verified no crossing, verify me), one red commit, every implementer commit green.

**6. AC-by-AC.** Six criteria. AC-5's containment and AC-6's purity are asserted by tests the test-engineer wrote — check they assert what the criteria say, not what was convenient.

## How to report

- **Every finding needs a concrete failure scenario.** C3 counts style-only findings, and findings without a scenario, as failure.
- **If you find nothing, say so explicitly and report the mutation score** — that is the criterion's other branch, and it is a legitimate outcome. But note that a reviewer with no findings is read the same way §6 reads an adjudication round with no disagreement.
- You may block a merge and raise a DCR. **You may not change the design** — a design problem is raised, not fixed. **This slice has used 1 of its 2 loopbacks; a third (c) auto-escalates to the human.**
- Do not write to `docs/team-log/`, do not push, do not comment on the PR, do not edit `src/` or any test.

Return findings with severity, file, claim and scenario each.
