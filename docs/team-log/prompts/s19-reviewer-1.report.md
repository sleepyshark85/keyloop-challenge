# Report · slice 19 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Step 5 review of slice 19
- Returned: 2026-09-10T11:59:46.685Z
- Duration: 2350s

---

Posted. Review complete.

## Report

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "mutation": {"score": 0.9091, "survivors": 34, "timeouts": 12, "killed": 328,
                "per_file": {"src/domain/candidates.ts": 0.8980,
                             "src/application/bookAppointment.ts": 0.9327,
                             "src/application/attemptLoop.ts": 0.8986,
                             "src/application/rescheduleAppointment.ts": 0.9036}},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null
}
```

**I do not block.** §2.1 holds, layering is clean, ownership is clean, mutation clears 0.75 on every changed file. Four MAJOR findings, all with cheap remedies in the owning role's own directory.

### What I verified rather than accepted

**AC-3b is real, and P10 pins it deterministically** (your item 1 & 2). I hand-mutated the compiled `dist/domain/candidates.js` two ways and ran the property file against each:

| mutant | P8 | P9 | P10 |
|---|---|---|---|
| M1 — `freeFirst` returns `shuffle(free)` only (ADR-0040's `Filter-1`) | fail | fail | fail |
| M2 — per-group `freeHead === undefined` → `[]` (design §4 P2's violation) | fail | fail | fail |

P8 alone is a self-control (it compares against `orderCandidates(…, EMPTY_OCCUPANCY, seed)`), so an *unconditional* filter would slip past it — but pre-existing **P2** compares against the input list, and **P10** is fully deterministic (fixed lists, fixed seed, `busy ⊇ the whole list`). `T-19-4` is discharged by measurement, not by reasoning. Mutation confirms it from the other side: **zero survivors in `freeFirst` or `orderCandidates`** — `candidates.ts`'s five are two `mulberry32` arithmetic constants and three `EMPTY_OCCUPANCY` literals, all provably inert (`new Set(undefined)` is empty; a phantom busy id partitions to nothing, which is what P10's "ids absent" case asserts).

**`T-19-5` — no evidence is lost** (item 4). `describeLoopLines` (`tests/support/booking.ts:645-649`) renders `exit=… attempts=… seed=…` for every refusal into `where`, which is appended to the step-1 strict assertion's own failure message. The `console.log` is a convenience, not the evidence. MINOR stands, no action.

**`T-19-3` — no second instance** (item 6). The `src/domain/candidates.ts:64/111` references in `s19-test-engineer-2.report.2.md:49-50` are vitest stack-trace frames, disclosed as such at that report's line 85. Commit paths are clean in both directions: `076a1ab`/`e1d925a` touch only `tests/`; `56269be`/`2aeeacb` touch only `src/` + `tests/unit/`.

**§7, `56269be`** (item 7) — **justification accepted.** 93 of its lines are `src/`, under the ~150 guideline; the other 231 are unit tests, which §7 requires to land with the code they drive. An exported function's arity change is atomic under `tsc`. And the split that mattered was taken — `2aeeacb` isolates the behaviour change.

### Findings

**R-19-1 · MAJOR · `src/application/attemptLoop.ts:197`**
claim: ruling 5's `strategy.busy` threading is asserted by nothing; deleting it leaves the whole suite green.
scenario: Force the ternary to `EMPTY_OCCUPANCY` (Stryker's own `ConditionalExpression → false`, reported **Survived**) and 730/730 nodb tests pass — including `attemptLoop.test.ts:298`, the test written for this line. Its fixture uses `drawSeed: () => 1`, and `orderCandidates(['bay-0','bay-1'], ['tech-0'], EMPTY_OCCUPANCY, 1).bays` is already `["bay-1","bay-0"]`, so the blind order and the free-first order are identical there. When §11.1's reschedule-snapshot debt is discharged, a real snapshot will be silently discarded. Remedy: `drawSeed: () => 0` — measured to discriminate.

**R-19-2 · MAJOR · `tests/unit/domain/candidates.test.ts:178`**
claim: the test titled "P4 — `busy = EMPTY_OCCUPANCY` reproduces the pre-slice-19 order **element-for-element**" asserts only `withBusy.bays.length === 8` and `.technicians.length === 8` (lines 187-188) — which pre-existing property P2 already guarantees. The element-for-element assertion against a reference `mulberry32` stream was proposed by the test-engineer at step 2, **commissioned in its own dispatch** (`s19-test-engineer-2.md:29`, "the `EMPTY_OCCUPANCY` element-for-element identity you proposed"), and substituted at `s19-test-engineer-2.report.2.md:65` with an argument, unruled.
scenario: `src/domain/candidates.ts:112`, `ids.filter(…)` → `[...ids].reverse().filter(…)`. Design §4 P4 is destroyed; measured green afterwards: 730/730 nodb, plus `tests/acceptance/candidate-retry.test.ts` and `tests/integration/telemetry-booking.test.ts` 23/23. The file header's claim that a reference comparison is "neither necessary nor possible from outside" is false on *possible* — `src/domain` imports nothing and the generator is six lines.

**R-19-3 · MAJOR · `src/persistence/appointmentRepository.ts:558-560`**
claim: `busyResources`'s "ADVISORY, STRUCTURALLY" docblock states *"`bookAppointment.ts` and `rescheduleAppointment.ts` call `candidateResources` and `lockResources`/`insertAppointment`, never this"*. False as of `bookAppointment.ts:258`.
scenario: A reader auditing §2.1 reads this file's own claim that the booking path never calls this function and stops looking — while the booking path calls it once per request. Comment-only fix; the sentence's *point* survives (the result still never reaches an `INSERT`), only its enumeration is wrong.

**R-19-4 · MAJOR · `tests/integration/telemetry-booking.test.ts:414-425`**
claim: AC-8 says QS-13's claims are "re-sourced, **not weakened**", and `d4f7a54`'s message says "Every claim survives". Three do not survive on the export path. The old file asserted, against the collector, that exactly one of two insert spans carried `db.sqlstate` (i.e. a *succeeding* span carries none — old L328-329) and that `booking.attempt`/`bay.id`/`technician.id` were present on **both** spans (old L345-358). The new leg (i) checks its single succeeding span only for `statusCode !== 2`; leg (ii)'s loop runs over two *failed* spans; leg (iii)'s inserts are never inspected. The substance now stands only at `tests/unit/application/attemptLoop.test.ts:183-187` and `:216` — in-process, against an in-memory exporter.
scenario: This is precisely the descent ruling 15 named and refused for leg (iii) — *"a §10 metric claim drops silently to `attemptLoop.test.ts`, evidence of the counting rule and not of the export path"* — applied to leg (i)'s span attribution instead, unnoticed. A change that stamped `db.sqlstate` onto successful insert spans failed the old file and passes the new one. Remedy: three `expect`s on `insert` after line 425. (I checked the exact `db.constraint === 'no_bay_overlap'` drop separately — that one is *correct*: the fixture blocks both resources, so either constraint may fire, and rewritten QS-13(ii) says so.)

**R-19-5 · MINOR** — the red figure. `docs/slices/19-…:48`, `docs/arc42/10-quality-requirements.md:44` and ADR-0040 all record **165/200** (the hand probe). The committed, repository-reproducible fixture measured **163/200** (`s19-test-engineer-2.report.2.md:26-28`; the step-3 PR comment says 163 correctly). Since `BOOKING_SEED` is deliberately unset, the figure is a fresh random variable every run, so arc42 cites a number its named file cannot reproduce — against the slice's own DoD clause "reproducible from the repository, not quoted from a transcript". Substance unaffected.

**R-19-6 · MINOR** — QS-16's power (item 3). Your instinct is right, and the tuple analysis sharpens it. At the three tuples with `N > M`, a racer that refuses spuriously is masked: another of the surplus racers picks up the pair it left, and the final count still reads `min(N,M)`. Only `(8,8,4)`, where `N == M`, makes one spurious refusal visible — and that is exactly where the test-engineer measured it firing, **3 of 8 local runs**. So the scenario is not vacuous, but one invocation is ~38%-powered, it passed in the red CI run 34464606313 (red-proof names only the two property files), and nothing in arc42 §10 or the file records that. A future reader treating a green QS-16 as "the burst re-synchronisation risk is measured absent" is over-reading it — QS-15's 200 seeds is the guard that would actually fail. Design §8's "unfalsified, not absent" is honest; arc42 does not carry it. Separately worth stating: at `(20,8,4)` free-first makes a spurious refusal *structurally* unreachable, since `2M−1 = 15` lets Bound-2 exhaust the whole free group inside the cap of 16 — so "most likely to be **produced**" reads as the opposite of what the arithmetic gives.

**R-19-7 · MINOR · `tests/integration/telemetry-booking.test.ts:428-435`** — leg (i)'s new "no `booking_conflicts_total` point of any outcome" is a pure absence claim with no positive control, and its `beforeAll` deliberately skips `awaitMetricPoints` (L373-378). A metric pipeline that exported nothing at all passes it vacuously. Contained (legs ii/iii would go red), but the file's own house pattern for absence claims guards with a `spans().length > 0` check (L756-760).

### Outstanding, not findings

- **AC-5's arc42 half is not done and correctly is not** — `04-solution-strategy.md:65` and `06-runtime-view.md:50` still carry the false `409` sentence, and §11 R-4 (`11-risks-technical-debt.md:174-175`) is unrewritten. Design §9 schedules all of it for step 7, and `slice:check` gates on it ("arc42 reconciled — FAIL"). The `candidate-retry.test.ts` half of AC-5 *is* done, in the red commit.
- **AC-6's figures (18.37 / 14.16 ms) are not yet in arc42 §11** — same step-7 bucket.
- **No green CI run exists for the head.** `slice:check 19` still reads run 34464606313 (`head_sha 076a1ab`, the red). `red_proof: success`, `depcruise: pass`, and it names the two failing files correctly — the red is properly proven — but "tests green" and "test-first proven" will stay FAIL until a run for `d4f7a54` is collected. Also open at Done: `OQ-19-2` (replay).
- **P10 was green at the red commit** (a 4-argument call against a 3-argument build coerces `EMPTY_OCCUPANCY` to seed 0, so all three cases agree). AC-3b's red *was* observed via P8/P9, so §2.4 is satisfied; but P10's own red exists only in my mutation run above, not in CI.

Relevant paths: `/home/agentadmin/sources/keyloop-challenge/src/application/attemptLoop.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/appointmentRepository.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/unit/domain/candidates.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/integration/telemetry-booking.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-spurious-refusal-under-occupancy.test.ts`.
