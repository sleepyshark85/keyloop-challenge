# Prompt · slice 06 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule AC-1 wording and affected=0 residual
- Sent: 2026-09-06T14:00:57.847Z

---

Slice 06 — **two step-3 findings to rule.** Branch `slice/06-reschedule-atomic-move`, PR #15. Your amendment is at `64ab23c`; the test-engineer's red is at `ec37a20` and is **observed red in CI** (run 34037559448: `test` FAIL, `red-proof` PASS, no unit test failing).

**You write `docs/` only.** The implementer is working `src/` and `tests/unit/` concurrently on the same branch — do not touch either, and do not touch the test-engineer's test files.

**These are two findings, not a round.** Rule each; §6's separation of deliberating from conceding still binds you, but here the ruling and the doc edit are one act because nobody has objected to anything — you are answering a discovery, not adjudicating a dispute. If either ruling would change what the implementer is building **right now**, say so first and prominently.

---

**T-06-6 — MAJOR. AC-1's literal example cannot be executed, and this is the second acceptance criterion in this slice found unbuildable by trying to build it.**

AC-1 reads: *"…when A is rescheduled to `[09:15, 10:15)` and then extended to `[09:15, 11:15)`"*. Extending `10:15` to `11:15` is a **duration change**, and `PATCH` carries only `startsAt` while ADR-0025 fixes the interval's length to the appointment's unchangeable service type. The example cannot be run.

The test-engineer did **not** edit the criterion — §5 forbids it — and substituted a second self-overlapping target, `[09:45, 10:45)`, overlapping the first move rather than changing duration. That preserves every property AC-1 actually asserts: two successive moves, the second overlapping the interval it replaces, id unchanged, bay and technician unchanged, no `23P01`. The substitution is documented in the test file's header rather than invented past silently.

**So the AC text and the committed test now disagree literally.** That is yours to close. You have already amended one criterion in this slice (AC-5, at step 1) and you own AC wording mid-slice under the standing delegation, provisional until the gate. Rule whether AC-1's example is amended to match the test, whether the test is wrong, or whether something else is true — and note for the record that AC-5 was caught by you trying to write the statement and AC-1 by the test-engineer trying to write the test. Two of five criteria in one slice, both caught by attempting them rather than by reading them, is a fact about how this slice was specified and the retro should get it if you think it generalises.

---

**T-06-7 — MAJOR. Your narrowing of T-06-1 has a residual, and the test-engineer found it while building it.**

You narrowed the discriminator from *"any statement-level firing"* to *"a statement-level row with `affected = 0`"*, correctly, because the `db` project shares one container and an unfiltered firing would be flaky in the false-failure direction.

The narrowed predicate is better and is **not fully sound**: a reschedule of a **cancelled** appointment legitimately produces the identical `affected = 0` shape under ADR-0025 decision 2 — which is exactly what rejected Option A would produce for an unknown id. Once the row-level trigger's `NEW`/`OLD` data is gone, nothing observable distinguishes them. So the discriminator separates Option A from Option C only while no AC-4 case is in flight.

The test-engineer bounded the window as tightly as it could around the single HTTP call under test and recorded this as **a residual rather than an elimination**, in the test file's header. It is explicit that the finding is against the narrowing and not against its original remedy: *"any-firing would not have had this hole and would have had a worse one."*

Rule it. If the residual is acceptable, say what makes it acceptable and where it is recorded — §11 at step 7 is the obvious home. If it is not, say what closes it, and whether that is this slice's work or a destination. **Every `deferred_to` must name a live slice** — the write path refuses a tombstone now, which is how A-06-2's slice-10 routing was caught.

---

**Constraints.** `06-design.md` is at **2,997 of 3,000 words** — your own A-06-5 says the next amendment cannot be absorbed without deleting argument, and that the remaining supply is mechanism paragraphs, option tables and rulings rather than restatements. If a ruling here needs design words, say what you would delete to pay for it. Slice-file wording is mine to land: **tell me the exact AC-1 text you want and I will commit it.** `docs:budget --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `log:check` and `test:tools` stay green. Accepted ADRs are immutable. Commit `docs(06):` if you write anything.

**Report** the standard JSON, your two verdicts with reasoning, the exact AC-1 replacement text if you amend it, and whether either ruling changes what the implementer is building right now.
