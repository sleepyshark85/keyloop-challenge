# Prompt · slice 07 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 loopback green
- Sent: 2026-09-07T00:20:31.983Z

---

Slice 07 — **the loopback's green.** Branch `slice/07-reschedule-under-contention`. Pull first. The second red is at `b555317`, observed red in CI: run 34069381994, `suite` FAIL, `red-proof` PASS, docs PASS.

**First, because it is against the design and not against you.** The reviewer reported R-07-1 as *"the implementation departs from the design."* **The architect ruled that wrong**: `07-design.md` §3 specified the stale pre-loop read in the words you faithfully built, so what departed from ADR-0030 is **the design**. It declared a loopback against itself, unprompted — `loopbacks: 1 of max 2` — and named this the **third occurrence of one shape**: the slice-06 discharge ruling, ADR-0030's symmetry claim, and this, each stating something true *within* one transaction as though it were true *across* them.

**Your I-07-2 prediction was confirmed independently.** The reviewer differential-tested both `pgError.ts` guards over 254 adversarial inputs — boxed `String` codes, `{toString:()=>'23P01'}`, symbols, `NaN`, prototype keys — and found **zero distinguishing inputs**. Both are provably equivalent, not merely unkilled. One correction for the record: your *step-4* summary collapsed both into the `===` argument, and that only covers guard 1 — guard 2's downstream is a **property lookup**, not a comparison, and its equivalence rests on `undefined` missing from the map's key set. **Your step-2 report had that argument correctly**; the summary lost it.

## Three changes, all specified by the architect and stated unmade

**1. ADR-0031 — read the vacated pair inside the transaction.** New export beside `lockResources`:

```ts
export async function lockAppointmentRow(db: Db, id: string): Promise<ResourcePair> {
  const row = await db.selectFrom('appointment').select(['bay_id', 'technician_id'])
    .where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
  return { bayId: row.bay_id, technicianId: row.technician_id };
}
```

`executeTakeFirstOrThrow` **deliberately**, not `| null`: the read is total under ADR-0003's minted ids, and an unreachable null branch is an unkillable survivor in a file currently at **100.00 with zero survivors**. `FOR NO KEY UPDATE` is acceptable — it is what the subsequent `UPDATE` takes anyway.

In `rescheduleAppointment.ts`: delete the pre-loop `const incumbent` **and its docblock**, and inside the transaction take `leaves = await lockAppointmentRow(trx, move.id)` before `lockResources`. Loop variables `bayId`/`technicianId` stay initialised from `existing`. **Cost against ADR-0027: none to its ordering** — correctness needs `leave` current, not `take`; attempt 1 still coincides and dedupes to two keys in the common case, and where the row moved underneath it locks four instead of two, which is bounded, rare and correct. Add one clause to the `no-verdict` docblock: a `40P01` now also covers a lock set **computed from state read outside the transaction**.

**2. R-07-2 — the docblock's false claim.** Delete from *"That last part is the load-bearing symmetry"* through *"cycling on itself"*. Replace with four things: (i) the total order makes **advisory** waits acyclic by the two-key argument — a cycle needs `k1 < k2` with one holder each, impossible when every transaction acquires in one globally ordered statement; (ii) `DISTINCT` is over `(cl, hashtext(key))`, the same tuple the sort is on, so no two rows tie and a `hashtext` collision collapses to one lock rather than an ambiguous order; (iii) the **tuple-wait** half is ADR-0030's completeness, under ADR-0031 computed inside the transaction — **two mechanisms, not one**; (iv) explicitly, AC-4's fixture is **not** symmetric (`{bay0,bay1,tA}` vs `{bay0,bay1,tB}`) and is protected regardless. Also fix `tests/unit/persistence/appointmentRepository.test.ts:110` — its **name** asserts the same over-general claim.

**3. R-07-7 — the prototype hole, ruled in scope by A-05-6's own words** (*"if a production change is needed, that is the finding"*). `classify({code:'23P01', constraint:'constructor'})` currently returns `resource: <the Object constructor>`. Replace the `Record` literal with `new Map<string, 'bay'|'technician'>([...])` and `.get(constraint)`. The architect prefers the `Map` over `Object.hasOwn` because **it removes the prototype path rather than guarding it** — §2.1's own habit, make the bad state unrepresentable rather than check for it. Add a directed unit case asserting `constraint: 'constructor'` yields `kind: 'other'`.

**Also fix R-07-8** (yours, MINOR): a comment in `appointmentRepository.test.ts:71` says a booking's statement parameters are *"byte-for-byte what slice 06 sent"* while the assertion five lines below requires four parameters where slice 06 sent two. What is genuinely unchanged is the **set of advisory locks acquired** — two, class 1 then class 2 — which no test executes; it is argued from `DISTINCT`. The reviewer calls this the *"comment asserting coverage that does not exist"* shape `stryker.config.mjs` names as this project's most-counted defect.

**What green means.** AC-5 asserts deterministically off `pg_locks` that the transaction holds locks on the pair **as the row currently stands**, never one read before the transaction opened. AC-4 now runs ≥ 1000 contended attempts with in-flight requests bounded by the pool.

**Non-negotiables.** §5: `src/` and `tests/unit/` only — `tests/concurrency/` is the test-engineer's; raise a DCR **to me** rather than dispatching anyone (O-44). §7: every commit green, small. §2.1 NON-NEGOTIABLE. Keep `lint:arch` and `typecheck` clean. **Do not start, poll or wait on Stryker** — I take mutation measurements.

**Report** the standard JSON, your line count, whether ADR-0031 composed as specified, whether the extra statement per attempt is visible in the uncontended path, and — separately — anything the three changes turned up.
