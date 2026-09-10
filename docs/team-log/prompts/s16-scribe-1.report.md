# Report · slice 16 · scribe · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 16 walkthrough update
- Returned: 2026-09-10T02:14:51.013Z
- Duration: 151s

---

Committed cleanly, touching only `docs/WALKTHROUGH.md`. Not pushing, per instructions.

## Summary

**What I changed:** `docs/WALKTHROUGH.md` Scenario 3 only. The `curl` now sends `startsAt` instead of `from`/`to`; every response body in the scenario is output I actually captured just now, not composed — the `200` naming its own derived `startsAt`/`endsAt`, the concurrent-booking race (`201`/`409`), and the re-query showing the bay gone. I also added a one-line note to the document's opening dateline recording that Scenario 3 was recaptured against `b6c1eac` on 2026-09-10 (slice 16), and kept the "advisory, can go stale" claim intact per instructions — only reworded to say *whose* interval it now is.

**Commands run, and their real output** (against `postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop`, service rebuilt and restarted on this branch — confirmed the old `node dist/main.js` process, pid 442601, running since 06:56 that morning, was pre-slice-16; killed it, ran `npm run build`, restarted with `PORT=3000 npm start`):

- `curl` with old-style `from`/`to` → `400 /problems/malformed-request`, `"detail":"querystring must have required property 'startsAt'"`.
- `curl` with `startsAt=2026-09-11T09:00:00.000Z` → `200`, body `{"startsAt":"2026-09-11T09:00:00.000Z","endsAt":"2026-09-11T10:00:00.000Z","bays":["b497bda4-..."],"technicians":["a7a25363-..."],"advisory":true,"disclaimer":"..."}`.
- Two concurrent `POST /appointments` at that `startsAt` → one `201` (id `2f5099c8-...`), one `409 /problems/no-capacity`.
- Re-query of the identical `startsAt` → `200` with `bays:[]`, `technicians:[]`.
- `npm run docs:budget:check` → exit 0 (word-budget ratchet unaffected).

**Found and deliberately left alone:** the six other hard-coded `2026-09-09T…` instants in Scenarios 4–8 (Scenario 3's was the seventh, and rewriting its `curl` incidentally settled that one) — per the task, these are a separate, already-reported concern (human found 2026-09-10) and not this slice's to fix. Also checked and left alone: line 389's claim that `GET /availability` answers the same `422 unknown-reference` shape as booking for an unknown dealership — unaffected by this slice, still accurate. Did not touch `docs/slices/`, `docs/adr/`, `docs/arc42/`, `docs/team-log/`, `src/`, `tests/`, or `harness/`.
