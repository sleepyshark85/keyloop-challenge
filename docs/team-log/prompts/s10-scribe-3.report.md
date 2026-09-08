# Report · slice 10 · scribe · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Write a run-and-scenarios walkthrough
- Returned: 2026-09-08T12:32:09.203Z
- Duration: 1207s

---

Confirmed clean teardown.

```json
{
  "role": "scribe",
  "outcome": "drafted",
  "files_written": ["docs/WALKTHROUGH.md", "README.md"],
  "claims_without_evidence": [],
  "gaps": [
    "Did not reproduce EXIT_DID_NOT_RUN=2 (no-Docker) live — DOCKER_HOST override didn't actually detach Testcontainers from the real daemon in this sandbox, and deliberately breaking Docker system-wide risked the live service/DB; that case is described from tools/ci/run-tests.mjs source and README's existing citation rather than freshly demonstrated",
    "Did not exercise the DST-transition property (QS-9) or the reschedule-onto-own-interval case (QS-6) by hand — both are property/integration tests already covered elsewhere; the by-hand scenarios stuck to the assessment's named list"
  ],
  "message": "docs/WALKTHROUGH.md is written, committed and pushed to main; every scenario in it (book, both double-booking demonstrations, availability staleness, reschedule success/refused/against-cancelled, cancel-frees-slot, opening hours, unknown/mismatched references, and eight error-taxonomy shapes) was actually run against a live service and the response shown is the response seen. All four doc checks and npm run test:tools are green, and everything started (docker compose, npm start) was torn down."
}
```

Scenarios executed (all of them, nothing skipped from the required list): book; read-back; both double-booking demonstrations (`harness/double-booking.sh` and a by-hand two-racer race, with the `no_bay_overlap` constraint name pulled from the service's structured log); availability queried free then shown stale by a race immediately after; reschedule to a free slot, a refused reschedule with the original confirmed at its original time verified by re-reading the row, and a reschedule of a cancelled appointment (`409 appointment-not-confirmed`); cancel, idempotent re-cancel, and rebooking the freed slot; a booking outside opening hours; an unknown vehicle and a vehicle owned by a different customer; and eight distinct problem `type`s across the closed taxonomy (route-not-found, appointment-not-found, malformed-request ×2, and the unexpected-content-type `500` case).

What did not behave as documented on first pass, reported rather than smoothed over: running `npm test` repeatedly back-to-back on this shared sandbox, the `db` project flaked twice out of roughly a dozen runs — `tests/concurrency/move-never-releases-slot.test.ts` (QS-5) once, `tests/integration/telemetry-booking.test.ts` (QS-13, a span-ordering assertion) once — both under sustained CPU contention from repeated full-suite runs, both passing reliably (6/6) when re-run in isolation. In no run did the exclusion constraint itself permit more than one confirmed appointment for a contended slot; the flakes were in timing assertions, not the invariant. This is recorded in `docs/WALKTHROUGH.md`'s testing section rather than omitted.

Files: `/home/agentadmin/sources/keyloop-challenge/docs/WALKTHROUGH.md`, `/home/agentadmin/sources/keyloop-challenge/README.md`.
