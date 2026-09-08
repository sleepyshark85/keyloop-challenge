# Report · slice 10 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 10 step 1 design
- Returned: 2026-09-08T03:44:07.312Z
- Duration: 552s

---

Design committed at `80d278b` on `slice/10-openapi-and-curl-harness` and pushed. No PR opened.

**`/home/agentadmin/sources/keyloop-challenge/docs/slices/10-design.md`** (new) · **`/home/agentadmin/sources/keyloop-challenge/docs/slices/10-openapi-and-curl-harness.md`** (front matter only — `arc42:` gains `§8.5`).

## Is it one slice

Yes. AC-1 and AC-3 are the *same* per-operation walk over one document — the argument the reopening rested on — and the harness half shares the close-out (seed script, README, gate run). The hinge if it ever has to split is measurement M1, not the harness.

## The five

1. **The matrix is a column, not a table.** §8.6's nine-row table already owns status, `type`, when and decided-by; the operation dimension is the only new fact. A second grid re-homes the row key, which is what retiring seventeen ADRs was about. A table with a type axis and an operation axis is a matrix however it is drawn. The column's content is in the design; transposed it deletes `404` from book, `409`+`422` from read and cancel, and `422` from reschedule. `/health` is excluded **by name** with an asserted-empty type set rather than silently.

2. **Equality stays, and widens to `(status, type)` pairs.** A superset check passes on exactly the defect this slice exists to remove — `GET /availability` claiming `vehicle-not-owned`. Pairs rather than types because `malformed-request` drifting 400→422 is drift a type-set misses. Added: the 2xx direction, since a `201` arriving as `problem+json` is §8.6's stated *worse* failure. Cost is bounded — A-7 keeps reference data off the API and §8.6 closes the surface at five.

3. **`R-09-13`: the prose splits.** Contract prose stays at operation level (what it answers, the rule, the consequence — one fact per concatenated literal); the TypeBox rationale goes back to the file docblock where it already is. The querystring object's duplicate `description` is dropped — @fastify/swagger was measured to discard it, so no emitted byte changes and AC-7's `--check` proves that. `D-08-1`'s three mutants go to three AC-7 assertions, and AC-7 must fail when **any one** literal is emptied. **I also corrected AC-7's boundary** (mid-slice AC authority, provisional): `availability.ts` rejects `to <= from`, so the rule is *`to` strictly later than `from`*. As written, AC-7 would have published a rule the code does not implement.

4. **"Runnable from a terminal" = the seed prints the environment.** `npm run harness:seed` emits `export`-shaped lines for the five ids plus a `STARTS_AT`; `eval "$(npm run --silent harness:seed)"` is the whole path. The assertion that makes it fail-able: **the acceptance test drives both scripts from the seed's output only, never from `seedScenario`** — today it supplies the ids from the fixture, which is precisely the test suite the criterion says the harness must not need. Plus a static denylist scan for GNU-only invocations, which proves the named hazards absent, not POSIX purity.

5. **Ownership is tabulated.** `tests/acceptance/harness.test.ts` and `tests/contract/openapi-document.test.ts` → test-engineer (hook-enforced). `harness/*.sh`, `harness/seed.mjs`, `src/http/**`, `docs/api/openapi.json`, `package.json` → implementer. README run section → **scribe** (`CLAUDE.md` §4 — AC-6 names the README and that half is not the implementer's). `harness/` is **unguarded by `guard-paths.mjs`**, so that row is the only thing preventing `T-09-5` a third time.

## Criteria that cannot fail — flagged now

- **AC-2 alone cannot fail a build.** §8.6 is prose and nothing compares its column to the document; its real protection is AC-1. I considered parsing §8.6 from the test and declined — it makes arc42 a machine-readable input and breaks on reformatting. Gate-verified, recorded as debt.
- **AC-6's README half** is a gate item; only the `package.json` scripts and the seed-only environment are mechanical.
- **AC-3 discharges A-06-2's contract half only.** I added **AC-3b** — a `tests/architecture/` set-equality marker over uuid-mint sites, `{src/main.ts}` today — rather than let A-06-2 be declared discharged a third time on an assertion that does not make it. It is a denylist, not a proof.
- **AC-4 and AC-5 are unfalsifiable without negative controls**, and I named one each (`REQUEST_COUNT=1` on a taken slot must exit non-zero; a non-`200` on one of the three *currently unchecked* steps must exit non-zero). The exit code is the primary signal — the current test's occurrence-counting of `201`/`409` in stdout is the test asserting the invariant instead of the script.

Two mechanisms are ruled **measure, do not choose** (`D-09-3`'s precedent): **M1**, whether Fastify's per-response `content` form keeps the serialiser and survives `; charset=utf-8`; **M2**, whether TypeBox collapses a one-member `Type.Union` to `Type.Literal` — which would reintroduce §8.5's silent substitution *inside the fix for it*. No ADR: checked against the human's 2026-09-07 bar and recorded as checked.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [],
  "quality_scenarios": ["QS-11"],
  "assumptions": ["A-10-1"],
  "open_questions": ["OQ-10-1"],
  "dcr_ruling": null,
  "message": "Slice 10 step 1 designed at 80d278b. Ruled: the §8.6 matrix is a new column not a new table; AC-1's equality is on (status, type) pairs plus the 2xx direction; R-09-13's prose splits with D-08-1's three mutants bound to three AC-7 assertions; AC-7's boundary corrected to `to` strictly later than `from`; AC-6 means the acceptance test drives the harness from `harness:seed`'s output alone. Added AC-3b, a uuid-mint set-equality marker, because AC-3 discharges only A-06-2's contract half. Named AC-2 and AC-6's README half as gate-verified rather than mechanical, and two measurements (M1 content-type form, M2 one-member Type.Union collapsing to Type.Literal) that could each reintroduce the exact defect this slice corrects. §8.5 declared in the slice's arc42 field now rather than at step 7. A-10-1 and OQ-10-1 need logging."
}
```
