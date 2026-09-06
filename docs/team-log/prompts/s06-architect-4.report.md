# Report · slice 06 · architect · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule AC-1 wording and affected=0 residual
- Returned: 2026-09-06T14:07:13.288Z
- Duration: 373s

---

Both findings ruled. Committed at `ff1900c`, two files, `src/` untouched.

## Neither ruling changes what the implementer is building

Stated first because you asked for it prominently. T-06-6 *removes* an expectation the implementer could never have met (a duration change on the move path) and adds nothing; a duration change stays out of scope — it is a cancel plus a booking, as the slice file already says. T-06-7 accepts a residual with no new control. The implementer's current work stands unchanged.

## T-06-6 — AGREE. §6 outcome (a), clarification. AC-1's example is amended; the test is right

The finding is correct and structural, not a matter of care. `PATCH` carries `startsAt` only (design §3, `additionalProperties: false`), and ADR-0025's context fixes the interval's length to the appointment's service type, which a move may not change. `[09:15, 10:15) → [09:15, 11:15)` is not a request this API can express: same `startsAt` means the same interval, which is OQ-06-1's no-op, and a longer one means a duration change nothing on the path performs. The example was never issuable.

The substitution preserves every property AC-1 actually asserts, and is in one respect stronger: `[09:00,10:00) → [09:15,10:15) → [09:45,10:45)` exercises self-overlap on **both** moves, where the original's second move (`[09:15,11:15)`, same start) would have been the weaker of the two. Ruling **(c)** is unavailable and I did not reach for it — I can name no acceptance criterion, `QS-*` or §2 invariant that fails, and §6 says that makes it (b) or, here, (a): the design is right and the wording is unexecutable.

I rule explicitly against the alternative the test-engineer flagged: a genuine duration change does **not** belong on the move path.

**A second correction the finding did not ask for, which I owed.** `arc42/10-quality-requirements.md` QS-6 carried the identical unexecutable example, and it names `tests/integration/reschedule-self-overlap.test.ts` as its evidence — the very file just committed. Under CLAUDE.md §4 arc42 wins any disagreement, so leaving it would have made the source of truth contradict its own named test until step 7. Fixed now, and the edit is word-negative (1632, ratchet held).

**Exact AC-1 replacement text — yours to land in `docs/slices/06-reschedule-atomic-move.md`.** It replaces the whole `AC-1` bullet including its existing `<br>` clause, which is unchanged. Measured at +45 words against the file's 60 of headroom.

```markdown
- **AC-1** — *Worked example amended at step 3 under T-06-6: the original's second move extended
  `[09:15, 10:15)` to `[09:15, 11:15)`, a duration change `PATCH` cannot express — it carries
  `startsAt` only and the interval's length is the service type's (ADR-0025). What the criterion
  asserts is unchanged; §10's QS-6 is corrected with it.* Given A confirmed `[09:00, 10:00)`, when A
  is rescheduled to `[09:15, 10:15)` and then again to `[09:45, 10:45)`, then both succeed, **each
  move overlapping the interval it replaces**, the id is unchanged, **the bay and technician are
  unchanged** (asserted on the response body, which carries both), and **no `23P01` is raised** — the
  row does not conflict with the version it replaces. *(QS-6)*
  <br>The bay-and-technician clause was added at step 2 under I-06-2 and it is what makes AC-1 pin
  QS-6 at all: the self-overlap semantics are only exercised if the new version lands in the *same*
  bay with the *same* technician, so under a shuffle-from-first candidate order `[09:00,10:00) →
  [09:15,10:15)` could be satisfied by allocating bay 2 and **AC-1 could not fail**. ADR-0027 fixes
  the order; this clause makes the criterion able to observe it.
```

**Does two-of-five generalise?** Yes, and the cause is sharper than "the slice was under-specified". Both criteria were written at backlog time, in the vocabulary of the *request*; both were falsified by decisions that later moved the fact into the *row* — AC-5 by ADR-0025 putting existence in the read, AC-1 by duration being the service type's. Reading missed both, twice, because reading cannot detect that an example's vocabulary has expired. Attempting caught both. The control is a step-1 ordering rule: fix the interface delta **first**, then walk every acceptance criterion against it as a paper execution. My own step 1 did this in the other order — §2.2 before §3's interface table — which is exactly why I caught AC-5 while writing the statement and missed AC-1. That belongs in the retro as a change to step 1, not as a note about slice 06.

## T-06-7 — AGREE on the finding, DISAGREE with one sub-claim. §6 outcome (b): accepted, no new control

The residual is real and correctly measured, and the window-bounding was the right response. Three things make it acceptable, and the third is a correction to how the finding frames itself.

**It is unsound only toward false failures.** Under rejected Option A the `affected = 0` row is written unconditionally by the request under test — no interleaving can suppress it — so the assertion cannot be satisfied by a broken build. There are no false passes. An instrument that can accuse the innocent but never acquit the guilty is sound for what §10 asks of it: it discriminates Option A from Option C in the direction that decides the build. The cost is flake, not blindness.

**The narrowing did not open this hole — it inherited a strictly smaller one.** This is where I disagree with the header's phrasing that *"any-firing would not have had this hole and would have had a worse one."* Any-firing has this hole too: an AC-4 request fires the statement-level trigger just as an unknown-id one would. Its false-failure set is a strict *superset* — every concurrent `UPDATE`, not only the zero-row ones. So the narrowed predicate is not a trade of soundness for stability; it is a reduction of the same unsoundness by roughly the ratio of zero-row statements to all statements. The finding is nonetheless correct as a measurement, and the thing it falsifies is **mine**: design §2.3's sentence *"only one issued and matching nothing records zero"* was too strong, and I have replaced it.

**Where it is recorded, and why nothing is deferred.** §11 at step 7, as a known false-failure source carrying its named remedy: tag the service under test's connection (`application_name`) and have the statement-level trigger record `current_setting('application_name')`, which attributes a zero-row statement to the process under test and closes the residual completely. I decline to schedule it, on ADR-0019 applied exactly as I applied it to A-06-2 in the same design — **the mechanism exists but the hazard has not fired.** Scheduling a fix for a flake nobody has observed puts a live obligation on a slice to close a hole that may never open, and it is the test-engineer's file to change if it does. No `deferred_to`, so no tombstone: the remedy is written down so that a future flake is a lookup rather than a rediscovery. If it fires before the gate, the fix is in `tests/integration/` and nothing in `src/`.

## Budget

`06-design.md` is at **3000 of 3000**. A-06-5 said the next amendment would cost argument, and it did. Paid by four deletions, each chosen because the fact has another home: the `appointment.ts` retirement's reasoning is ADR-0025 decision 6's; the slice-10 routing narrative is the event log's (`90a8d68`); the out-of-hours consequence is ADR-0025 decision 4's; and the rejected instruments lose their prose but keep their reasons. `docs:budget --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check` and `log:check` all pass.

One thing I did not touch: `test:tools` reports `docs/DEFECTS.md is stale`. I verified it is **stale at HEAD**, before my edits — it is not from this ruling, and regenerating it mid-flight would capture the implementer's in-progress state. Flagging it for you rather than fixing it.

Files: `/home/agentadmin/sources/keyloop-challenge/docs/slices/06-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/10-quality-requirements.md`, and the text above for `/home/agentadmin/sources/keyloop-challenge/docs/slices/06-reschedule-atomic-move.md`.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": ["§10"],
  "adrs": [],
  "quality_scenarios": ["QS-6"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": {
    "T-06-6": {
      "verdict": "AGREE",
      "outcome": "(a) clarification",
      "effect": "AC-1's worked example amended to match the committed test; QS-6 corrected in arc42 §10 for the same reason; a duration change stays out of scope",
      "changes_implementer_work": false
    },
    "T-06-7": {
      "verdict": "AGREE on the finding, DISAGREE that any-firing lacked the hole",
      "outcome": "(b) accepted, no new control",
      "effect": "residual is false-failure only and a strict subset of the rejected predicate's; recorded in §11 at step 7 with its remedy (application_name tagging); no deferral, so no destination slice named",
      "changes_implementer_work": false
    }
  },
  "message": "AC-1's example was unexecutable and so was the QS-6 copy of it in arc42, which named the very test that had just contradicted it; both amended, and the AC text is handed over rather than committed. The one-statement discriminator's residual is accepted because it can only accuse a correct build, never pass a broken one, and because the narrowing shrank the hole rather than opening it — the over-strong soundness claim it falsified was mine and is corrected. Design file is at exactly 3000 of 3000, paid for by four deletions whose facts live elsewhere."
}
```
