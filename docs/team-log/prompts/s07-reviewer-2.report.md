# Report · slice 07 · reviewer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 re-review after loopback
- Returned: 2026-09-07T01:04:38.408Z
- Duration: 599s

---

Cleaned up. Here is the re-review.

---

**reviewer** · `.claude/agents/reviewer.md@995af67` · re-review of `f63f887..0358cd4` (branch head was `2bca770` when I started; `0358cd4` is the orchestrator's log commit and touches only `docs/`)

## 1 · ADR-0031 closes R-07-1

**No remaining path computes a lock set from state read outside the transaction.** I walked all three write paths:

- **booking** — `lockResources(trx, bay, tech, null)`; `leave` folds onto `take`, and the insert is in flight against exactly that one pair. Complete.
- **cancel** — takes no advisory locks (ADR-0023) and is a single auto-commit statement (`src/application/cancelAppointment.ts:31` calls `cancelAppointmentById` with no `db.transaction()`). Not a waiter.
- **move** — `leaves` comes from `lockAppointmentRow(trx, move.id)` inside the attempt's own transaction under `FOR UPDATE`; `take` is `bayId`/`technicianId`, and `rescheduleAppointmentById` writes `bay_id: lock.bayId, technician_id: lock.technicianId`, so the take the write performs *is* the take that was locked. `existing.bayId` survives only as attempt 1's **take** seed, which ADR-0031 correctly argues needs no freshness.

**The lock-order claim holds, and by a stronger argument than the ADR states.** ADR-0031 says "a transaction holding an advisory lock never afterwards waits for a row lock." True, but the sharper fact is that *every* transaction that waits for an appointment's row lock holds nothing at that moment: a mover blocks at `lockAppointmentRow` before any advisory acquisition, and a cancel blocks inside its single statement before it has written a dirty tuple. So a row-lock waiter can never be the other edge of a cycle — which also closes the mover→advisory→cancel→row-lock chain the ADR's wording does not explicitly cover. I checked that chain specifically because a cancel *is* tuple-waited-on (ADR-0023 M1) and it is the one non-mover that takes an appointment row lock.

**Cost, verified:** `src/application/rescheduleAppointment.ts:209` is one extra statement per attempt; the docblock's "line 210 below is unconditional" now points exactly at `lockResources` (confirmed by line count). Dedup behaviour is as claimed — attempt 1 unmoved collapses 4→2 (`tests/unit/persistence/appointmentRepository.test.ts` pins the statement text and parameters), 4 keys only where the row moved underneath. The 8→9 statement count is in the test at `tests/unit/application/rescheduleAppointment.test.ts` (`expect(recorded).toHaveLength(9)`), and the new directed case scripts the in-transaction read at `bay-9/tech-9` while the pre-loop read says `bay-0/tech-0`, asserting `['bay-0','tech-0','bay-9','tech-9']` — the exact discrimination R-07-1 was about.

## 2 · R-07-2 docblock — correct

`src/persistence/appointmentRepository.ts` now names three things, of which two are the mechanisms: (i) total-order acyclicity of the advisory waits, (ii) `DISTINCT` over the same tuple `ORDER BY` sorts on (so a `hashtext` collision collapses rather than tying), (iii) tuple-wait acyclicity from ADR-0030 completeness made accurate by ADR-0031. It states outright that AC-4's fixture is `{bay0, bay1, tA}` against `{bay0, bay1, tB}`, is not the symmetric case, and is protected regardless. The over-general test name is gone — it now reads "…the same MULTISET of keys — necessary for the total order, not by itself what rules out a cycle (R-07-2)" and the body says which two mechanisms it does *not* exercise.

## 3 · R-07-7 — the `Map`, and one other bare index

`classify({code:'23P01', constraint:'constructor'})` yields `kind: 'other'`; the directed case is at `tests/unit/persistence/pgError.test.ts`. The prototype path is removed, not guarded.

To answer the "nothing else" half honestly: there is **one** other bare object index in `src/` — `WEEKDAY_INDEX[weekday]` at `src/domain/openingHours.ts:133`. It is not prototype-reachable (`weekday` comes from `Intl.DateTimeFormat('en-US',{weekday:'short'}).formatToParts`, a closed set of seven names), it is not this slice's code, and I have no failure scenario for it. Recorded so the answer is complete, not as a finding.

## 4 · AC-5's instrument — I ran the mutant control the record did not have

The SQL comparison is right. I verified the coercion empirically on `postgres:16.15-alpine` rather than reasoning about operator resolution: with `hashtext('c44a22f6-…') = -1172138601` and `pg_locks.objid = 3122828695`, the exact join shape the test uses returns the resource id. `int4`→`oid` is binary-coercible, so the bits compare as stored.

**More importantly: the corrected instrument had never been observed failing.** `b555317`'s red was produced by the *old* instrument, whose P2 assertion was false for a reason unrelated to build correctness — so that CI observation is not evidence that the SQL-side assertion discriminates. The slice file writes the mutant control down ("restore the pre-loop read and relocate the row between it and the attempt"), so I executed it: a throwaway worktree at `2bca770` with `src/` reverted to `f63f887`, built clean, AC-5 run. Result:

```
AC-5 — the transaction must hold advisory locks on P2 (e2254f64-… / 0437f58c-…)
  resource ids the mover currently holds an advisory lock on:
    ["21764147-…","781bb1ab-…"]     ← P1 only
```

The positive witness (P1) passes, the P2 claim fails, and both park-probes and the release witness are reached. **The corrected AC-5 discriminates.** That evidence now exists; it did not before, and it is the §2.4 gap I would otherwise have raised.

The two-lock choreography (`holder` `FOR UPDATE` → relocate under that lock → commit → park on `blocker`'s uncommitted P1 row) and both `ac5Within` probes are intact and unmoved.

## 5 · A-07-4 retired

`grep` for "round trip" over the file returns nothing, and the old point-estimate analysis (`0.034%`, `TRIAL_COUNT = 40`, the 0.67%/1.3%/6.7% bounds) is gone rather than left standing beside the number that superseded it. The header now carries one account: queue-serialisation caused under-racing at the unbounded shape, 56/3000 = 1.87% (1.38–2.35) against 41/7800 = 0.5% (0.27–0.80), disjoint, with the 0/1000 positive control. R-07-3, R-07-5, R-07-6 and R-07-11's assertions all survived the AC-4 re-aim to `RACE_COUNT = 5` / `TRIAL_COUNT = 100` — `succeededCount` asserted `toBe(0)`, `deepAttempts >= 1000`, the drain floor at `*4 = 2000`, and `awaitLogRecords` returns on timeout rather than throwing, so a regressed build fails on the assertion and not on the helper.

## 6 · Standing duties

**Layering** — `npm run lint:arch`: *no layering violations, 99 modules cruised, every root covered*. `depcruise src`: *no dependency violations (31 modules, 89 dependencies)*.

**Test ownership, per commit, both directions — clean.** The three implementer commits (`306c9ba`, `3559dbd`, `da68d67`) touch only `src/` and `tests/unit/`. The four test-engineer commits (`6d1db61`, `02a5d9b`, `b555317`, `2bca770`) touch only `tests/concurrency/refused-move-leaves-original.test.ts`. The implementer did **not** edit `tests/concurrency/` — it raised the AC-5 DCR instead, which is §5 working as designed.

**Every implementer commit green** — I rebuilt and ran the unit suite at each of the three: `306c9ba` 558/558, `3559dbd` 559/559, `da68d67` 564/564, all typechecking clean. (They are of course red on AC-5 until `da68d67`, which is what a red commit *means*.)

**Mutation** — not run, per your instruction. The lines this window adds are `appointmentRepository.ts` `lockAppointmentRow` (four directed cases including the exact SQL text and the `executeTakeFirstOrThrow` branch), `pgError.ts` `RESOURCE_BY_CONSTRAINT` (directed `'constructor'` case), and `rescheduleAppointment.ts:205-210`. Worth checking your survivors against those three.

## 7 · My §7 reading on the two red commits

**The second red is correct and §7's text is what is wrong. I would not block on it, and I would not have accepted the alternative.**

§7's count exists to serve §2.4, which is a rule about *evidence per acceptance criterion*: no criterion may be satisfied by code that existed before the criterion was observed failing. "Exactly one red commit per slice" is a proxy that is exact only while a slice has one set of criteria for its whole life.

Slice 07 declared a loopback under §6, which explicitly reopens steps 1–4. AC-5 is new and AC-4 was amended in substance. Two ways to serve §2.4:

- **amend `e030f52` in place** — satisfies §7's letter and *breaks* §2.4's substance, because the resulting commit's CI run would not be the run that observed the amended criteria red; it manufactures a red that never reddened what it claims to have reddened, and destroys the record that AC-4's original shape was measured and superseded for a reasoned cause.
- **a second red** — serves §2.4 exactly, at the cost of §7's letter.

§2 is NON-NEGOTIABLE and §7 is not. The test-engineer chose correctly.

Beyond that: **§7 and §6 are in direct textual tension as written.** §6 permits two loopbacks; a loopback that adds a criterion necessarily owes a red. The tension has simply been invisible until now because no prior loopback introduced one. This is a constitution defect surfaced, not a discipline breach, and O-54 is the right place for it.

**On the proposed wording, I'd narrow it.** "Per design" is right in spirit but has no commit-countable definition, so it moves the rule from auditable to arguable — which is the direction §2.3 says not to go. I'd propose instead:

> Exactly one red commit per slice, **plus one per declared loopback that adds or amends an acceptance criterion**; each authored by the test-engineer, each observed red in CI.

That is derivable from artifacts already in the repository: reds on the branch ≤ `1 + loopbacks:` from the slice front matter, which `slice:check` already reads. Note that `red-proof` cannot enforce either wording — it judges the head commit only and is not applicable to a non-`(red)` head — so whichever wording wins should land in `tools/slice/check.mjs`, or the rule stays reviewer opinion.

One caveat for the retro's honesty: `b555317`'s red observation, taken alone, was not clean evidence for AC-5, for the reason in §4 above. The evidence chain for AC-5 is complete only with the mutant-control run I did today. If the "one red per loopback" wording is adopted, it should carry §2.4's second clause explicitly — *observed red in CI, against the build the criterion discriminates against* — because a red that fires for an instrument defect looks identical in git to one that fires for the build.

## 8 · Findings

```
**reviewer** · `.claude/agents/reviewer.md@995af67` · MINOR
tests/concurrency/refused-move-leaves-original.test.ts:161
claim:     `POOL_MAX = 10` is a hand-copied duplicate of pg's default pool size, and
           R-07-4's whole remedy depends on it matching the service's actual ceiling.
scenario:  slice 11 (D-07-1's destination) sets `max: 5` on `createPool` while measuring
           capacity → AC-4 releases `RACE_COUNT * 2 = 10` movers into a 5-client pool,
           reintroducing exactly the queue-serialisation that made the mutant control 2-4x
           weaker → the guard at line 577 still passes, because it compares against the
           literal 10 rather than the pool the service built, and the file's re-measured
           1.87% silently reverts toward 0.5% with nothing reporting it.
```

```
**reviewer** · `.claude/agents/reviewer.md@995af67` · MINOR
docs/slices/07-design.md:136
claim:     The AC-5 parenthetical "(`classid`/`objid` against `hashtext`)" appears in TWO
           files, and the step-7 ruling that defers its correction names only one.
scenario:  step 7 corrects `07-reschedule-under-contention.md:55` per the ruling and leaves
           `07-design.md:136` untouched → the design file, which is the artifact arc42
           absorbs at step 7, states an assertion mechanism the test provably no longer
           uses (it returns resource ids, and no `objid` crosses into JS at all), and a
           later reader re-derives the signed/unsigned defect the DCR just removed.
```

Nothing blocking, nothing major. R-07-1, R-07-2 and R-07-7 are closed on the evidence, and R-07-3/5/6/11's remedies do measure what their headers claim.

## 9 · Report

```json
{
  "role": "reviewer",
  "outcome": "approved",
  "findings": [
    {"severity": "MINOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 161,
     "claim": "POOL_MAX = 10 duplicates pg's default pool size as a literal, so R-07-4's in-flight bound stops tracking the service's real ceiling the moment createPool sets max.",
     "scenario": "Slice 11 sets max: 5 while measuring capacity; AC-4 then releases 10 movers into a 5-client pool, reintroducing the queue-serialisation R-07-4 removed, and the line-577 guard still passes because it compares against the literal."},
    {"severity": "MINOR", "file": "docs/slices/07-design.md", "line": 136,
     "claim": "The stale AC-5 parenthetical naming classid/objid-against-hashtext exists in two files; the step-7 deferral ruling names only the slice file.",
     "scenario": "Step 7 fixes 07-reschedule-under-contention.md:55 and leaves 07-design.md:136, so the artifact arc42 absorbs describes a mechanism the test no longer uses and a later reader re-derives the signed/unsigned defect the DCR removed."}
  ],
  "mutation": null,
  "depcruise": "pass",
  "commit_discipline": "pass-with-reading",
  "test_ownership": "pass",
  "dcr": null,
  "message": "ADR-0031 closes R-07-1 on all three write paths and introduces no new cycle — every appointment row-lock waiter holds nothing at the moment it waits, which is stronger than the ADR's own argument. R-07-2, R-07-7, R-07-3/5/6/11 and A-07-4 all verified closed. AC-5's corrected instrument had never been observed failing, so I executed the slice file's own mutant control against a pre-ADR-0031 build in a throwaway worktree: the P2 assertion fails with the P1 positive witness intact, which supplies the discrimination evidence the record lacked. Two reds is correct: amending the first in place would have satisfied §7's letter by breaking §2.4's substance, and §7's count is a proxy that only holds while a slice's criteria never change — §6 permits loopbacks, so §7 and §6 are in textual tension and O-54 is the right escalation. I would narrow the proposed wording from 'per design' to '1 + declared loopbacks that add or amend an AC', because that is countable from slice:check and 'design' is not."
}
```

**Relevant paths:** `/home/agentadmin/sources/keyloop-challenge/src/application/rescheduleAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/appointmentRepository.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/pgError.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/refused-move-leaves-original.test.ts`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0031-a-move-reads-the-pair-it-leaves-inside-its-own-transaction.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-reschedule-under-contention.md`
