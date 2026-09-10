# Report · slice 19 · test-engineer · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Remedy R-19-4 and R-19-7
- Returned: 2026-09-10T12:07:25.991Z
- Duration: 353s

---

Done. Summary of the work:

**File touched:** `/home/agentadmin/sources/keyloop-challenge/tests/integration/telemetry-booking.test.ts` (only file in my commit `eb10625`, pushed to `slice/19-attempt-cap-sized-against-occupancy`)

**R-19-4 (MAJOR)** — in leg (i)'s test (`QS-13(i) / AC-8 leg (i)`, the `it` at ~line 402), after the existing `insert?.statusCode).not.toBe(2)` assertion I added three `expect`s on the same `insert` span, against the collector:
- `insert?.attributes['db.sqlstate']` → `.toBeUndefined()` — a succeeding attempt span must carry no `db.sqlstate` at all
- `insert?.attributes['booking.attempt']` → `.not.toBeUndefined()`
- `insert?.attributes['bay.id']` → `.not.toBeUndefined()`
- `insert?.attributes['technician.id']` → `.not.toBeUndefined()`

What this now catches that it wouldn't have: a change that stamps `db.sqlstate` onto a successful insert span, or drops `booking.attempt`/`bay.id`/`technician.id` from it, on the actual OTLP export path — previously that class of regression only failed (or didn't) in-process at `attemptLoop.test.ts:183-187`/`:216`, which is exactly the silent descent ruling 15 refused for leg (iii) and that had crept into leg (i) unnoticed. I wrote four separate `expect`s (matching leg (ii)'s established per-attribute style at L502-509 for consistency) rather than exactly three as the finding estimated — the substantive restoration (sqlstate absence + all three attribute presences) is what matters and the finding didn't ask for a specific expect count, just that the claims be restored.

**R-19-7 (MINOR)** — in leg (i)'s "no `booking_conflicts_total` point" test, added a guard before the absence assertion: `expect(run.collector.spans().length, ...).toBeGreaterThan(0)`, matching the house pattern already used at the `AC-5` absence test (L756-760, now shifted by my insertion). What this now catches: a metric pipeline that silently exported nothing at all would previously pass the "zero `booking_conflicts_total` points" check vacuously; now it fails the guard first.

**Other AC-8 losses:** I diffed the full old file (`git show e1d925a~1`) against the current one, section by section (legs i/ii/iii, the 500-fault AC-6 test, the AC-5 not-confirmed test, and the two log-content AC-6 tests) — found nothing else dropped beyond the two the reviewer named. Leg (iii) not inspecting insert spans is intentional per design ruling 15 (its job is specifically the `absorbed` metric claim), which the reviewer already cleared separately.

**Verification:** `npx tsc --noEmit` clean; full `npm test` (nodb/db/perf, 64 files) exit 0 against the current working tree (including the implementer's concurrent `src/`/`tests/unit/` changes). Pulled before committing, no new commits on origin, pushed cleanly. PR comment posted at https://github.com/sleepyshark85/keyloop-challenge/pull/27#issuecomment-5618416212.

I did not touch `tests/unit/`, did not read `src/`, and did not `git add` `docs/STATUS.md`, `docs/team-log/`, or `docs/DEFECTS.md`.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": ["QS-13"],
  "red_commit": null,
  "ci_failure_confirmed": null,
  "objections": [],
  "dcr": null,
  "message": "Restored R-19-4's three (four, by the file's own per-attribute style) export-path expects on leg (i)'s succeeding insert span and R-19-7's spans().length guard on leg (i)'s absence claim; full test suite green, pushed as eb10625, PR comment posted."
}
```
