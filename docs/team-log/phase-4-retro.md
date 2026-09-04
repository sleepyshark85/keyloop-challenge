# Phase 4 — the pilot retro

**Judged against [`process-criteria.md`](process-criteria.md), which was committed before slice 00a
began.** Git history is the proof of ordering. Every figure below is measured from
`events.jsonl`, git, or a command re-run at the retro — none is narrated.

Phase 4 ran **two** slices, not one: Gate B split the walking skeleton (00a) out of the pilot (00)
on the grounds that bundling the scaffold would make the retro measure setup friction rather than
the loop. That decision is itself now measurable, and §5 below reports on it.

---

## The verdict

| | Criterion | Result |
|---|---|---|
| **C1** | Test-first genuinely held | **PASS** |
| **C2** | Independence genuinely held | **PASS on git, weakened on hooks** |
| **C3** | The reviewer produced substance | **PASS** |
| **C4** | Architecture held unprompted | **PASS** |
| **C5** | Gates are in the right places | **FAIL** |
| **C6** | The budget is real | **FAIL** |
| **C7** | The record is trustworthy | **PASS with three open defects** |
| **C8** | The board is legible | **the human's** |

**Two non-fatal criteria fail. Neither is C1 nor C2.** The decision rule, fixed in advance:

> *1–2 non-fatal criteria fail → tune the specific mechanism (prompt, hook, model), proceed to slice
> 01. **No second pilot** — tuning is verified by slice 01's own metrics.*

**Read off rather than argued about: tune, and proceed to slice 01.**

---

## C1 — test-first genuinely held · PASS

Four `check.run` records, all `source: derived`, all produced by `collect-ci.mjs` from real GitHub
runs:

```
00a   03:01  run 33831214774  failure      00   08:59  run 33856015886  failure
00a   06:39  run 33844632820  success      00   10:22  run 33862313022  success
```

Exactly two red commits across both slices, both authored by the test-engineer, both matching
`^test\(.+\): .*\(red\)$`.

**The criterion's second clause is the one that mattered**, and it was satisfied by design rather
than by luck. C1 requires *"a real assertion failure rather than a missing import"*. Slice 00's
design made that structural: `beforeAll` may only connect — no DDL, no DML, no seeding — so a
malformed migration could not turn the red into a `globalSetup` crash. Measured at the red commit:
ten failures, all `AssertionError` inside collected test bodies, zero hook or collection errors.

**Slice 00a could not satisfy C1 and said so in advance.** `collect-ci.mjs` is built *by* 00a, so
the emitter of the evidence did not exist when the evidence was produced. The architect recorded it
as `UNMEASURABLE`, never as a pass — and then reversed its own ruling on identifying the actual
error: *conflating the moment of authoring with the moment of recording.* A CI run is durable for 90
days, so 00a's C1 was backfilled at its gate. **Slice 00 measured it live**, which is what the pilot
proper was for.

`red-proof` ran as a live job for the first time on slice 00, on a `tests/integration/`-only red
commit — the broad reading of AC-6 that the implementer's O-1 escalation produced — and classified
it correctly.

---

## C2 — independence genuinely held · PASS on git, weakened on hooks

**No commit in either slice mixes ownership zones.** Checked mechanically across all commits since
the phase-3 merge: no commit touches both a test-engineer path and `src/`/`tests/unit/`.

The discipline was exercised rather than merely observed. At slice 00a the implementer found a
typecheck error in `tests/support/service.ts` — a file it may not edit — that would have failed CI at
green commit 9. **It raised it rather than fixing it**, and the test-engineer fixed it. That is §5's
mechanism working in the direction that is cheapest to cross quietly, because the change was
obviously correct.

**Why "weakened" rather than a clean pass.** Three findings say the enforcement is softer than the
criterion assumes, and C2 is measured from *"git history **and hook denials**"*:

- **R-4** — an absolute path into the repository bypasses the Bash guard entirely; the relative form
  is denied. A boundary crossed that way leaves no denial.
- **O-9** — `tests/integration/` is not in `TEST_OWNED`, so an implementer write there is ALLOWed.
  This is not an oversight to patch: §5 makes the directory *shared*, and the enforceable form is
  00a's structural rule — deny a write to an existing file there that does not import `src/` — which
  needs the hook to read file contents.
- **O-10** — `guard-paths.mjs` cannot see git operations at all. It denies the architect a `Write`
  under `src/` and cannot deny it a `git add` of the same path. A concurrent `git add` nearly
  recorded the architect committing `src/`, which would have corrupted this very criterion.

The pass is real. The margin is thinner than the criterion's wording implies, and the retro records
that rather than reporting a clean pass.

---

## C3 — the reviewer produced substance · PASS

**17 reviewer findings, every one carrying a concrete failure scenario.** The criterion counts
style-only findings and findings without a scenario as failure; there were none of either.

The two reviews did not read the diff and agree. Both verified against a live database rather than
against the suite:

- At 00a it proved the layering ruleset's widening does real work by cruising a fixture under both
  rule variants, and found six commits with **no CI verdict at all** — cancelled while pending.
- At 00 it built **nine synthetic mutants** against the exclusion constraints and could not defeat
  T-4's remedy; then attacked the invariant under genuine concurrency — 8 racing clients, 1
  committed, 7 rejected, the losers blocking on the index page before failing.

**One honest qualification.** The mutation weakness at 00a was surfaced by the orchestrator
provisioning Stryker, not by a reviewer. C3 is therefore judged on what the reviews found *beyond*
the register, which is where the 17 findings sit.

**The whole register: 56 findings, all with scenarios**, raised by reviewer 17, test-engineer 16,
implementer 12, architect 6, orchestrator 5. **Mean escape distance 1.46 steps; 8 caught at distance
zero.** That number exists because findings are logged rather than narrated — before this pilot,
`review.finding` was the reviewer's alone and a step-2 objection had no home at all.

**Zero loopbacks across both slices.** Every finding was ruled (a) or accepted; none required
returning to step 1.

---

## C4 — architecture held unprompted · PASS

```
00a  03:01  depcruise = not-run     00  08:59  depcruise = pass
00a  06:39  depcruise = pass        00  10:22  depcruise = pass
```

At 00a the implementer's first submission passed layering with no review round — measured on every
commit, not only at the end. `not-run` at 00a's red commit is correct and fails closed: the layering
step did not exist yet, and J-3 chose that third value precisely so an absent check cannot read as a
pass.

**C4 was predicted vacuous for slice 00 in advance**, and the prediction held: the slice adds three
`.sql` files and no TypeScript, so `lint:arch` cruises the same nine `src` modules before and after.
The architect stated this *before the result*, **"because a pre-registered criterion may not be
reinterpreted after the result"** — which is the discipline that makes the pass credible rather than
convenient.

The reviewer refined it in the direction that makes C4 *less* vacuous, not more: the slice adds three
cruised modules under `tests/`, two inside the directory set that 00a's ruleset widening guards. A
`seed.ts` importing `src/persistence/schema.ts` would have failed `lint:arch`. So layering had a live
thing to check that it had not had before, and it passed. The accurate form is *"it could not have
failed on `src/`"*.

---

## C5 — gates are in the right places · **FAIL**

The criterion: *≤1 human intervention outside a defined gate.*

Thirteen human events are recorded. Six are `gate.decided` at defined gates. Seven are not:

| | |
|---|---|
| `escalation` ×2 (slice 00a) | AC-6's reading; two constitutional amendments logged late |
| `finding.ruled` ×2 (slice 00a) | the O-1 remedy; strengthen the unit tests |
| `escalation` ×1, `finding.ruled` ×1 (slice 00) | AC-10's scope; T-9's clarification |
| `escalation` ×1 | the arc42 scope widening |

**Seven against a ceiling of one.** The criterion fails on its stated measure and the retro records
it as a failure rather than reinterpreting the threshold — `process-criteria.md` forbids exactly
that: *"No redefining a criterion after seeing the result."*

**What the failure actually says**, which is not what the criterion assumed. Every one of the seven
was a decision the constitution reserves to the human: §6 puts scope, acceptance criteria and
quality goals with the human, and each intervention was an architect or reviewer correctly declining
to decide something that was not theirs. The test-engineer measured AC-10's property, then refused to
assert it, because *"a test-engineer who writes an assertion no criterion asked for has legislated
scope"*. That is the boundary working, and it produced an out-of-gate intervention every time.

So C5's threshold encodes an assumption the methodology contradicts: that a slice needs human input
only at its gate. It does not, and the architecture of §6 is why. **The threshold is wrong, and it is
recorded as a failure anyway** — changed for future slices, not for this one.

**And there is a second, worse reading that the reviewer found**, which is the part that deserves the
FAIL on its own merits:

> **R00-1 — slice 00a merged without ever being set `status: done`, so `slice:check` reported
> `FAIL dependencies merged` from the moment slice 00 began, on every run, for the whole slice, and
> nobody read it.**

All thirteen slice files were `status: ready`, and each `depends_on` its predecessor, so one missed
edit had failed the Definition of Ready for every remaining slice. The reviewer's framing:
**"Gates being in the right place is not the same as gates being read."**

---

## C6 — the budget is real · **FAIL**

Agreed in advance: **≤ 45 min wall clock and ≤ $8 for slice 00**, extrapolating to ~10 hours and
~$100 over 13 slices.

| | slice 00a | slice 00 |
|---|---|---|
| agent runs | 25 | 17 |
| by role | architect 10 · test-eng 8 · impl 6 · reviewer 1 | architect 9 · test-eng 5 · impl 2 · reviewer 1 |
| elapsed, first to last finish | **11.9 h** | **3.2 h** |
| output tokens | 486,952 | 513,187 |
| cache-read tokens | 581,870,401 | 474,006,700 |

**The 45-minute ceiling is exceeded by more than an order of magnitude.** Even the most favourable
honest reading — summing only the 15 non-resumed spans at 00a — gives 299 minutes against 45.

**A measurement caveat that does not rescue it.** 24 of 42 runs carry `duration_caveat: agent was
resumed`, and a resumed agent's span includes the idle gap between invocations, so summing raw
durations overstates by an unknown amount. This is O-3's root cause, and it means the retro cannot
report a defensible agent-time figure at all. **Elapsed wall clock is not disputable, and 15.1 hours
across two slices against a 10-hour, 13-slice budget is the number that decides this.**

**Cost is not computed here.** METHODOLOGY records cost as tokens × pricing rather than as a stored
figure, and the token collector is itself unpinned — **R-5: delete the accumulator and all 216
assertions still pass**, so a change in transcript shape would silently zero every count. Reporting a
dollar figure derived from a collector nothing tests would be the exact failure this pilot has spent
two slices cataloguing.

**What the failure says.** The pilot was not a trivial slice run through the loop; it was two slices
that between them found 56 defects, built the defect register, the mutation gate, the CI pipeline and
the collector, and corrected the constitution three times. That is not the 45-minute activity the
ceiling was written for. But `process-criteria.md` is explicit that a threshold turning out to be
wrong is *"changed for future slices and the pilot is still recorded as having failed it"*.

**It fails, and the correct response per the criterion's own wording is to cut slices or reduce agent
count — not to proceed and hope.** That is the substance of Gate D and it is the human's.

---

## C7 — the record is trustworthy · PASS with three open defects

| Clause | Result |
|---|---|
| Every record schema-valid | **yes** — enforced in CI on every push |
| Zero events written by a subagent | **yes, 0** |
| `derived` events actually produced by tooling | **yes** — 46 `agent.finish` from the `SubagentStop` hook, 4 `check.run` from `collect-ci.mjs` reading `gh` |

The `derived` tier is genuinely earned: `write.mjs` refuses that tier from the orchestrator's path,
and `collect-ci.mjs` accepts no `--conclusion` flag, so nothing enters as `derived` that was not
parsed from tooling output.

**Three defects stand against it**, all recorded and none fixed:

- **O-3** — `log:audit` reports 27 discrepancies. Confirmed by arithmetic rather than assumed: per
  role, `agent.finish` minus transcripts equals discrepancies exactly, and all three MISMATCHes have
  log-duration *shorter* than transcript-duration, which is the direction the resume theory predicts
  and the opposite of what a fabricated record would produce. **An audit that cries wolf 27 times is
  one nobody reads.**
- **R-10** — the audit's own legend defines OMISSION as including *"a commit exists and the log does
  not say so"*, and zero events carry a `git` field, so that half is inert by construction.
- **R-5** — the token collector is untested, which is why C6 cannot report cost.

---

## C8 — the board is legible · the human's

Declared as a human judgement in advance. `npm run board` renders 17 slices and 124+ events across
four panels. The question is whether *"what happened in this slice, and why"* is answerable from
`docs/board.html` alone.

Two things now exist that did not when C8 was written, and both bear on it: **`docs/DEFECTS.md`**,
generated from the log, and the PR threads, which carry every objection, ruling and disagreement
under the §9 attribution convention.

---

## What to tune, in order

Per the decision rule: tune the specific mechanisms, proceed to slice 01, no second pilot.

**1 · C5's threshold, and the reason it was wrong.** Raise it, and distinguish *interventions the
architecture requires* — scope, acceptance criteria, quality goals, which §6 reserves to the human —
from *interruptions*, which is what the criterion was trying to count. Seven of seven were the
former.

**2 · C6, which is the substantive Gate D question.** Either cut slices or reduce agent count. The
observed shape argues for the second: **the architect ran 19 times across two slices**, largely
through resume-driven adjudication rounds, and the adjudication is where the value was. A cheaper
model for the mechanical passes, or fewer roles per slice, are both live.

**3 · The C7 cluster** — O-3, R-10, R-5. All three are collectors reporting numbers over work they
did not do, which is the pilot's most-repeated shape. R-5 in particular blocks C6 from ever being
measurable.

**4 · The C2 cluster** — R-4, O-9, O-10. O-10's remedy has landed (`git commit --only`); the other
two need the hook to read file contents.

---

## The finding that is not a criterion

Eight distinct instances, across both slices, of **one shape**: a mechanism that reports success over
work it never did.

| | |
|---|---|
| A cruise with no resolvable compiler | 0 modules examined, exit 0 |
| A guard counting modules overall | `src/` never looked at |
| A tool test never wired into the chain | assertion never ran |
| Fixture paths absolute against the local cwd | the branch never taken |
| A mutation runner scoring 142 mutants | none of them activated |
| A wrapper's exit-code rule | nothing would fail on deletion |
| The gate reading a mutation record | as evidence that tests ran |
| A resume point advancing on a per-slice gate | the project declared finished |

Not one was found by reading code. Every one was found by asking **"what would happen if this were
removed?"** or by running the thing against a mutant.

The architect generalised it into two tiers, and the second is cheaper than the first:

> **Tier 1** — explaining why something works by naming a mechanism's *capability* instead of its
> *configuration* or its *discriminating case*. **Needs something run.**
>
> **Tier 2** — a document contradicting itself. **Needs only something read.** *"It came first both
> times and was found last both times."*

And the operational form: **for a discrimination claim, name the mutant; for a mechanism claim, name
the call site.**

That is the pilot's most transferable output, and it is worth more than any single criterion's
verdict — because it is the thing that will still be catching defects at slice 09.
