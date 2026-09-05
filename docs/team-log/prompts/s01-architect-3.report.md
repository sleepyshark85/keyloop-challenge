# Report · slice 01 · architect · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 01 step 7 as-built
- Returned: 2026-09-05T06:03:17.984Z
- Duration: 462s

---

Done. Reconciliation committed at `3cd2cf1` on `main`.

## As-designed vs as-built delta

**There was essentially no implementation drift.** `src/domain` matches the step-1 design's *amended* signatures character-for-character. The entire delta is between **arc42 as it stood at Gate B** and **what merged** — because arc42 was never touched during the slice except for §9/§11's generated blocks and the F-01-1 QS-9 correction at step 1.

| | arc42 at Gate B | As built at `f661988` |
|---|---|---|
| `appointmentInterval` | `(startsAt: Instant, minutes: DurationMinutes)` — brand crosses the module boundary | `(startsAt: Instant, durationMillis: number)` |
| `withinOpeningHours` | `(interval: Interval, ianaZone, weeklyHours)`, boolean | `(startsAtMillis, endsAtMillis, ianaZone, weekly)`, seven-variant `OpeningHoursVerdict` |
| ordered/finite endpoints | guaranteed by the `Interval` type | runtime check, verdict `malformed-interval` (step 1 of six) |
| composition order | enforced by the brands | written out in `src/application` (D-01-1) |
| `domain-is-pure` | `to: { pathNot: '^src/domain/' }` | `to: {}` — the `pathNot` *was* an allowlist for exactly the class AC-6 forbade |
| `duration-arithmetic` marker | the literal `60_000` | a concept with a six-row open spelling set (R-01-6) |
| `interval.ts` exports | `appointmentInterval`, `occupancyInterval` | plus `instant()` and the `Instant` type |

## Things that drifted with nobody noticing

Found by reading arc42 against the tree rather than against the slice file:

1. **`docs/arc42/05-building-blocks.md` §5.3 still says "40 modules cruised"**. `npm run lint:arch` reports **54**. Drifted at slice 01; nothing gates it.
2. **`docs/arc42/08-crosscutting-concepts.md` §8.5's `tests/property/` row says it runs against `src/domain` and real PostgreSQL.** ADR-0013 falsified both halves: property tests reach the **built artifact** under `dist/`, never `src/`, and `tests/property/` splits by whether the property needs a database. §8.5 carries **none** of ADR-0013's three clauses.
3. **`docs/arc42/07-deployment-view.md` §7.2 and §7.4 still describe the test invocation as `npm run test:nodb` / `npx vitest run --project db`, with `npm test` implied to be a single `vitest run`.** As built it is `tools/ci/run-tests.mjs` — two separate invocations, merged, with a project that did not run exiting `EXIT_DID_NOT_RUN = 2` rather than merging as zero failures. This is the T-01-2 **(c)** ruling naming §2.4, and §7.4's own paragraph about §2.4 sits three lines from the stale text.
4. **§10.2's closing paragraph still read "Two directories in this table need an ownership ruling."** Ruled at Gate B on 2026-09-04; drifted at 00a and rode through slice 01. Inside my declared scope, so **corrected**.
5. **§11.1's prose said "The single entry above is the first genuine one"** over a register that now holds five. **Corrected**, and it now states that a merge is not a ratification.

## Could not fix inside my declared scope

Items 1, 2 and 3 above. §5.3, §7.2, §7.4 and §8.5 are **outside** `arc42: ["§5.2", "§8.3", "§10.2", "§12"]`, and taking them is what R-01-7 was raised about. **Please route them.**

One correction to your brief: your point 3 said *"if §8.3 (declared scope) still describes the old invocation."* arc42 §8.3 is *Time, zones and the calendar* and never described a test invocation — that was the **slice design's** §8.3 ("What fails, and why it is an assertion failure"), which is where T-01-2 landed. The arc42 home for the `run-tests.mjs` facts is §8.5, per the slice design's own §12.1 ledger, and §8.5 is undeclared. So the T-01-2 reconciliation is the one piece of your list I could not place.

## Verification

`npm test` (nodb 12 files, db 3 files, both exit 0) · `npm run lint:arch` (54 modules, 0 violations) · `npm run docs:build` + `docs:check` (current, 15 ADRs, 5 deferred) · `npm run log:check` (242 records, 0 invalid). Committed by explicit pathspec — `events.jsonl` and `docs/team-log/prompts/` left untouched in the working tree.

No ADR status was flipped. 0013, 0014 and 0015 remain `proposed`.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§5.2", "§8.3", "§10.2", "§11.1", "§12"],
  "adrs": [],
  "quality_scenarios": ["QS-9", "QS-10", "QS-12"],
  "assumptions": [
    "§12 glossary is headed 'Owner: scribe' but was declared in slice 01's arc42 scope; the twelve domain terms were applied and marked as as-built records, leaving the phase-6 pass to the scribe"
  ],
  "open_questions": [
    "Route §5.3 (40 vs 54 modules), §7.2/§7.4 and §8.5 (npm test is tools/ci/run-tests.mjs; tests/property/ reaches dist/ not src/; ADR-0013's three clauses absent from §8.5) — all outside the slice's arc42 declaration",
    "OQ-01-1 and OQ-01-2 from the slice design remain open and are unaffected by this reconciliation"
  ],
  "dcr_ruling": null,
  "message": "arc42 now describes what merged rather than what was designed: §5.2 carries the as-built domain signatures and an as-designed/as-built table for the literal AC-6 ruling, §8.3 the six-step decision order and the measured 2026 transitions, §10.2 what QS-9 and QS-12 actually assert, §11 D-01-1..D-01-4 with D-01-2's first concrete instance plus both scan residues. Three sections needing the same treatment fall outside the slice's declaration and are reported rather than taken."
}
```
