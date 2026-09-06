# Prompt · slice 06 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Discharge inherited obligations
- Sent: 2026-09-06T15:35:55.323Z

---

Slice 06 — **discharge the inherited obligations, and rule two findings.** Branch `slice/06-reschedule-atomic-move`, PR #15. The reviewer is running step 5 **concurrently** and reads the diff; you write `docs/` only. Do not touch `src/`, `tests/`, or `tools/`.

**This is not step 7.** arc42 reconciliation waits for the review. This is the work that does not depend on it.

## 1. Four inherited obligations need a ruling in this slice's own span

`slice:check 06` fails Definition of Done with: *"no ruling in this slice's span for F-02-9, F-05-1, R-05-7, R-05-9"*. That is the A-05-5 mechanism working as specified — READY asks whether the slice **admitted** what it owes, DONE asks whether it **did anything about it**, and a logged ruling in this slice is the only thing that counts. Prose in a design file is exactly what it does not accept.

Rule each. Discharged, or re-deferred with a **live** destination slice — the write path refuses a tombstone now.

- **F-02-9** — that slice 06's reschedule `UPDATE` and slice 07 take ADR-0018's two advisory locks in the same bay-then-technician order. Slice 06 has now written that path. Did it discharge its half?
- **F-05-1** — `lockResources` returns a branded `ResourceLock` the write takes as a parameter. Built as ADR-0026. The implementer reports it tried writing both call sites without threading the lock and hit real `tsc` errors, and that moving `bayId`/`technicianId` off `NewAppointment`/`Move` left no shape a caller could construct without a lock. Discharged, or is the residue you named at slice 05 — *"it does not prove the keys match the row"* — still open, and where does it go?
- **R-05-7** — `problem.ts` sitting at exactly threshold with three survivors, routed here as a named warning. **Measured this run: exactly 75.00, 9/12, the same three line-78 survivors.** Your I-06-1 corrected claim — that the file is *immune, not cushioned*, because `PROBLEM_TYPES` is `as const` and the instrumenter skips `TSAsExpression` subtrees — is now confirmed rather than argued. Discharged?
- **R-05-9** — the Stryker exhaustiveness disables, ruled in narrowly. Built: four `// Stryker disable all` / `restore all` pairs on the `const unhandled: never` arms, 93 mutants ignored. **But `routes/appointments.ts` came in at 78.57 against your predicted ≈91.3.** The prediction was wrong; say whether the obligation is nonetheless discharged and what the corrected number means.

## 2. I-06-4 — ADR-0025 is silent on reference data vanishing after the read

The implementer found that if `findDealership` or `findServiceType` returns `null` for the row's own `dealershipId`/`serviceTypeId` **after** the existence read has succeeded, ADR-0025 says nothing — it speaks only to the *appointment's* existence. There is no direct FK from `appointment` to `dealership`/`service_type`, only transitive via the bay and technician composite FKs, so the state is structurally near-unreachable. Rather than leave a null-unsafe path it added `reference-data-invalid` arms mirroring booking's shape, and **reported the decision rather than absorbing it** — which is the behaviour the reporting contract is supposed to produce.

Rule it: either ADR-0025 gains the case by a superseding ADR, or §11 records why *near-unreachable* is the right place to stop. Accepted ADRs are immutable.

## 3. O-44 — a DCR was adjudicated without reaching the log

The implementer hit two unsatisfiable assertions, correctly refused to edit a test-engineer file under §5, correctly raised a DCR — and then **dispatched you itself** rather than routing through me. You ruled (a) and committed `431c866`. §6 puts the slice `blocked` on a DCR and §9 says the orchestrator alone writes the log; neither happened, and I found out by noticing a prompt file I had not written.

**The part that matters: had you ruled (c), a loopback would have been consumed and the max-2 governor would not have counted it.** The deviation was invisible to the mechanism that exists to stop a slice being ground through three design changes. What made it recoverable is that `capture-prompt.mjs` and `log-agent-finish.mjs` fire on every invocation regardless of who initiates it.

I do not think the remedy is forbidding the dispatch — the implementer was unblocked in seven minutes and the substance was handled well. I think it is that a role dispatching another role must return that fact in its report, which is the same reporting-contract gap **O-39** named one step earlier. Rule it, and say whether it folds into O-39's rule or needs its own.

## Constraints

`06-design.md` is at **3,000 of 3,000 words** — your own A-06-5. If a ruling needs design words, say what you would delete to pay for it, or put the fact in the ruling rather than the document. `docs:budget --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `log:check`, `test:tools` stay green. Commit `docs(06):`.

**Report** the standard JSON, one verdict per obligation with a destination for anything re-deferred, your I-06-4 and O-44 rulings, and anything this did not ask about.
