# Report · slice 02 · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Apply the I-02-9 fix
- Returned: 2026-09-05T21:18:18.866Z
- Duration: 125s

---

Applied, agreed with the finding, both follow-ons taken.

## What changed

`/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-bay-overlap.test.ts` and `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-technician-overlap.test.ts`, identically in each:

```ts
).toBe(`1 confirmed / ${String(RACERS - 1)} refused`);
```

One strict equality, not a split. I agree with the implementer's reason over a two-assertion form, and it is the same reason I would have given: `refused` is filtered by every other assertion in both files, and `[].filter(...)` is `[]`, so all four of those pass vacuously when the nineteen losers come back as `500`. This is the only assertion in either file that discriminates on the losers' status, so it has to carry both counts.

## The comment rewrite — taken

The old text told the reader that `"1 confirmed / 0 refused"` with nineteen 500s "is this finding and not a defect in the booking path". You are right that ADR-0018 made that false, and it was the more dangerous half of I-02-9: an unsatisfiable assertion fails loudly, but a comment licensing a 500 fails silently at step 5. It now keeps T-02-9's mechanism (why `40P01` arises at all — index tuple inserted before the scan), then states the current truth: ADR-0018's two class-scoped advisory locks, `40P01` as `no-verdict` ⇒ `500 /problems/internal` and never a `409`, 0 deadlocks across 56 locked races, therefore **a non-201/409 answer means a write path reached `appointment` without those locks — F-02-9's obligation broken, a defect.** The `String(...)` wrapper is in.

## Verified, not assumed

`npm run test:db -- tests/concurrency` — **2 files, 2 tests, passed** against real PostgreSQL. So the assertion is not merely satisfiable in principle; it is satisfied by what is on the branch. Committed `e6e4bec` by explicit pathspec over the two files only; the untracked prompt/log files stayed out.

## Noticed and not touched

One assertion of the same shape, `no-technician-overlap.test.ts:121`:

```ts
`${String(scenario.bayIds.length)} bays seeded, ${String(distinctBays.size)} used`
).toBe(`24 bays seeded, 1 used`);
```

Same two-renderings-of-one-fact construction, but here both sides carry the words, so it is satisfiable and it passes. I raise it as an observation rather than a finding: the `24` is a literal where the left side derives from `scenario.bayIds.length`, so if the fixture's bay count ever changes the assertion fails on the seeded count rather than on the thing it is about (bays being plentiful). That is a fragility, not a defect, and it is arguably correct as written — the literal pins the fixture the case was designed for. I have not changed it and would want it argued rather than quietly repaired.

Nothing else in the four directories I own compares a labelled rendering against an unlabelled one — I checked every `.toBe(\`` in `tests/{acceptance,contract,property,concurrency,integration}`; those three lines are the complete set.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-1", "QS-2"],
  "red_commit": "e6e4bec",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "I-02-9 applied to both concurrency files as one strict equality naming both counts, and the comment above it rewritten — it claimed a client-visible 40P01 was an expected finding, which ADR-0018's locks made false and which would have led the reviewer to read a 500 as expected. Both files verified passing against real PostgreSQL. One same-shaped but satisfiable assertion at no-technician-overlap.test.ts:121 is raised, not repaired."
}
```
