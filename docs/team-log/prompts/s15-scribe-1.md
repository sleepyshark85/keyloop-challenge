# Prompt · slice 15 · scribe · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 15: WALKTHROUGH and README
- Sent: 2026-09-09T18:24:13.556Z

---

Slice 15 passed review and the architect has finished step 7. Two documents are yours under CLAUDE.md §4 and both are outstanding. Branch `slice/15-seed-fixtures-and-capacity-harness`, PR #23, head `86542a2`. **You are the last work before the merge.** Every claim must cite an artifact — you record what happened, not what was intended.

Read `docs/slices/15-seed-fixtures-and-capacity-harness.md`, `docs/slices/15-design.md` (now the as-built record), the new `docs/adr/0038-the-harness-fixture-carries-data-never-schema.md`, arc42 §3.1 (`docs/arc42/03-context-scope.md`) and §11.1's `R-11` and `D-15-1`…`D-15-5`, plus the PR comments. `harness/fixture.json`, `harness/seed.mjs` and `harness/spurious-refusal.sh` are the artifacts.

**What the slice made true.** `harness/seed.mjs` now seeds from a declared JSON fixture — validated before a single `INSERT`, inside a transaction — and seeds **two** dealership subtrees: a *scarce* one at the empty export prefix, reproducing the old demo's world unchanged, and an *abundant* one under `CAPACITY_`. `harness/spurious-refusal.sh` fires *N* concurrent bookings at *M* capacity and asserts exactly `min(N, M)` confirmations on `min(N, M)` distinct bays and technicians, taking *M* from the **exported declared counts**, never from the answers it received.

**Obligation 1 — `docs/WALKTHROUGH.md:300` is stale, not merely incomplete.** It tells the reader to *"seed a second dealership for a second customer/vehicle pair, then mix them"* and uses `$OTHER_CUSTOMERS_VEHICLE_ID`, a variable **nothing exports**. AC-10 is the criterion that retired that manual step. Replace it with the fixture's own `VEHICLE_ID_2` / `CUSTOMER_ID_2` from a single `eval "$(npm run --silent harness:seed)"`. Do the same for the unqualified-service-type case: `SERVICE_TYPE_ID_2` is `detailing`, seeded with **no** qualified technician at the scarce dealership, so it answers `422 /problems/unknown-reference` — arc42 §8.6's *"a service type no technician there is qualified for"* row, previously reachable only by inventing a random uuid.

**Obligation 2 — a new scenario for `harness/spurious-refusal.sh`.** It sits beside Scenario 2, and the contrast is the point: Scenario 2 shows *we never double-book* (10 racers, one bay, exactly one wins); this one shows *we never refuse you while a bay is free*. **It must state what it does not prove**, citing the as-built: neither the counts nor the distinct bays can discriminate a genuinely contended run from an accidentally serialised one, because contention here is over **persisted rows, not instants** — distinctness is implied by the exclusion constraints under any interleaving. `tests/concurrency/no-spurious-refusal.test.ts` remains the evidence; this is a demonstration of it. Do not let the scenario imply otherwise.

**Obligation 3 — §"Before you start".** Its *"one bay, one qualified technician"* description is now the **scarce subtree only**; the seed also exports a `CAPACITY_`-prefixed abundant one. Cite ADR-0038 and arc42 §3.1 for why the fixture carries data rather than schema.

**Obligation 4 — `README.md`.** Name `harness/spurious-refusal.sh`. **No `harness:*` npm script was added, deliberately**, so slice 10's README set-equality test stays green — do not add one and do not imply one exists.

**Run it before you write it.** `docker compose up -d`, `eval "$(npm run --silent harness:seed)"`, start the service, then run both scripts and follow your own instructions end to end. Paste real output, not invented output. Expect 10 racers → exactly 3 confirmed, 7 refused, 3 distinct bays, 3 distinct technicians. **If a step does not behave as described, say so in your report rather than writing around it** — the last scribe on this project found two such things (Tempo's tag search returning empty for a trace that exists, and the metrics reader's ~60s interval) and recording them was more valuable than the prose around them.

**One thing you should know and may judge worth a line.** `D-15-5` records that this is the one slice whose deliverable is a runnable demonstration and **no human has run it** — the human delegated the merge, unlike slice 14 where they observed the Loki/Tempo join in Grafana. The only end-to-end runs are agents'. You are about to become another one. That is the architect's booking, not yours to repeat unless it earns its place.

Constraints: edit only `README.md` and `docs/WALKTHROUGH.md`. Check `npm run docs:refs` and `npm run docs:budget:check` before committing. Commit `docs(15): …`, push, and post a PR comment opening with a **leading bold role** — `**scribe** · …` on its own line; the check is case-sensitive and refuses italics. Do not merge.

Report what you wrote, what you actually ran, and anything that did not behave as specified.
