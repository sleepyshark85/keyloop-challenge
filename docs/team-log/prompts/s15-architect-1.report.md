# Report · slice 15 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 15 design: seed fixtures and capacity harness
- Returned: 2026-09-09T16:42:15.404Z
- Duration: 492s

---

Design committed at `633737b` on `slice/15-seed-fixtures-and-capacity-harness`. No PR exists yet for this slice, so no PR comment was posted — I'll post the §9 comment when the orchestrator opens it.

**`/home/agentadmin/sources/keyloop-challenge/docs/slices/15-design.md`** (2,858 words, under the 3,000 in-flight budget; `docs:budget:check` and `docs:refs` green).

## The trap, ruled

**Ruling (C): two subtrees, two scripts, and slice 10's exported names preserved *by construction*.** The fixture declares a **scarce** subtree — exactly today's shape, 1 bay, 1 qualified technician, `exportPrefix: ""` — and an **abundant** one under `CAPACITY_`. Because exports are derived mechanically as *first-of-each, unprefixed*, the scarce subtree reproduces `DEALERSHIP_ID`/`SERVICE_TYPE_ID`/`CUSTOMER_ID`/`VEHICLE_ID`/`STARTS_AT` identically. `harness/double-booking.sh` and `tests/acceptance/harness.test.ts` are **not edited** — no merged acceptance contract is amended, and AC-9 makes that mechanical (reviewer checks `git diff main --stat`).

Rejected: (A) raise the default capacity — amends a merged contract to buy a demo that doesn't need it; (B) generalise `double-booking.sh` with a `CAPACITY` parameter — one script, two claims, and the filename names a hazard.

Two subtrees must be two **dealerships**: bays and technicians are `dealership_id`-scoped (§8.1), so abundant bays inside the scarce dealership would be candidates for the scarcity demo. Service types are the global catalogue, so they sit at the fixture's top level.

## ADR — one, drafted

**ADR-0038, *The harness fixture carries data, never schema*** (`status: proposed` at step 1, written at step 7). The fixture supplies **rows**, and the nine `INSERT`s stay hand-written naming every column, so `seed.mjs` remains the second independent transcription of arc42 §8.1 and a dropped column still fails with `42703`. The rejected option is the refactor a maintainer reaches for twice — generating SQL from the JSON — under which the column disappears from the fixture too and the `42703` never fires. Consequently the fixture carries **no uuids, no VINs, no instants and no export names**: fresh ids per invocation (`vehicle.vin`'s global UNIQUE, shared un-truncated container), the rolled-forward tomorrow-09:00Z, and prefix-derived export naming all stay properties of the seeder.

The second-shape ruling (two scripts) gets **no ADR** — it reverses by deleting a file.

## Answers to the five questions

- **Schema/validation** — `harness/fixture.json`, `HARNESS_FIXTURE` overrides. Hand-written validator, no new dependency, running **to completion before the first INSERT** (a partial seed into a never-truncated container is worse than none), naming the JSON path on **stderr** with nothing on stdout. **Unknown keys rejected** — a `qualifiedfor` typo is exactly the "subtly wrong world". The real argument against a schema library: half the rules are cross-references (`qualifiedFor` → declared service type, `owner` → same-subtree customer, exactly one empty prefix) a JSON Schema cannot express.
- **"All the important test cases"** — enumerated as a nine-row table, with three genuinely new: `min(N,M)` (abundant), `422 vehicle-not-owned` (a second customer+vehicle — WALKTHROUGH §7 currently tells the reader to *"seed a second dealership"* and mix ids by hand), and `422 unknown-reference` for a service type nobody there is qualified for (§8.6's own wording, today reachable only via a random uuid, which exercises the other half of the row). **Out of scope and named**: QS-9's DST (needs a pinned date, contradicting the rolled-forward instant), ADR-0009's cap-exceeded (>16 candidate pairs), QS-14's perf shape.
- **How the script learns *M*** — a new `harness/spurious-refusal.sh` derives `CAPACITY = min(BAY_COUNT, QUALIFIED_TECHNICIAN_COUNT)` from the **exported declared counts**, never from the answers (slice 10's AC-5 defect verbatim). It also asserts `min(N,M)` **distinct** `bayId`s and `technicianId`s from the bodies. Three exit-2 guards: `REQUEST_COUNT < 2` (`R-10-5`), `CAPACITY < 2` (that's the sibling's demo), and `BAY_COUNT ≠ QUALIFIED_TECHNICIAN_COUNT` — outside *B = T* the attainable number is a maximum matching, not `min`, and asserting `min` there asserts something nobody proved. `N ≤ M` stays legal; QS-3 covers (8,20). Defaults *M* = 3, *N* = 10 — (5,3) discriminates at 80.3 % against a no-retry build where (2,1) fails 0 %.
- **§10** — **QS-3 is demonstrated, not extended.** No new scenario, no `Enforced by` change. Proposed arc42 scope is **§3.1** (one sentence: the harness's reference data is a declared fixture) and **§11.1** for `D-15-1`/`D-15-2`.
- **§5 ownership** — `harness/**` implementer; **new** `tests/acceptance/harness-fixture.test.ts` test-engineer (slice 14's precedent, and here it keeps new criteria where they cannot loosen the old); README/WALKTHROUGH scribe.

## Ten ACs; red set is AC-1…AC-8 + AC-10, with AC-9 the named passes-today guard

Four are negative controls (invalid fixture atomically rejected; `CAPACITY` overridden wrong; slot pre-taken; guards firing before any request) — which matters because **no mutation evidence exists for this slice**: nothing under `src/` changes and Stryker mutates neither `harness/**` nor tests. The reviewer should weigh those four rather than read a vacuous green score.

## What I refused, and one honest limit

Refused: encoding ADR-0009's cap of `16` in the harness (one home for the constant — booked as **D-15-1**, a fixture author setting *M* = 9 gets an unwarned flaky demo); an `npm run harness:*` entry for the new script (neither sibling has one, and adding one drags slice 10's README set-equality case red for nothing); a fixture-controlled `STARTS_AT`.

The limit, stated in the design rather than glossed: **the terminal demo cannot discriminate ADR-0004's rejected global-mutex Option D.** `no-spurious-refusal.test.ts` needs E1 (conflict lines naming an exclusion constraint) and E2 (`max(attempt) ≥ 2`) precisely because a per-dealership mutex also confirms `min(N,M)`. A script sees responses, not the log stream. QS-3's test stays the evidence; this is a demonstration of it.

**Scope: one slice, not two.** Split, slice A merges an abundant subtree nothing consumes — data with no demonstration, which §10's Definition of Done exists to refuse. ~500 lines across four files with one red commit, comparable to slice 10.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0038", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-3"],
  "assumptions": ["A-15-1 — N concurrent curl processes contend at all rather than serialising; if they serialise AC-4 still passes while demonstrating nothing, and only AC-5's distinctness would notice. Confirm at step 2."],
  "open_questions": [],
  "dcr_ruling": null,
  "message": "Slice 15 step 1 designed and committed at 633737b. The capacity/scarcity tension is ruled by preserving slice 10's exported names by construction — a scarce subtree with an empty export prefix — so double-booking.sh and harness.test.ts are untouched and no merged acceptance contract is amended. One ADR drafted (0038): the fixture carries data, never schema, so seed.mjs stays an independent transcription of arc42 §8.1's shape in raw SQL. Proposed arc42 scope is §3.1 and §11.1; QS-3 is demonstrated, not extended."
}
```
