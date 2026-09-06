# Report · slice 07 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 step 5 review
- Returned: 2026-09-06T19:15:46.052Z
- Duration: 2213s

---

## Review — slice 07, `slice/07-reschedule-under-contention`

**Outcome: changes-requested.** No DCR. ADR‑0030 is right; one place in the implementation does not meet it.

Mutation run completed here (19m38s, 1162 mutants): **93.85 overall, 71 survivors**. `appointmentRepository.ts` — the file this slice rewrote — is **100.00, zero survivors**. **No survivor sits on a line this slice added or modified.** `rescheduleAppointment.ts` (9) and `bookAppointment.ts` (4) survivors are all pre-existing (`case 'derived':`, the unreachable `attempts <= structuralBound` tail); `pgError.ts` (2) are A‑05‑6's, addressed below. `lint:arch` 99 modules clean, `typecheck` clean, `docs:refs`/`docs:adr-check`/`docs:budget:check` clean.

Commit discipline and ownership are **clean in both directions**. Exactly one `(red)` subject (`e030f52`, `test(07): … (red)`), touching only the two `tests/concurrency/` files and nothing else. Neither implementer commit touches `tests/concurrency/`; the red commit touches no `src/` and no `tests/unit/`. CI at `e030f52`: `suite` FAIL / `red-proof` PASS, red-proof's own line reads *"red observed: tests/concurrency/refused-move-leaves-original.test.ts failed, no unit test failed, and verify concluded success."* Green CI exists at head: run `34052328823`, `f63f887`, success.

---

### 1 · T‑07‑5 sweep — complete, and the trap is real but predates ADR‑0029

There are exactly **two** raw-SQLSTATE substring assertions against service output in the whole suite. Everything else that names a SQLSTATE is either event-based (`conflictRecords`), raised by the test's own `pg.Client`, or a stubbed error in `tests/unit/`.

- `tests/concurrency/no-spurious-refusal.test.ts:377` — `cell.raw.includes('25P02')`. **Live.** `25P02` classifies as `other`, is rethrown, and reaches `src/http/server.ts:135`'s `request.log.error({ err: error })`, where pino's std `err` serializer emits `code`.
- `tests/concurrency/cancellation-takes-no-lock.test.ts:368` — `raw.includes('40P01')`. **Half vacuous, and always was.** `cancelAppointment.ts` has no `classify` and no `catch`, so a cancel-side deadlock victim's error reaches `server.ts:135` and prints `40P01`. A **booking**-side victim never does: `bookAppointment.ts:430` logs `{ event: 'booking.deadlock', bayId, technicianId, attempt }` and discards the SQLSTATE. PostgreSQL picks the victim, so the assertion is sensitive to roughly one side of the cycle. The test survives this because its 201/409 split catches the other side — but the assertion is not the general "no deadlock anywhere" check its message reads as.

**No assertion was made vacuous by ADR‑0029.** Nothing in `tests/` asserted on `booking.deadlock` by name or on a raw `40P01` for the reschedule path before this slice. The trap T‑07‑5 names was live for the *new* test and the test-engineer avoided it correctly (`refused-move-leaves-original.test.ts:596-598` reads `event === 'reschedule.deadlock'`); no pre-existing file had fallen into it. The `40P01`-swallowing that makes it possible is older and wider than ADR‑0029 — it is the `no-verdict` arm on **both** paths.

### 2 · §2.4 reading on O‑51

**§2.4 is satisfied, and it does not reach AC‑1/2/3.** Its unit of obligation is the slice: *"a failing acceptance test … observed red in CI"*, singular indefinite. Slice 07 has one, for the criterion ADR‑0030 exists to fix.

*"A test that has never failed is not evidence"* is a claim about vacuity, not about red history. AC‑1/2/3 are not vacuous — they are **unfired**, and their purpose is different: they are characterisation tests for behaviour slice 06 shipped without asserting. Pinning already-correct behaviour is a legitimate second purpose, and §2.4 governs the evidence chain for *new* behaviour. So: **a criterion that passes on first write does not need a demonstrated red of its own.**

But the honest edge: what a regression barrier owes instead of a red is a **mutant control**, and this slice measured exactly one of them. AC‑4's control is a number (117/1000, then 5–6/1000 on this fixture). AC‑1's (a cancel-then-restore advances `xmin`) and AC‑2's (a cancel-then-insert opens a window) are *arguments* — the same currency as the slice‑06 discharge ruling that shipped an 11.7% `500`. Both are cheap to demonstrate against a throwaway build. Not a §2.4 breach; an asymmetry worth naming, since the one criterion whose control was measured is the one that failed.

### 3 · SQL verdict

I read the generated statement. **Everything the dispatch asked me to verify holds except the symmetry claim.**

- One static statement for booking and move: ✓. `vacated = leave ?? { bayId, technicianId }` makes the array always four elements; the SQL text is identical either way, and the booking case dedupes to the same two locks. Not merely compatible — identical.
- Bay class before technician class: ✓, and robustly. `order by cl, …` with `BAY_LOCK_CLASS = 1` / `TECHNICIAN_LOCK_CLASS = 2` is a leading integer sort; no hash value can reorder across classes.
- `DISTINCT` collapses the shared resource: ✓ (and harmless if it did not — `pg_advisory_xact_lock` is re-entrant within a transaction).
- **"For a mutually-vacating pair the two racers' unions are the same multiset": FALSE**, and falsified by this slice's own AC‑4 fixture. See finding R‑07‑2.

What actually prevents a cycle is the total order on `(cl, hashtext(key))`, computed inside the statement from values rather than from call-site roles. That argument is also in the docblock and is sound. The multiset claim is a special case of the ADR's own measurement fixture, is unnecessary, and is labelled "the load-bearing symmetry" — which is the one thing it must not be called.

On the `ORDER BY` reliance: I agree it cannot be proved from the standard, and I'd add that **PostgreSQL does guarantee it here for a reason worth writing down**: `is_simple_subquery()` refuses to pull up a subquery carrying either `distinctClause` or `sortClause`, so the derived table is a real Sort/Unique node feeding a SubqueryScan and the volatile projection streams in order. **AC‑4 is a weaker control on this than claimed.** Both racers execute the *same static statement* under the same plan; if evaluation order ignored the `ORDER BY`, both would still ignore it identically, and the shared class‑1 keys would still be acquired in a consistent relative order. AC‑4 would catch a gross reordering, not a subtle one. It is adequate as a live control; it is not the proof the design implies.

### 4 · The two deviations — both inside §3's latitude, and functionally identical

Checked, not taken on trust. `array[$1,$2,$3,$4]` with four all-unknown parameters resolves to `text[]`, feeding `hashtext(text)` — identical rows to the sketched `unnest($1::int[], $2::text[])`. The signature `(db, bayId, technicianId, leave)` satisfies all three of §3's constraints: `leave` is a required fourth positional parameter (omission is TS2554, confirmed by typecheck across both updated call sites), keys are deduplicated, one statement ordered by `(class, hashtext(key))`. `take` and `leave` are type-distinct (two strings vs. an object), so they cannot be transposed silently. Both deviations are fine.

### 5 · I‑07‑2 — conclusion confirmed, proof incomplete as summarised

Both mutants **do survive** in my run (`pgError.ts:80:9` and `107:39`, both `ConditionalExpression`), and both **are equivalent**. I differential-tested a base build against each mutant over 254 adversarial inputs (boxed `String` codes, `{toString:()=>'23P01'}`, symbols, numbers, `NaN`, arrays, prototype keys, non-object errors): **zero distinguishing inputs for either.**

The *stated* proof only covers one of them. "Every downstream comparison in `classify` is `===` against a string literal, which never coerces" is exactly right for guard 1. Guard 2's downstream operation is not a comparison at all — it is `RESOURCE_BY_CONSTRAINT[constraint]`, a property lookup, and its equivalence rests on `undefined` coercing to the key `"undefined"`, which the map does not hold. The implementer's **step‑2** report has that argument correctly ("that lookup is `undefined` too, and the inner `resource !== undefined` guard already returns other"); the step‑4 summary collapsed both into the `===` argument. Conclusion stands; the record should carry both reasons, because guard 2's equivalence is *contingent* on the map's key set in a way guard 1's is not — and the unit test at `pgError.test.ts` pins precisely that boundary, which is the right test.

### 6 · I‑07‑5

**No home.** One `finding.raised` in the working tree's `events.jsonl`, uncommitted, with no `finding.ruled`; absent from `DEFECTS.md`, `STATUS.md` and every slice file. Not a known flake. The mechanism is identifiable and is not slice‑07-specific: `src/persistence/db.ts:56` builds the pool with **no `max`** (pg default 10) and `connectionTimeoutMillis: 1_000`, and pg-pool applies that bound to *queued* acquires, not just new connections. Twenty barrier racers against ten clients on a container shared by 19 files is enough to reach it under load; the resulting error carries no SQLSTATE, classifies as `other`, is rethrown, and surfaces as `500`. That is a pre-existing property, not something this slice introduced — but see R‑07‑4: AC‑4 doubles the exposure and misattributes the result.

### 7 · I‑07‑4 — fair

Measured: 83 added lines in `src/`, of which **20 are code** and 63 are comment or blank; 22 removed. The functional delta is inside the 22–26 estimate. The overage is docblock work the design explicitly demanded (§5's A‑05‑6 row, A‑07‑2's three falsified premises). Confirmed by counting, not by narration.

---

## Findings

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MAJOR
src/application/rescheduleAppointment.ts:196
claim:     ADR-0030's `leave` is read outside the transaction and never re-validated, so on
           concurrent reschedules of the same appointment a move locks a pair the row no longer
           occupies and vacates one it never locked — the exact rule ADR-0030 states.
scenario:  Two PATCHes of appointment A (at bay0/tech0) arrive together. Both read `existing`
           on the pool at :121 and set `incumbent = (bay0, tech0)`. Request 1 wins the advisory
           locks, commits a move to (bay1, tech1). Request 2 then runs attempt 1 with
           take = leave = (bay0, tech0) — two keys — and `rescheduleAppointmentById` guards only
           `id` + `status='confirmed'` (appointmentRepository.ts:424-425), so its UPDATE succeeds
           and vacates bay1/tech1's index entry while holding no lock on either. A booking
           contending bay1 waits on that entry, request 2 waits on the booking, 40P01 → 500.
           The docblock's justification — "CONSTANT across every attempt, because every prior
           attempt aborted" — is true of one request's attempts and silent about a second
           request's commit, which is the same shape as the slice-06 discharge ruling this
           slice was created to correct.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MAJOR
src/persistence/appointmentRepository.ts:147
claim:     The docblock calls a false statement "the load-bearing symmetry", and this slice's
           own AC-4 fixture falsifies it.
scenario:  At AC-4 attempt 2, mover A sends take=(bay1,tA), leave=(bay0,tA) → distinct keys
           {(1,bay0),(1,bay1),(2,tA)}; mover B sends take=(bay0,tB), leave=(bay1,tB) →
           {(1,bay0),(1,bay1),(2,tB)}. Those are not the same multiset, yet the test header
           calls this fixture "the mutual cross-vacate ADR-0030's measurement is built on".
           The claim holds only for a full-pair swap (the ADR's own fixture). No behaviour is
           wrong — the total order on (cl, hashtext(key)) is what prevents the cycle, and the
           docblock states that too — but a reader who believed the symmetry were load-bearing
           would conclude the ORDER BY is removable for symmetric cases and that an asymmetric
           mutual vacate like AC-4's is unprotected. Both conclusions are wrong.
           `tests/unit/persistence/appointmentRepository.test.ts:110` asserts the same
           over-general claim in its test name from a full-pair-swap instance.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MAJOR
tests/concurrency/refused-move-leaves-original.test.ts:541
claim:     `succeededCount` is computed and never asserted, so the file header's structural
           claim that neither move can ever succeed is argued and not measured.
scenario:  A fixture regression (a blocker row that stops overlapping J, a qualification wired
           to a second technician) lets 100 of 1600 movers succeed at attempt 1. `badAnswers`
           accepts 200. `unchangedViolations` only inspects 409s. `conflicts.length >= 1600`
           still holds (the other 1500 emit ~3000). `overlaps` is still empty. The run passes
           green while 100 movers never entered a contended cross-vacate at all. One line —
           `expect(succeededCount).toBe(0)` — closes it and also pins refusedCount at 1600
           by arithmetic.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MAJOR
tests/concurrency/refused-move-leaves-original.test.ts:550
claim:     AC-4 releases 40 concurrent requests against a 10-client pool with a 1000 ms acquire
           bound, 40 times, and reports the resulting 500 as a deadlock it is not.
scenario:  `releaseFromBarrier(movers.length = 40, …)` against `createPool` with no `max`
           (pg default 10) and `CONNECTION_TIMEOUT_MS = 1_000` (src/persistence/db.ts:41,56),
           on the one shared container that 19 db-project files hit in parallel. A queued
           acquire past 1000 ms rejects with a codeless Error → `classify` → 'other' → rethrown
           → 500. `badAnswers` then fails with "500 above all: an unresolved 40P01 surfacing at
           the edge" while `deadlocks.length` is 0. That is twice the racer count of
           no-spurious-refusal.test.ts, the file I-07-5 says already flaked. The `reschedule.
           deadlock` assertion is the discriminator that tells the two apart, so this is a false
           *failure*, not a false pass — but it is the failure that will be blamed on ADR-0030.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tests/concurrency/refused-move-leaves-original.test.ts:602
claim:     The positive witness asserts `max(attempt) >= 2` and `conflicts.length >= 1600`;
           the file and the test-engineer's report both claim all 1600 movers reach attempt 2.
scenario:  One mover reaching attempt 2 and 1600 attempt-1 conflict lines satisfy both
           assertions. The claimed fact implies 3200 conflicts with 1600 of them at attempt >= 2.
           `conflicts.filter(c => Number(c.attempt) >= 2).length` is the measurement the file's
           own standard asks for ("forced by construction here rather than merely likely").
           The uniform-regression case is caught by the max; the heterogeneous one is not.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tests/concurrency/refused-move-leaves-original.test.ts:120
claim:     The 0.034% false-pass figure is a point estimate that propagates no uncertainty in p,
           and p is machine-dependent and unmeasured on the machine that runs the test.
scenario:  41 deadlocks in 7800 attempts gives a 95% interval on the rate of roughly
           0.27%-0.80%. At the lower bound, (1-0.0027)^1600 ≈ 1.3%, not 0.034% — 38x worse than
           reported, and worse than the 0.67% the raise from 25 to 40 trials was made to fix.
           The raise is still right; the headline number is over-precise. A CI runner with
           different timing could move p further in either direction and nothing measures it there.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tests/unit/persistence/appointmentRepository.test.ts:71
claim:     The comment says a booking's "statement's parameters are byte-for-byte what slice 06
           sent" and its own assertion three lines below contradicts it.
scenario:  Slice 06 sent two parameters, `[bay, tech]`; the assertion at :76 requires four,
           `[bay, tech, bay, tech]`. What is genuinely unchanged is the *set of advisory locks
           acquired* (two, class 1 then class 2) — which no test in this repository executes;
           it is argued from DISTINCT. This is the "comment asserting coverage that does not
           exist" shape stryker.config.mjs names as the project's most-counted defect.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
src/persistence/pgError.ts:108
claim:     `RESOURCE_BY_CONSTRAINT[constraint]` reaches Object.prototype, so `classify` can mint
           a resource for a constraint the map does not define — contradicting the invariant
           pgError.test.ts:55 asserts ("never an invented resource").
scenario:  Verified by execution: `classify({ code: '23P01', constraint: 'constructor' })`
           returns `{ kind: 'conflict', resource: <the Object constructor>, constraint:
           'constructor' }`. Same for toString, valueOf, hasOwnProperty, __proto__. No live
           input reaches it — the migrations define only no_bay_overlap and
           no_technician_overlap — so this is a latent hole in a totality claim, not a bug.
           `Object.create(null)` or `Object.hasOwn` closes it. Pre-existing; noted because
           A-05-6 made hardening these two guards this slice's own inherited obligation.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tests/concurrency/cancellation-takes-no-lock.test.ts:368
claim:     `raw.includes('40P01')` is sensitive only to a cancel-side deadlock victim, while its
           message reads as a general claim about the cancel/insert cycle.
scenario:  If PostgreSQL picks the *inserter* as victim, bookAppointment's no-verdict arm logs
           `{event:'booking.deadlock', bayId, technicianId, attempt}` and the SQLSTATE never
           reaches stdout — the assertion passes on a build where ADR-0023's one-directional-wait
           argument is false. The cancel-side victim does print it, because cancelAppointment
           has no classify and its error reaches server.ts:135's `{err}`. The test's 201/409
           split covers the other half, so the file is sound; the assertion is not the check it
           reads as. This is T-07-5's shape, and it predates ADR-0029 rather than being caused
           by it.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tools/slice/check.mjs (commit f757baf)
claim:     O-44 and O-50 enter this branch as a slice:check guard and appear in no acceptance
           criterion, no `inherits:` ref and no In-scope bullet of slice 07.
scenario:  `grep -n "O-44\|O-50" docs/slices/07*.md` returns nothing. The slice whose Ready
           gate was strengthened by O-41's completeness guard is itself carrying undeclared
           scope — orchestrator-authored, tooling-only, low risk, and the check it added is the
           one currently reporting the reviewer's own dispatch as unaccounted.
```

```
**reviewer** · `.claude/agents/reviewer.md@f6d46bf` · MINOR
tests/concurrency/refused-move-leaves-original.test.ts:593
claim:     `service.logRecords()` is read with no drain wait, unlike no-spurious-refusal's
           `awaitLogRecords`, so the final trials' lines may not be in the buffer yet.
scenario:  A `reschedule.deadlock` emitted by trial 39 can be in the child's stdout pipe when
           `logRecords()` is called, leaving `deadlocks.length` at 0. The `badAnswers` 500 check
           covers it independently, so the claim survives on two observers — but the log-based
           assertion's completeness floor has 50% slack (3200 conflicts expected, >= 1600
           asserted) and the file does not say why it diverges from the drain convention.
```

**Two notes that are not findings against the diff**, but will bite at the gate: `npm run defects:check` currently fails (`docs/DEFECTS.md is stale`) because I‑07‑4 and I‑07‑5 sit in an uncommitted `events.jsonl`; and `slice:check 07` reports "tests green — FAIL" citing run `34051339829` (the red) when run `34052328823` at `f63f887` succeeded. Both are the orchestrator's bookkeeping, not the implementer's or the test-engineer's — but the gate will be shown a FAIL that the evidence does not support.

**Deliberately not raised**: I found nothing wrong with the barrier mechanism, the `xmin`/`ctid` instrument, the AC‑4 fixture geometry (I traced I/J/blocker intervals and the qualification wiring independently — the forced attempt‑2 is genuinely structural, and CB blocks A's target bay independently of B, so "neither move can ever succeed" is doubly guaranteed), the layering, or the two deviations. The AC‑4 test file is the strongest test-engineer artifact this project has produced, and the T‑07‑5 catch is the kind of thing that is only ever found by someone who checks their own instrument against a raw dump.

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "src/application/rescheduleAppointment.ts", "line": 196,
     "claim": "ADR-0030's `leave` is read outside the transaction and never re-validated, so concurrent reschedules of the same appointment lock a pair the row no longer occupies and vacate one they never locked.",
     "scenario": "Two PATCHes of A (bay0/tech0) both read `existing` at :121. Request 1 commits a move to (bay1,tech1). Request 2's attempt 1 locks only bay0/tech0, and `rescheduleAppointmentById` guards on id+status only (appointmentRepository.ts:424-425), so its UPDATE vacates bay1/tech1 unlocked. A booking contending bay1 closes the cycle -> 40P01 -> 500."},
    {"severity": "MAJOR", "file": "src/persistence/appointmentRepository.ts", "line": 147,
     "claim": "The docblock's \"load-bearing symmetry\" — both racers of a mutually-vacating pair send the same multiset — is false, and is falsified by this slice's own AC-4 fixture.",
     "scenario": "AC-4 attempt 2: A sends {(1,bay0),(1,bay1),(2,tA)}, B sends {(1,bay0),(1,bay1),(2,tB)}. Not the same multiset. The total order on (cl, hashtext(key)) is what prevents the cycle; the symmetry is a special case of the ADR's own fixture and is mislabelled as the mechanism. tests/unit/persistence/appointmentRepository.test.ts:110 asserts the same over-general claim."},
    {"severity": "MAJOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 541,
     "claim": "`succeededCount` is computed and never asserted, so the header's structural claim that neither move can ever succeed is argued rather than measured.",
     "scenario": "A fixture regression letting 100 of 1600 movers succeed passes badAnswers (200 accepted), unchangedViolations (409-only), conflicts.length >= 1600 and the overlap check — green, with 100 movers that never entered a contended cross-vacate."},
    {"severity": "MAJOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 550,
     "claim": "AC-4 releases 40 concurrent requests against a 10-client pool with a 1000 ms acquire bound, 40 times, and misattributes the resulting 500 to a deadlock.",
     "scenario": "createPool sets no `max` (pg default 10) with CONNECTION_TIMEOUT_MS=1000 (db.ts:41,56). A queued acquire past 1 s rejects codelessly -> classify 'other' -> rethrown -> 500 -> badAnswers fails saying \"an unresolved 40P01 surfacing at the edge\" while deadlocks.length is 0. Twice the racer count of no-spurious-refusal, the file I-07-5 says already flaked."},
    {"severity": "MINOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 602,
     "claim": "The positive witness asserts max(attempt) >= 2 and conflicts.length >= 1600, while the file and the step-3 report claim all 1600 movers reach attempt 2.",
     "scenario": "One mover at attempt 2 plus 1600 attempt-1 lines satisfies both. The claimed fact implies 3200 conflicts with 1600 at attempt >= 2, which is the measurement the file's own standard asks for."},
    {"severity": "MINOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 120,
     "claim": "The 0.034% false-pass figure propagates no uncertainty in p, and p is machine-dependent and unmeasured on the machine that runs the test.",
     "scenario": "41/7800 gives a 95% rate interval of ~0.27%-0.80%. At the lower bound (1-0.0027)^1600 is ~1.3%, 38x the reported figure and worse than the 0.67% the raise to 40 trials was made to fix."},
    {"severity": "MINOR", "file": "tests/unit/persistence/appointmentRepository.test.ts", "line": 71,
     "claim": "The comment says a booking's statement parameters are byte-for-byte what slice 06 sent; the assertion five lines below requires four parameters where slice 06 sent two.",
     "scenario": "Old test asserted [bay, tech]; new asserts [bay, tech, bay, tech]. What is unchanged is the lock set (two locks), which no test executes — it is argued from DISTINCT."},
    {"severity": "MINOR", "file": "src/persistence/pgError.ts", "line": 108,
     "claim": "RESOURCE_BY_CONSTRAINT[constraint] reaches Object.prototype, so classify can mint a resource for a constraint the map does not define, contradicting pgError.test.ts:55's invariant.",
     "scenario": "Verified by execution: classify({code:'23P01', constraint:'constructor'}) returns {kind:'conflict', resource: <Object constructor>, constraint:'constructor'}. Same for toString/valueOf/hasOwnProperty/__proto__. No live input reaches it; latent hole in a totality claim."},
    {"severity": "MINOR", "file": "tests/concurrency/cancellation-takes-no-lock.test.ts", "line": 368,
     "claim": "raw.includes('40P01') is sensitive only to a cancel-side deadlock victim while its message reads as a general claim.",
     "scenario": "An inserter-side victim goes through bookAppointment's no-verdict arm, which logs booking.deadlock without the SQLSTATE, so the string never reaches stdout and the assertion passes on a build where ADR-0023's argument is false. Predates ADR-0029."},
    {"severity": "MINOR", "file": "tools/slice/check.mjs", "line": 1,
     "claim": "O-44 and O-50 enter this branch (commit f757baf) and appear in no acceptance criterion, no `inherits:` ref and no In-scope bullet of slice 07.",
     "scenario": "grep -n \"O-44|O-50\" docs/slices/07*.md returns nothing. Undeclared scope on the slice that built O-41's completeness guard."},
    {"severity": "MINOR", "file": "tests/concurrency/refused-move-leaves-original.test.ts", "line": 593,
     "claim": "service.logRecords() is read with no drain wait, unlike no-spurious-refusal's awaitLogRecords, so late lines may be missing from the buffer.",
     "scenario": "A reschedule.deadlock from trial 39 can still be in the child's stdout pipe, leaving deadlocks.length at 0. The badAnswers 500 check covers it independently, but the log completeness floor has 50% slack (3200 expected, >= 1600 asserted)."}
  ],
  "mutation": {"score": 0.9385, "survivors": 71},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "ADR-0030 is correct and the lock statement implements it well — appointmentRepository.ts is 100% mutation score with zero survivors, and no survivor anywhere sits on a line this slice changed. Two things need a ruling: the move's `leave` pair is read outside the transaction and is stale under a concurrent reschedule of the same appointment, which breaks ADR-0030's own rule on that path; and the docblock calls a false symmetry claim load-bearing, falsified by this slice's own AC-4 fixture. Both are the architect's to rule (b) or (c) — I am not raising a DCR because the design is right and the implementation departs from it, not the reverse. A-05-6's two survivors are confirmed equivalent, verified analytically and by differential-testing 254 inputs, though the proof as summarised only covers one of the two guards. The T-07-5 sweep found no assertion made vacuous by ADR-0029; it did find one raw-SQLSTATE check that has always been half-blind for a different reason."
}
```
