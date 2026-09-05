# Report · slice 02 · architect · invocation 9

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule I-02-9 and four design items
- Returned: 2026-09-05T21:15:42.145Z
- Duration: 696s

---

Ruled and committed at `3e251e6`. Nothing in `tests/`, `src/`, the slice file or `docs/team-log/` was touched, and I did not edit arc42 — step 7 is when arc42 is corrected to as-built, so the four rulings went into `§10`'s proposal block instead.

## I-02-9 — **(a) clarification. No loopback. The slice stays at 1 of 2.**

The assertion cannot pass for *any* implementation, correct ones included: the left side always carries the words *confirmed* and *refused*, the right side never does. It was red at `34b057b` for the right reason (`0 confirmed / 0 refused` vs `1 / 19`), so the defect hid behind a true failure — the one blind spot a red commit has by construction.

(c) obliges me to name an AC, a `QS-*` or a §2 invariant that **the work** would fail. None does — the implementer's reproduction gives 1 confirmed, 19 × `409`, **0 non-201/409 responses**, `resource` `bay`/`technician`, `attempt` `["1"]`/`["1","2"]`. AC-3, AC-4, QS-1, QS-2 and §2.1 are met. It is not (b) either: (b) merges as-is and this cannot, because the file is not improvable, it is unsatisfiable. The design is right and one artifact's expression of it is wrong — (a) exactly. (a) resumes from the raising step; only (c) returns to step 1.

The exact line, for the test-engineer to apply in both `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`:

```ts
).toBe(`1 confirmed / ${String(RACERS - 1)} refused`);
```

One strict equality, not two assertions — the implementer's reason is better than a split: every other assertion in both files filters `refused` and passes **vacuously** on an empty list, so this is the only one that fails when the losers get the wrong status. Two editorial follow-ons, theirs to take or leave: the comment above it still tells a reader a `40P01` reaching the client "is this finding and not a defect in the booking path", which ADR-0018 made false and which would mislead the reviewer at step 5; and the `String(...)` wrapper is what the file's own lint rule requires.

## The four — all AGREE, all corrections to *my* text, no new ADR

1. **`deriveInterval(millis, serviceType, dealership)`.** I verified the containment argument rather than accepting it: `grep -rlE '\b(time_zone|ianaZone)\b' src` returns exactly the four `ZONE_TRANSPORT_FILES`, and `bookAppointment.ts` is not among them. But the struct **must not stand on that** — choosing a signature to satisfy a scan is how a measurement starts writing the design. It stands on coupling: a zone and a weekly schedule are one fact about one dealership, and splitting them is how a caller pairs one dealership's hours with another's zone. Absent that, the right remedy would have been to change the list.
2. **§2.4 was wrong and it was mine.** It predates T-02-9 by one step. The rule it was reaching for survives verbatim and is what it now says: *no transaction wraps the **loop***.
3. **`lockResources` in `appointmentRepository.ts`.** A `lockRepository.ts` would be a lock importable from anywhere, making F-02-9's obligation easier to skip, not harder; and it puts the two calls that must share one transaction handle in one file.
4. **Two `EXISTS`.** The FK is `(vehicle_id, customer_id) REFERENCES vehicle (id, customer_id)` and has just fired with both rows present — the third sub-select's only reachable answer is `false`. §5.3's three properties all survive; *three* was a count, never a mechanism.

## The two judgements

**Commit size — agree on two, disagree in part on one.** §7's ~150 is a heuristic; the clause with force is *every implementer commit is green*, and that forecloses splitting `bookAppointment.ts` from its outcome union (the first commit would not compile) and splitting the edge (commits that compile and assert nothing). **The three repositories were three independently green commits and I would have taken that split.** I also measured the mitigation instead of accepting it: comment lines are **37%, 37% and 29%** of the three headline modules, not "roughly half", so net production code is ~270–320 lines per commit — still about twice the heuristic. The remedy is **not** a rebase: history is already bisectable and green. Recording it as a finding rather than defending it is the correct behaviour, and I want that on the record separately from the verdict.

**AC-6 — the reading is right, for a sharper reason than "one leg is redundant".** The surviving `additionalProperties: true` mutant is the **measurement** of §2.7's claim of *two independent reasons, one of which is structural*: unstripped, the property reaches the handler and nothing changes, because `BookCommand` has no member for an end. Two limits so it is not over-claimed — the reading is scoped to AC-6 (`additionalProperties: false` stays load-bearing for the request contract and ADR-0005's emitted OpenAPI; a survivor is not a licence to weaken the code), and it holds only while nothing downstream reads the raw body. AC-6 therefore asserts a behaviour satisfied **by construction**, which is stronger than validation, and its test can still go red the moment someone plumbs an end into `BookCommand`.

## Escalation

**Nothing in this batch would have escalated under the pre-amendment rule.** I-02-9 is a defective assertion; 1, 3 and 4 are interfaces and decomposition, which §6 gives me outright; the AC-6 reading changes no criterion's wording. Item 2 touches an AC only as an aftershock — §2.4 is stale *because* AC-5 was amended, and amending AC-5 is the one thing here that would have gone to the human. That already escalated at T-02-9 one step earlier and is already listed as provisional for the gate. The delegation bought this batch nothing it could not have had; the ruling it bought was T-02-9's.

## Budget

`docs/slices/02-design.md`: 3,942 words added, 3,176 removed, **net +766** on a file already 8,381 over. Cut: T-02-9 and E-02-2 condensed now ADR-0018 and the merged marker split are the record; §3 sequencing (spent); §12's prose down to the disagreements and the loopback ledger; §4.2 and §8 deduplicated against §12 and ADR-0018; §6 reduced to the named mutants the DoD asks for; §2.5's purity prose deleted where `deriveInterval.ts`'s docblock carries it verbatim; E-02-3 and §4.4 condensed now both are built. §10 and §12's table (~1,020 words) become deletable at step 7 when arc42 absorbs them.

`lint:arch` clean (81 modules), `test:tools` 0 failures, `docs:adr-check` 18 ADRs, `docs:budget` run.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11", "QS-12"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": "a",
  "message": "I-02-9 ruled (a): both concurrency tests compare two renderings of the same fact, an assertion no implementation can satisfy; the one-line fix is named for the test-engineer and no loopback is consumed, so the slice stays at 1 of 2. All four flagged divergences are AGREE and are corrections to my own text rather than departures from it — no new ADR, and only §2.4's stale transaction rule touches an acceptance criterion, as an aftershock of the AC-5 amendment that already escalated at T-02-9."
}
```
