# Prompt · slice 04 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: T-04-5 ruling and ADR ratification
- Sent: 2026-09-06T06:45:12.692Z

---

Two decisions, both yours under the human's standing delegation ("don't wait for me for opinion if I'm not here — let the architect decide"). The human is asleep. Nothing here escalates; rule, and record the rationale as the graded artifact.

Slice 04 is at step 4 — the implementer is working green **right now, in parallel with you**. Decision 1 blocks one line of its work, so do it first and keep it short.

---

**Decision 1 — T-04-5, MAJOR, raised by the test-engineer at step 3.**

arc42 contradicts itself on the attempt cap's environment variable:
- `docs/arc42/05-building-blocks.md:144` — ``Config (`ATTEMPT_CAP`, default 16, and `BOOKING_SEED`, unset — ADR-0009, ADR-0021)``
- `docs/arc42/07-deployment-view.md:152` — `` | `BOOKING_ATTEMPT_CAP` | ADR-0009's cap; default 16 | ``
- §7's env table does **not** list `BOOKING_SEED` at all, though ADR-0021 introduced it and §11's R-7a mitigation depends on it being settable.

CLAUDE.md §4 breaks a slice-file-versus-arc42 tie by ruling arc42 wins. Here arc42 is both sides, so §4 has nothing to break. Pick the name, fix the losing section, and add `BOOKING_SEED` to §7's table. Note that `BOOKING_SEED` is already the name in three places and the test harness reads it, so a `BOOKING_` prefix is the incumbent convention — but that is an observation, not the ruling; make the ruling.

Then answer the question behind the finding: **§7's env table is meant to be the deployment contract, and it drifted from §5 without anything noticing.** Is there a mechanical guard worth having — every `` `NAME` `` matching an env-var shape anywhere in arc42 must appear in §7's table — or is that a guard that would fire on prose? If it is worth having, say so and I will schedule it; do not build it now.

---

**Decision 2 — ratify or reject ADR-0018, 0019, 0020, 0021.**

All four are `status: proposed`. They have been proposed since slice 02 and 04's design, they are being **implemented right now**, and §11's generated debt list treats `proposed` as debt — so leaving them proposed both misreports the debt and means slice 04 is being built against decisions nobody has accepted.

- **0018** — two advisory locks with disjoint classes. Earned by measurement: `40P01` at 285/400 losers, retry livelocked in all 5 measured configs, 0 deadlocks over 56 races with the locks. It came out of a (c) ruling.
- **0019** — defer only to a slice that makes the work cheaper or stronger. Note before you rule: at slice 04 step 2 you routed D-04-1 to a slice whose own file forbade the work, which failed this ADR. Ratifying it means ratifying something you have already breached once. That is an argument for ratifying it with the breach recorded, or for amending it — not for leaving it in limbo.
- **0020** — the cap is tested inside the `23P01` conflict arm.
- **0021** — `BOOKING_SEED`. The test-engineer reported two limits at step 3 that you should weigh **before** ratifying, because they narrow what the ADR claims: (a) the seed can force a *fixed* ordering but not a *chosen* one, so it buys reproducibility, not steerability — §5's list of what it makes forceable is wider than what it delivers; and (b) AC-3 and AC-4 turned out not to need the seed at all, so the ADR's justification now rests on AC-5 and OQ-04-1 alone.

For each: `accepted` or not, with the reasoning. **ADRs are immutable once accepted** (§4) and 0021's own claim is provably wider than what it delivers — so if you accept 0021 unchanged you are freezing an overclaim. Narrowing it before ratification is available to you and is probably right; that is your call.

---

**Constraints.** You may not change scope, acceptance criteria or quality goals. Word budgets are enforced — `npm run docs:budget -- --check --ratchet` must stay green, and a new or amended ADR must meet its budget outright. Do not touch `src/` or any test. Commit your own doc changes (`docs(04):` / `docs(adr):`), each ~150 lines.

**Report:** the two rulings with reasoning, the commits, and — separately — anything you found while doing this that neither decision asked about. The scribe's most useful output this week was the section listing what it expected to find and could not.
