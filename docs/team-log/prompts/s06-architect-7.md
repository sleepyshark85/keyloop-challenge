# Prompt · slice 06 · architect · invocation 7

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 7 as-built
- Sent: 2026-09-06T16:44:32.307Z

---

Slice 06 **step 7 — AS-BUILT**, plus two rulings. Branch `slice/06-reschedule-atomic-move`, PR #15. Pull first. Step 5 is closed. I am gating this with you immediately after, so this is the last step before merge.

**The human delegated Gate E for slice 06 to you and me jointly** ("you and the architect decide if the PR is good to go"), and authorised starting slice 07 onward without a further human gate. That is recorded with its limits, including that **no human exploratory testing will have been done**.

## What happened at step 5

The reviewer returned **changes-requested**: one BLOCKING, three MAJOR, two MINOR, **no DCR** — it found no design defect. All are now closed or ruled:

- **R-06-A / your R-05-9** — you both reached the inert-`restore all` root cause independently, from the instrumenter source and from the report. Fixed at `a531fac`: four `// Stryker disable next-line all` directives. **Measured: ignored fell 93 → 8**, at L234/268/318/419, two each — exactly the four `never` arms and nothing else.
- **R-06-C** — the reviewer classified all 36 survivors: 27 killable, 9 unkillable by construction. Closed at `202397b` and `ebb6e37`. **`rescheduleAppointment.ts` 70.00 → 92.50, with exactly 9 survivors left.** Its classification predicted the post-fix number to the mutant.
- **§10 per changed file** — you and the reviewer ruled it identically and independently. **Every changed file now clears 0.75**: repository 100.00, booking 96.80, reschedule 92.50, server 90.91, routes 76.13, problem 75.00. Aggregate 89.33, repo-wide 93.77.
- **I-06-3 discharged.** The reviewer replayed the implementer's pre-loss edits onto `3589a77` and diffed against the merged blobs — six files byte-for-byte identical, including both deletions and the three `sed`-patched call sites that appear in no edit record.
- **AC-2 verified on the hard reading** — it drove the statement from `dist/` through a capturing driver: one `UPDATE`, no pre-read deciding legality.

## Two rulings I need from you

**O-46 — MAJOR, and it needs deciding before merge.** During the remediation the implementer **renamed an emitted event**: `DEADLOCK_EVENT` from `'booking.deadlock'` to `'reschedule.deadlock'` in `src/application/rescheduleAppointment.ts`, then asserted the new name. R-06-E asked for an *assertion*; the reviewer's rename sentence was the failure scenario showing the mutant survives, not a prescription.

Its argument is well made and documented in a docblock: the other three event names are deliberately shared with booking, but a deadlock names the write path that skipped ADR-0018's locks, and slice 09 counts deadlocks per path. It verified by repo-wide search that nothing outside `bookAppointment.test.ts` asserts the old string. **That is a good case for a decision it does not own** — the event taxonomy is what slice 09's QS-13 work counts, and R-06-E's own blast-radius argument is that slice 09 keys on these names.

The mutant is killed either way; only the emitted name differs. Ratify it and record it where slice 09 will read it, or revert to `booking.deadlock` and keep the assertion. **Also check**: its docblock cites I-02-6 for *"one taxonomy of log lines, not two"*, and I-02-6 as logged is about the constraint name reaching no observer the test-engineer may use. The citation may be misattributed.

**R-06-D — MINOR, and you called the shape yourself in ADR-0026.** The reviewer verified with a scratch `tsc --strict` over the real `src/`: omitting the lock is `TS2554`, a bare pair is `TS2345`, **but writing `__brand: 'ResourceLock'` by hand compiles clean.** So ADR-0026's stated purpose holds and is verified — *"forgot the lock" is a compile error* — and only the stronger sentence about `lockResources` being the **only minting site** overstates it. Forgetting is not forging. `src/domain/candidates.ts` shares the shape, so it is house-wide, not a slice-06 regression. The reviewer proposes a §11 residue line, not a code change. Accepted ADRs are immutable.

## Step 7 itself

Reconcile arc42 to what actually merged. The slice declares `arc42: ["§5.2","§6.3","§8.2","§8.6","§6.6","§10","§11"]` — the last three were added at step 5 and `slice:check` will verify the correspondence. Known obligations already routed here:

- **§6.3's follow-up read and §6.6's closing paragraph are struck**, per ADR-0025. §6.3 has been wrong since phase 2 — it mandates a read the design proves impossible to need.
- **§5.2's as-built cell** records `src/domain/appointment.ts` **retired**, not deferred (ADR-0025 decision 6), so the pointer does not dangle.
- **§8.6** gains the `route-not-found` row and the `appointment-not-confirmed` row, and its `500` residual is now the ADR-0024 invariant.
- **§11** gains: F-06-2's residual (`problem.ts` has no margin and its taxonomy is invisible to Stryker), R-06-D's forgeable-brand residue, T-06-7's `affected = 0` false-failure source with its `application_name` remedy, and O-48 if you want it — 8 unkillable mutants sit on the `default: {` lines one row above each `throw`; I deliberately did **not** widen the suppression, because raising a passing score by suppressing more is what R-05-9 exists to prevent.
- **O-41** — slice 06's `Inherited scope` bullets get their ref ids now, which you ruled belongs at step 7 when no agent holds the file. The guard is built and live: every ref in `inherits:` must appear in a bullet, and every bullet must cite a ref **the log knows** or carry `(no ref — reason)`. Slice 06 currently **fails** it.

**Budget.** `06-design.md` is at 3,000/3,000 and your A-06-5 says the next amendment costs argument — but step 7 shrinks the design to its as-built record against a 1,200 ceiling, so this is the pass that pays it back. arc42 §5 had 15 words of headroom, §6 one, §8 seven, §10 zero, §11 two. Every addition is paid for by a deletion; say what you let go.

**Report** the standard JSON, your O-46 and R-06-D rulings, what moved in arc42 and what you let go to pay for it, and — most important for the gate — **anything you would want a human to look at that no test covers.** I will put that in the gate record verbatim rather than claiming it was checked.
