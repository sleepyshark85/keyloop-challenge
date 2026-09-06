# Report · slice 07 · architect · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule R-07-1 and R-07-2
- Returned: 2026-09-06T19:33:06.305Z
- Duration: 898s

---

Five findings ruled, ADR-0031 written, two commits on the branch. No `src/`, no `tests/`, no front matter touched.

## Verdicts

**R-07-1 — AGREE, upheld, and the reviewer's framing is wrong in a way that matters.** It reported "the implementation departs from the design." It does not. `07-design.md` §3 specified the stale pre-loop read in the words the implementer built. What departed is **ADR-0030**, whose own decision statement the design failed to hold. Had this arrived as a DCR it would be **(c)** — nameable against ADR-0030's decision and against §11's `F-02-9` "discharged by measurement", which is false while a live path can violate the rule. This is my error, not the implementer's, and it is the **third occurrence of one shape**: the slice-06 discharge ruling, ADR-0030's symmetry claim, and this — each states something true *within* one transaction as though it were true *across* them.

The diagnosis of the premise is accepted in full. **The sketched deadlock chain is not accepted**: one stale mover plus a booking cannot close, because a transaction only tuple-waits inside its own *take* pair's scope, and every path that locks what it is in flight against is already queued behind that pair's advisory lock. **Two** stale movers close it, one per edge — `T` moves `A` (at `bay2/tech1`, read as `bay9/tech9`) to `bay0/tech0`; `T'` moves `A'` (at `bay0/tech3`, read as `bay8/tech8`) to `bay2/tech2`; advisory sets disjoint, both reach their writes, each waits on the other's `xmax`. `40P01`. That construction is in ADR-0031 because a reviewer right for the wrong reason should be told which half was which.

**R-07-2 — AGREE in full.** Deadlock freedom rests on **two** mechanisms and the docblock collapsed them into one: the total order makes the *advisory* waits acyclic; ADR-0030's completeness makes the *tuple* waits acyclic. Symmetry is neither necessary nor sufficient for either.

**R-07-4 — AGREE, remedy re-aimed.** Not "fewer racers to dodge a flake". 40 in flight against a 10-client pool does two things and the second is worse: it **serialises the simultaneity AC-4 measures** — a pair's two movers can be queued apart and never race. That is a likelier reading of this fixture's 41/7800 against ADR-0030's 117/1000 than the extra-round-trip explanation the file header gives, so bounding in-flight requests to the pool should make the mutant control *stronger*. **AC-4 amended** (mid-slice authority, provisional): ≥ 1000 contended attempts, in-flight requests bounded by the pool, pairs traded for trials. Re-measure the unfixed-build rate at the new shape; if it does not rise, say so. The production half is booked as **`D-07-1`** to **slice 11**, not fixed here: `createPool` sets no `max`, so pg's default 10 is in force by omission, and `CONNECTION_TIMEOUT_MS` — decided for AC-2's unreachable database — silently also bounds queue waits. One timer, two jobs, one of them chosen.

**R-07-7 — AGREE, in scope by the slice file's own words** (A-05-6: *"if a production change is needed, that is the finding"*).

**R-07-10 — no declaration needed, boundary written down.** Product scope is declared; repository *governance* tooling is out-of-band — it has no AC because there is no behaviour to accept, and forcing it into `inherits:` turns front matter into a changelog of the harness. Out-of-band is not unrecorded: its own commit carrying its ref (`f757baf` met this) plus the log. Whether this belongs in `CLAUDE.md` §10 is the gate's, on `A-06-6`'s ground.

## Exact `src/` changes — stated, unmade

**R-07-1**, `src/persistence/appointmentRepository.ts` — new export beside `lockResources`:

```ts
export async function lockAppointmentRow(db: Db, id: string): Promise<ResourcePair> {
  const row = await db.selectFrom('appointment').select(['bay_id', 'technician_id'])
    .where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
  return { bayId: row.bay_id, technicianId: row.technician_id };
}
```

`executeTakeFirstOrThrow` deliberately, not `| null`: the read is total (ADR-0003, minted ids), and an unreachable null branch is an unkillable survivor in a file currently at 100.00. `FOR NO KEY UPDATE` is acceptable — it is what the subsequent `UPDATE` takes anyway.

`src/application/rescheduleAppointment.ts` — delete the pre-loop `const incumbent` and its docblock; inside the transaction:

```ts
const leaves = await lockAppointmentRow(trx, move.id);
const lock = await lockResources(trx, bayId, technicianId, leaves);
return await rescheduleAppointmentById(trx, move, lock);
```

Loop variables `bayId`/`technicianId` stay initialised from `existing`. **Cost against ADR-0027: none to its ordering.** Correctness needs `leave` current, not `take`; attempt 1 still coincides and dedupes to two keys in the common case, and where the row moved underneath it locks four instead of two — bounded, rare, correct. One extra statement per attempt (three where a move had two); bookings untouched. Add one clause to the `no-verdict` docblock: a `40P01` now also covers a lock set *computed from state read outside the transaction*.

**R-07-2**, `lockResources`' docblock — delete from *"That last part is the load-bearing symmetry"* through *"cycling on itself"*, and replace with: (i) the total order makes advisory waits acyclic by the two-key argument — a cycle needs `k1 < k2` with one holder each, impossible when every transaction acquires in one globally ordered statement; (ii) `DISTINCT` is over `(cl, hashtext(key))`, the same tuple the sort is on, so no two rows tie and a `hashtext` collision collapses to one lock rather than an ambiguous order; (iii) the *tuple-wait* half is ADR-0030's completeness, under ADR-0031 computed inside the transaction — two mechanisms, not one; (iv) explicitly, AC-4's fixture is **not** symmetric (`{bay0, bay1, tA}` vs `{bay0, bay1, tB}`) and is protected regardless. `tests/unit/persistence/appointmentRepository.test.ts:110`'s name must stop asserting the over-general claim.

**R-07-7**, `src/persistence/pgError.ts` — replace the `Record` literal with `new Map<string, 'bay' | 'technician'>([...])` and `.get(constraint)`. `Object.hasOwn` also works; prefer the `Map` because it removes the prototype path rather than guarding it, which is §2.1's own habit. Plus a directed unit case: `classify({ code: '23P01', constraint: 'constructor' })` → `{ kind: 'other' }`.

## Things you did not ask about

- **A loopback is owed and I declare it.** The R-07-1 fix reopens steps 1–4. My own O-44 ruling binds me here — *ruling and recording are one act or they are neither* — so `loopbacks: 0 → 1` is for the orchestrator to apply, with one remaining under the governor.
- **Front matter for the orchestrator:** `adr: [3, 18, 23, 26, 27, 29, 30, 31]`; `loopbacks: 1`. `arc42:` unchanged.
- **`defects:check` is red and it is not mine.** `test:tools` fails there because `docs/DEFECTS.md` is stale against six uncommitted `events.jsonl` lines. All 20 tool tests, `docs:check`, `docs:refs`, `docs:adr-check`, `docs:budget:check` and `log:check` pass. The new ADR needed `docs:build` and an `adr-check --pin`; both are in the first commit.
- **`slice:check 07` still reports no ruling in span for `F-02-9` and `A-05-6`.** Both are now touched by these rulings, but the log entries are yours.
- **§11 candidate for step 7, from the O-51 exchange:** a regression barrier that cannot be observed red owes a *mutant control*, and an argued control is not a measured one. This slice measured exactly one. Booked for as-built, not written now.
- **AC-5 added** so ADR-0031 does not ship without a control — a deterministic `pg_locks` witness rather than a four-mover race, because a probabilistic witness for a rule is what ADR-0030 exists to replace. Mechanism witness under QS-4; §10 gains no row.
- The test-engineer landed `02a5d9b` (R-07-11 drain floor) while I ran; `RACE_COUNT`/`TRIAL_COUNT` are untouched, so the R-07-4 amendment lands cleanly.

Files: `/home/agentadmin/sources/keyloop-challenge/docs/adr/0031-a-move-reads-the-pair-it-leaves-inside-its-own-transaction.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-design.md`. Commits `60feaef`, `42d9097`.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0031", "status": "accepted", "supersedes": null}],
  "quality_scenarios": ["QS-4", "QS-5"],
  "assumptions": [
    "pg-pool applies connectionTimeoutMillis to queued acquires as well as to new connections, so a codeless Error is the R-07-4 mechanism — taken from the reviewer's execution, not re-measured here",
    "the two-stale-mover cycle in ADR-0031 is derived from PostgreSQL's wait-graph semantics and ADR-0023's M1, not measured; ADR-0031 does not rest on its rate, only on ADR-0030's rule being false at a reachable interleaving"
  ],
  "open_questions": [
    "D-07-1 — what a saturated pool should answer. 503 is the shape; the value of max and whether it becomes BOOKING_-prefixed config is slice 11's, with a §7.3 row if so",
    "whether R-07-4's re-measured unfixed-build deadlock rate rises once in-flight requests fit the pool. If it does not, my reading of 41/7800 is wrong and the fixture's low rate needs another explanation"
  ],
  "dcr_ruling": null,
  "message": "R-07-1 upheld and it is against my design, not the build: §3 specified the stale read the implementer faithfully built, so what departed from ADR-0030 is the design. ADR-0031 moves the vacated pair's read inside the transaction under the row's own lock, and records the cycle that actually closes — two stale movers, not the reviewer's stale mover plus a booking, which cannot close. Third occurrence of one shape: a claim true within one transaction offered as true across them. R-07-2 and R-07-7 upheld in full; R-07-4 upheld with the remedy re-aimed, because 40 racers on a 10-client pool suppress the simultaneity AC-4 measures as well as manufacturing the false 500, so bounding concurrency should strengthen the control rather than weaken it. R-07-10 ruled legitimately out-of-band with the boundary written down. A loopback is owed and I declare it."
}
```
