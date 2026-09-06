# Prompt · slice 05 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 1 DESIGN
- Sent: 2026-09-06T08:36:48.891Z

---

Slice 05 step 1 — DESIGN. Branch `slice/05-cancellation`, checked out, off a `main` that now carries slice 04. Read `docs/slices/05-cancellation.md` first; it has four ACs, declares `arc42: ["§6.4", "§8.6"]` and `quality_scenarios: [QS-7]`, and carries `gate: light`.

**Why this slice is not small.** Its own file says it: *"This is the only slice that exercises `WHERE (status <> 'cancelled')` through the API. Without it that clause is an unverified claim sitting inside the system's most important constraint."* §2.1 is NON-NEGOTIABLE and that predicate is half of it. Design the slice so that the partial-index predicate is *proved live*, not assumed — and be explicit about what would still be true if the predicate were silently dropped, because that is the mutant the test-engineer will have to kill at step 3.

**Four things to decide, and one trap.**

1. **Idempotent cancellation (AC-3) returns 200 and changes nothing.** Decide whether that is an `UPDATE … WHERE status <> 'cancelled'` reporting zero rows, a read-then-write, or something else — and note that §2.1 forbids check-then-act on the *booking* path for a reason that may or may not apply here. Say which it is. If it does apply, the design must not quietly reintroduce the pattern under a different name.
2. **The cancel path is the second write path to `appointment`.** ADR-0018 obliges *every* write path to take both advisory locks in bay-then-technician order. arc42 §11 F-02-9 records that nothing structural enforces that. Decide whether cancellation takes them, and if not, say precisely why an `UPDATE` that only ever *frees* capacity is exempt — a reason, not an assertion.
3. **AC-2 says a cancelled appointment is `200` with `status: cancelled`, not `404`.** That is a contract statement about the read path built in slice 02. Check whether slice 02's read actually does that today or whether this slice changes it, and declare the scope accordingly — slice 04 had two undeclared arc42 sections and the declaration field is checked by `slice:check`.
4. **`gate: light`, revoked by any open MAJOR/BLOCKING.** Design accordingly, and say in the design what would revoke it.

**The trap.** AC-1 is the whole slice: book, be refused with 409, cancel, and the *same* booking now succeeds. It is easy to write a test that passes because the second booking used a different slot, a different bay, or a re-derived candidate ordering — slice 04 made candidate order a seeded shuffle, so "the same booking" is no longer obviously the same attempt. Name this in the design so step 3 does not have to discover it.

**Standing context you should use rather than rediscover.** Slice 04 merged with ADRs 0018–0022 accepted; `BOOKING_ATTEMPT_CAP` and `BOOKING_SEED` are the config names, ADR-0022 fixes the prefix rule. arc42 §6.2 now records the retry loop's structural bound as exact and tight. Two items are open for the human and neither is yours: D-04-1 (the cap of 16) and A-04-9 (a recommended §2.4 amendment).

**Under the standing delegation nothing escalates mid-slice** — you decide scope, AC and QS between steps 1 and 5, each ruling recorded and provisional until the gate.

**Constraints.** Word budget: the in-flight design ceiling is 3,000 words and slice 04's design ran to 2,931 with 69 to spare, which was tight enough to matter — aim well under. `npm run docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check` and `npm run test:tools` all stay green. ADR if a decision is needed; accepted ADRs are immutable. No `src/`, no `tests/`, no `tools/`. Commit `docs(05):`.

**Report** the standard architect JSON plus your answers to the four decisions above, and — separately — anything you found that this did not ask about. That section has been the most valuable part of every report this slice.
