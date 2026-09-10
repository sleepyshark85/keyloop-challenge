# Report · slice 15 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 15 step 2: agree or object
- Returned: 2026-09-09T16:48:46.510Z
- Duration: 318s

---

I read `docs/slices/15-design.md` (633737b), `docs/slices/15-seed-fixtures-and-capacity-harness.md` (d79679b), the current `harness/double-booking.sh`, `harness/seed.mjs`, `tests/acceptance/harness.test.ts`, `tests/concurrency/no-spurious-refusal.test.ts`, `docs/WALKTHROUGH.md`'s Scenario 2 transcript, `docs/adr/0009-*.md`, and `src/platform/config.ts`'s `DB_POOL_MAX` (grepped only, not opened as `src/` review — noted for completeness, not relied on for any AC judgment). No other `src/` file was read.

**Verdict: OBJECT** — one substantive point (A-15-1's stated rationale). Everything else: AGREE, with two corrections to the doubts raised in the prompt and one non-blocking observation.

**A-15-1 — OBJECT.** The cited evidence (`docs/WALKTHROUGH.md`'s captured `double-booking.sh` transcript: racer 4, not racer 1, wins) is real and does support that the background-`&`-then-`wait` shape interleaves rather than strictly serialising at the process level — I agree that shape carries over correctly to `spurious-refusal.sh`. But I disagree with the design's specific claim that "if they serialise, AC-4 still passes … and only AC-5's distinctness would notice." Under a correct implementation, ADR-0009's prune-and-retry allocator is built to make the *final* state independent of timing: a fully serialised run of the same N requests against the same M-capacity subtree fills free bay/technician pairs via the identical retry logic and produces the same confirmation count *and* the same distinct-bay/distinct-technician assignment as a genuinely concurrent run. Neither AC-4's count nor AC-5's distinctness can distinguish "genuinely contended" from "accidentally serialised but correctly handled" — this is a stronger form of the limitation the design already names for ADR-0004's rejected mutex (a terminal script sees responses, not the log stream). Proposed remedy (not applied): correct the "Known limits" wording in both the slice file and 15-design.md to state plainly that no response-only assertion discriminates this, and that the demonstration's credibility for A-15-1 rests on the cited transcript evidence alone, not on anything AC-4/AC-5 newly prove. This doesn't block writing AC-4/AC-5 as specified — I can commit them red exactly as designed — so it reads to me as outcome (a), a clarification, not (c).

**AC-6 as "the control" — AGREE**, with an observation. It genuinely proves the script's exit code is driven by what it counted rather than hard-coded (the same precedented shape as slice 10's own AC-5/AC-6 for `double-booking.sh`), and the design is candid that it "needs no fault injected into the service" — i.e. it tests the script's arithmetic, not the service. AC-7 (full-capacity racers, zero confirmations) is the control that could actually fail on a broken allocator without fault injection, and it's already in the design. The design's phrasing ("this is what makes AC-4 an assertion") slightly undersells AC-7's role, but that's editorial, not a blocker.

**AC-2 — AGREE, confirmed feasible.** My test can connect via `inject('databaseUrl')` against the same shared Testcontainer `seed.mjs`'s `DATABASE_URL` points at, and query `service_bay`/`technician`/`technician_qualification` scoped by the exported `CAPACITY_DEALERSHIP_ID`/`CAPACITY_SERVICE_TYPE_ID` — the identical pattern `harness.test.ts` already uses for AC-5's "the database agrees" assertion.

**AC-3 — AGREE**, as scoped, plus a non-blocking observation. All five listed failure classes are validator-catchable from the JSON alone before any `INSERT`, so "validate first" is genuinely atomic for AC-3's own cases — no objection there. Separately: "validate first" is not atomicity in general — a mid-`INSERT` Postgres error (or dropped connection) could still leave a partial world in the shared, never-truncated container, and neither AC-3 nor any other AC claims otherwise. This is a pre-existing property of `seed.mjs` (today's 9 hand-written inserts have the same gap, unaddressed by slice 10), not a regression this slice introduces, so I'm not objecting — just naming it. A single transaction around the insert sequence would close it cheaply; that's the implementer's/architect's call, not mine to require.

**AC-8's third guard vs. the "(8,20)" test case — AGREE with the design, and I think the doubt is unfounded.** I read `no-spurious-refusal.test.ts`'s `CELLS`: `m` is *both* the bay count and the qualified-technician count (`seedScenario(..., { bays: m, technicians: m, customers: n })`). So "(8,20)" is N=8 requests against M=20 bays *and* 20 technicians — B=T=20, not B≠T. QS-3 never exercises B≠T anywhere; the guard is about `BAY_COUNT` vs `QUALIFIED_TECHNICIAN_COUNT` (B vs T), which is orthogonal to N vs M. There is no inconsistency — the harness refuses a shape the test suite never touches.

**Red set (AC-1–AC-8, AC-10 red; AC-9 the passing exception) — AGREE.** Matches what I'd expect to author in the one red commit; AC-9 needs no new test from me since it's the reviewer's `git diff --stat` check against files I'm not touching.

No file was written or edited. Findings above are for the architect's adjudication before step 3 (red).

**Report:**
```json
{
  "role": "test-engineer",
  "outcome": "objected",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-3"],
  "red_commit": null,
  "ci_failure_confirmed": null,
  "objections": [
    "A-15-1: the design's claim that a serialised run would still be caught by AC-5's distinctness assertion is incorrect — ADR-0009's retry/prune allocator makes final state (count and distinctness) identical under serial and concurrent execution in a correct build, so neither AC-4 nor AC-5 can discriminate genuine contention from accidental serialisation. Proposed remedy: correct the 'Known limits' wording in 15-design.md and the slice file rather than claim AC-5 'would notice'; the existing WALKTHROUGH.md transcript (double-booking.sh, racer 4 wins) remains the only evidence for A-15-1, and this slice's tests don't add to it."
  ],
  "dcr": "requested — one clarification point (A-15-1 wording), does not block step 3",
  "message": "Agree the ACs are assertable black-box and the red set is correctly scoped; the AC-8 guard is consistent with the test suite (the (8,20) cell has B=T=20, not B≠T, so no inconsistency exists). One objection: the design overclaims what AC-5 could detect about A-15-1 — no response-only assertion can, given the allocator's timing-independence."
}
```
