# Report · slice 00 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 design, step 1
- Returned: 2026-09-04T08:12:48.234Z
- Duration: 1284s

---

No git hooks exist, so `--no-verify` was a no-op — nothing was bypassed.

**Files:** `/home/agentadmin/sources/keyloop-challenge/docs/slices/00-design.md` · `/home/agentadmin/sources/keyloop-challenge/docs/adr/0012-seed-fixtures-are-a-test-owned-loader.md` · commit `7880ab6`.

## Key decisions

**I measured instead of asserting.** Docker turned out to be reachable from my shell, so I ran §8.1's schema against a throwaway `postgres:16` and recorded nine measurements (design §11.1). This changed the design in three places it would otherwise have been wrong or vague:

- **Constraint evaluation order is CHECK → index-based (exclusion) → FK triggers.** An insert that both overlaps *and* names a bay from another dealership reports `23P01`, not `23503`. This is now the governing rule for §4.2: **each negative case must make exactly one constraint violable.** AC-2 in particular must use a *different bay*, or it asserts `no_technician_overlap` and receives `no_bay_overlap`.
- **AC-8's inverted case reports `23514`/`appointment_interval_ordered`, not `22000`** from the range constructor. That was a real fork I would otherwise have had to label "assumed".
- **`pg_get_constraintdef` normalises the predicate** to `WHERE ((status <> 'cancelled'::appointment_status))`. A catalogue assertion written from the migration source would fail on a correct schema.

**The three-file split stands**, and applies cleanly forward, down, and on re-run (measured). But I found a measured divergence: `npm run db:migrate` (CLI) defaults `--single-transaction` **true**; `globalSetup`'s programmatic `runner()` does not, so a malformed `0003` leaves `0001`/`0002` committed where the CLI rolls everything back. I deliberately did **not** fix it in this slice — it edits `tests/setup/postgres.ts` and breaks 00a's seam promise on the slice where that promise is what makes a CI failure attributable. Proposed as a §7.2/§11 note instead.

**Seed fixtures → ADR-0012, `status: proposed`.** A test-engineer-owned loader in `tests/support/seed.ts`, one dealership subtree per case, derived (not random, not literal) ids. The three rejected options each fail on something concrete; the deciding one is that a migration-based seed gives the whole suite one dealership and collapses arc42 §7.2's isolate-by-data model. The half that is genuinely the human's is deferring the demo dataset, which is why it is `proposed`.

**Migrations land in one implementer commit,** not three: `0001`+`0002` without `0003` leaves the suite CI-red, which `CLAUDE.md` §7 forbids.

## The bootstrap question

**The red is assertion-shaped by ownership, not by luck.** At the red commit `src/persistence/migrations/` holds only `.gitkeep`, and `guard-paths.mjs` denies the test-engineer every write *and read* under `src/`. So the runner applies zero migrations and succeeds; every failure is inside a case body. I made that structural rather than incidental with one rule: **`beforeAll` may only connect — no DDL, no DML, no seeding.** Deliberately, that means the design never depends on how Vitest's JSON reporter represents a hook failure, which I have not measured and therefore refused to reason about (design §11.2 A-1).

The hazard is real at *step 4*, not step 3: measured, a malformed migration makes `globalSetup` reject and the `db` project produce no results at all. I rejected wrapping the runner in a `try`/`catch` — that is 00a's "substituting an evidence chain for an observation" again.

**What the pilot now measures that 00a could not:** C1 live rather than by backfill (the collector exists on `main`); and `red-proof` running as a live job for the first time, on precisely the `tests/integration/`-only branch that O-1's escalation added and that has never executed. I also state in advance that **C4 will pass vacuously** — this slice adds no TypeScript, so `lint:arch` cruises the same nine modules before and after. Said now because a pre-registered criterion may not be reinterpreted after the result.

## Ambiguity flagged now (design §11.4)

1. **AC-7 names no constraint** where AC-5 and AC-6 do. I fixed it at `23503`/`appointment_bay_in_dealership`; "rejected" alone is satisfiable by four constraints.
2. **AC-9's "deterministically"** is undefined and the two natural readings conflict with the parallel suite.
3. **AC-9's "every reference table"** — read as all eight, including `opening_hours`.
4. **AC-4's "its status is set to cancelled"** — by a direct `UPDATE`, since no application code exists.

## Likely step-2 objections

- **The test-engineer** on §3.4's derived ids: `randomUUID()` is simpler and equally correct. I said so in the design and pre-conceded it — it is a legibility choice, not a correctness one.
- **The test-engineer** on the volume: case 0 (catalogue), a negative control in AC-3 and a before/after pair in AC-4 roughly double the file. That is rule 1 applied and I would defend it.
- **The implementer** on `docker info` (§11.2 A-4) — 00a recorded no container runtime on either role's machine, and my shell contradicts it. If the implementer's shell also has Docker, the whole step-4 loop changes for a database-only slice.
- **Either role** on one commit for three migrations.

## Where this design is most likely to be wrong

**§4's specification of AC-3.** It is the case with the most ways to pass while proving nothing, and my remedy — coverage, then a negative control, then two adjacencies, then a count — is four assertions I reasoned into place rather than saw fail. If one of them is redundant or one is missing, I would not currently know which.

Second: **the isolation rule of §4.2 rests on a "one violable constraint" discipline the test file must maintain by hand.** Nothing enforces it. A fixture that drifts turns a green AC-5 into an assertion about `appointment_technician_in_dealership`, and the only thing standing between that and a silent pass is the constraint-name assertion.

Third, and least comfortable: **`service_type`, `customer` and `vehicle` are not dealership-scoped**, so arc42 §7.2's isolate-by-data rule is genuinely partial from its first use. I recorded it rather than smoothed it, but it is the kind of limit that gets forgotten and then bites at slice 07.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§9 (generated)", "§11.1 (generated)"],
  "adrs": [{"id": "0012", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11"],
  "assumptions": [
    "A-1 Vitest's JSON representation of a beforeAll failure — unmeasured, and the design is written so nothing depends on it",
    "A-2 which exclusion constraint is reported when both are violable is index order, not a guarantee",
    "A-3 a literal VIN would collide across parallel seeds on vehicle.vin's global UNIQUE — deduced, not observed",
    "A-4 whether the implementer's and test-engineer's shells can reach a Docker daemon (the architect's can, contradicting 00a §11.5)",
    "A-5 that the planner chooses the partial GiST indexes for the availability query — belongs to QS-14"
  ],
  "open_questions": [
    "AC-7 names no constraint; design fixes it at 23503/appointment_bay_in_dealership",
    "AC-9's 'deterministically' undefined; read as shape and name-to-id resolution, not literal ids",
    "AC-9's 'every reference table' read as all eight non-appointment relations",
    "Whether the slice's arc42 scope may widen to §7.2 and §11 for the measured singleTransaction divergence"
  ],
  "dcr_ruling": null,
  "message": "Slice 00's design is written and committed, with nine of its causal claims measured against postgres:16 rather than asserted — including the constraint evaluation order that governs how every negative case must be built. The red is assertion-shaped by ownership rather than by luck, and ADR-0012 raises the seed-fixture question A-7 promised and no ADR had defined."
}
```
