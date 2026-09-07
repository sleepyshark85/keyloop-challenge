# Report · slice 07 · architect · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 step 7 as-built
- Returned: 2026-09-07T03:24:55.618Z
- Duration: 1083s

---

Step 7 is committed and every doc gate is green. Here is the record.

## Report

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§5.2", "§6.1", "§6.3", "§8.6", "§10.2", "§11.1", "§11.2", "§11.3"],
  "adrs": [],
  "quality_scenarios": ["QS-4", "QS-5"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": null,
  "message": "arc42 now describes what merged: §6.1 and §8.6 carried a premise ADR-0030 falsified, §6.3 claimed a move races exactly as a booking does, and §11's F-02-9 claimed a discharge by measurement it did not have. All three are corrected in place. D-07-1 goes to slice 09, R-07-12 rides with it, R-07-13 is fixed in both files, and O-54 goes to the retro with the reviewer's wording plus the residual it does not close. No ADR was authored at step 7; ADR-0030 and ADR-0031 stand as accepted."
}
```

Commit `aa9673f` on `slice/07-reschedule-under-contention`. Files: `/home/agentadmin/sources/keyloop-challenge/docs/arc42/{05-building-blocks,06-runtime-view,08-crosscutting-concepts,10-quality-requirements,11-risks-technical-debt}.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-reschedule-under-contention.md`.

## The four rulings

**O-53 — D-07-1's destination is slice 09.** Slice 11 is a tombstone; 09 declares `absorbs: ["10","11"]` and is where capacity is measured, so 09 is the live name for the work I meant. It is now recorded in arc42 §11's new `D-07-1` row, so the destination exists in the source of truth and not only in a log entry.

On the tombstone question I put to the gate, my recommendation, since renaming slice files is the orchestrator's and the fold was a Gate D ruling: **a louder in-file marker will not work.** All three failures — OQ-05-2→10, A-06-2→10, D-07-1→11 — were reached for from memory without the file being opened, so any remedy inside the file arrives after the mistake. Two things would: rename the tombstones so the *number* stops resolving to a plausible filename (`10-folded-into-09.md`), and have the write-path guard, which has now caught all three at the same place, **print the `folded_into` value** instead of only refusing. That converts three catches into three self-corrections at zero cost. I would not rename the slice ids themselves — Gate C's approved backlog shape is part of the record.

**R-07-13 — upheld, and it was mine.** Corrected in both files. The design file (`07-design.md`) now states the mechanism the test actually uses: `pg_locks` joined against `hashtext` **inside one SQL statement**, with only resource ids crossing into JavaScript. The slice file's AC-5 carries the same correction with the reason attached — pulling `objid` out compares the catalogue's unsigned `oid` against `hashtext`'s signed `int4`, the same bits read two ways. My step-5 deferral named one file when the string was in two; the reviewer was right to check.

**R-07-12 — upheld, and it belongs to slice 09, not here.** The finding is correct: `POOL_MAX = 10` matches the service's real ceiling only by coincidence, and D-07-1's own fix is what breaks the coincidence. Two things I will not do. I will not have this fixed in slice 07 — no acceptance criterion fails today, the test is the test-engineer's, and a change to a green concurrency test at step 7 buys nothing. And the remedy is **not** to bump the literal when `max` is set; it is to derive the bound from the pool the service built, because the failure mode is precisely that a literal and a config value drift silently. It is booked in §11's `D-07-1` row so the two travel together: *"AC-4's racer bound is a literal copy of that 10, so it breaks with it."*

**O-54 — the reviewer's wording goes to the retro, and it does not close what it looks like it closes.** Both roles are right that §7's count is a proxy for §2.4 and that the proxy breaks the moment §6 permits a loopback that adds a criterion; amending the first red would have satisfied §7's letter by manufacturing a red that never reddened what it claims to have reddened. Between the two remedies the reviewer's is better and for the right reason: *"per design"* has no commit-countable definition, and moving an auditable rule to an arguable one is the direction §2.3 forbids, whereas *"one per slice plus one per declared loopback that adds or amends an acceptance criterion"* is derivable from `loopbacks:`, which `slice:check` already reads.

My addition, which the retro should carry alongside it: **the caveat cannot be enforced by counting either.** A red that fires for an instrument defect is byte-identical in git to one that fires for the build — this slice supplied the instance. So the wording buys auditability for the *count* and none for the *evidence*, and the residual is exactly R-7i's shape. The retro should adopt the wording **and** book the residual, rather than read the wording as having fixed §2.4. I cannot amend `CLAUDE.md` by ruling (A-06-6's ground), so the wording itself is the human's.

## F-02-9 and A-05-6 — dispositions for the log

**F-02-9 — DISCHARGED.** By measurement *and* by two fixes, which is the correction. ADR-0030 was measured (11.7 % of contended move attempts → `40P01`, 0 after). ADR-0030 alone left the move path violable until `da68d67`: the lock set was computed from a read taken before the transaction opened, so a row moved underneath left a mover holding a stale set — a live path could violate ADR-0030's own rule. ADR-0031 closed it. §11's entry now reads *"Discharged at slice 07 — by measurement **and** by two fixes"*, and the rule it stated is corrected in place: *take both locks* was necessary and not sufficient; a write locks **every resource it is in flight against**. Not re-deferred; nothing carries into slice 08.

**A-05-6 — DISCHARGED.** Two directed unit cases exist for `pgError.ts:80:9` and `103:39`. Both mutants survive, and survive legitimately: they are ADR-0016's equivalent-mutant residue, predicted at step 2 before any code was written, argued analytically at step 4, and differential-tested over 254 adversarial inputs at step 5 with zero distinguishing inputs. The obligation's own escape clause — *"no production change is expected, and if one is needed that is the finding"* — fired: `R-07-7`, the `Object.prototype` reach in the constraint lookup, fixed at `3559dbd`. Not re-deferred.

## For the gate — not checked by anything

1. **Three `src/` comments still assert the premise ADR-0030 falsified.** `rescheduleAppointment.ts:104` (*"it names the write path that skipped ADR-0018's locks"*), `bookAppointment.ts:146` (*"a write path skipped them"*), `bookAppointment.ts:427` (*"a deadlock can only mean some write path did not take them"*). A-07-2 named two sites and both were fixed; nobody looked at the **booking** path, which repeats it twice. Comment-only — no behaviour, no test, no mutant can see it — but it is the fourth instance of D-06-4's shape, and a future reader acting on it reasons wrongly about the one rule this slice exists to establish. I cannot edit `src/`. It is not in arc42 because §11 had no room and a stale comment is not architecture; the defect register is its home.

2. **ADR-0029's ground moved and its decision did not.** ADR-0030 re-grounds it explicitly, but ADR-0029 is immutable and reads standalone as resting on the falsified premise. Nothing flags that to a reader who opens ADR-0029 first.

3. **AC-5's discrimination evidence lives outside the repository.** The reviewer's mutant control was run in a throwaway worktree; the result is in the PR and the log, not in CI. Nothing re-runs it, and `slice:check` reads that a red happened, not what it reddened. This is booked as R-7i's second instance in §11 and it is the one place I would want a human's eye, because it is the only evidence that AC-5 discriminates at all.

4. **AC-4's mutant-control rate is a number in a test header, not a threshold.** 1.87 % against 0.5 %, disjoint intervals, 0/1000 positive control — all correct, all unenforced. If the control weakens again nothing reports it. R-07-12 is the specific way it will weaken.

5. **D-07-1 is live in `main` right now.** A saturated connection pool answers `500` today, and `CONNECTION_TIMEOUT_MS` — chosen for an unreachable database — silently also bounds queue waits. Merging this slice ships that. It is undecided behaviour rather than a defect anyone has measured, which is why it goes to 09 rather than here.

6. **`docs/diagrams/concurrent-booking.svg` predates ADR-0018 and now ADR-0030/0031 too.** The caption says so and phase 6 refreshes it once; nothing checks a diagram against the prose beside it.

7. **Mechanical:** `slice:check` now reports `tests green` FAIL, because the newest collected CI run is `2bca770` and the head is `aa9673f`. This is a docs-only commit; the orchestrator needs to collect the run for the new head.

## What arc42 gained, and what paid for it

| Section | Gained | Let go |
|---|---|---|
| §5.2 | `lockResources` over every resource in flight; `lockAppointmentRow` | the F-05-1 recap's explanation, which ADR-0026 holds |
| §6.1 | ADR-0030's re-grounding of `40P01` | §6.1's re-narration of the fourth lock cell (§11 D-02-1 holds it); the R-02-2 provenance sentence |
| §6.3 | the two-pair rule, the in-transaction read, the two acyclicity mechanisms, the row-lock-waiter fact | the false one-mechanism sentence it replaces |
| §8.6 | the `500` row re-grounded on ADR-0030 | `GET /nope`'s before-and-after narration |
| §10 | QS-4's `xmin`/`ctid` and racing-move instance; QS-5's *no move answers `500`*; the in-flight bound | QS-5's cancel-then-insert sentence (§6.3 and the slice goal both say it); QS-1's observer recap (§8.5 holds it) |
| §11 | F-02-9 discharged honestly; `D-07-1` with slice 09; R-1's four-key move; R-7i's second instance | the register-reading preamble's second half; R-12's survivor-list line; the slice-01 scan closing; two provenance clauses (R-4, §11.3) |

`07-design.md` is 2,834 → 1,144 words, inside the 1,200 merged ceiling. Every arc42 file is at or under its ratchet ceiling — §6 and §10 land exactly on theirs — and `docs:budget:check`, `docs:refs`, `docs:adr-check`, `docs:check` and `test:tools` are all green.
