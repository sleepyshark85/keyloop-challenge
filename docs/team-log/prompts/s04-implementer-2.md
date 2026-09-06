# Prompt · slice 04 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 4 GREEN
- Sent: 2026-09-06T06:44:48.292Z

---

Slice 04 step 4 — GREEN. Branch `slice/04-candidate-allocation-and-retry`, already checked out. Read `docs/slices/04-*.md` (design + adjudication), `docs/arc42/05-building-blocks.md` §5.2, `06-runtime-view.md` §6.2, `07-deployment-view.md` §7, ADR-0009, ADR-0018, ADR-0020, ADR-0021, and the three red test files.

The red is `1ea3223`, observed in CI run 34016955557: 488 tests, 16 failed, all 16 `AssertionError`, zero load errors, zero unit failures. I verified that from the artifact myself. Your job is to turn those 16 red into green by unit TDD, and nothing else.

**What you must not do.** You must not create, edit or delete anything under `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/concurrency/`, `tests/architecture/` or `tests/performance/` — §5, NON-NEGOTIABLE, symmetric. If you believe one of those tests is wrong, raise a DCR; do not edit it. `tests/unit/` is yours.

**Five things the red asserts that a plausible implementation gets wrong.** These are not hints about the tests, they are the shape of the work:

1. **The retry loop prunes the RESOURCE, not the pair.** M5 in the test-engineer's mutant model — pruning the (bay, technician) pair leaves the conflicting resource in the candidate list and the loop re-proposes it. 17 of 28 assertions across 6 cases die on this.
2. **Each attempt is its own transaction.** M11 — one transaction wrapped around the whole loop kills 30 assertions across 7 cases, including the `25P02` witnesses. ADR-0018's advisory locks are per-attempt.
3. **The cap is tested inside the `23P01` conflict arm**, per ADR-0020. Not at the top of the loop. An outside-in test cannot see the difference (that is D-04-2) — `tsc` and the reviewer can. Put it where the ADR says.
4. **The ordering is a seeded permutation, injected, never a global RNG.** `BOOKING_SEED` overrides (ADR-0021). The property file asserts it is a permutation (M14, 13 assertions) and that pruning does not reshuffle the survivors (M13, `P5`).
5. **`exhausted` wins a tie with `capped`** (AC-4/16). M8 dies on that one assertion alone.

**One open ruling that touches you — T-04-5.** arc42 contradicts itself on the cap's environment variable: §5.2 says `ATTEMPT_CAP`, §7's deployment env table says `BOOKING_ATTEMPT_CAP`, and §7 does not list `BOOKING_SEED` at all. §4's "arc42 wins" cannot break a tie where arc42 is both sides. The architect is ruling on it right now, in parallel with you. **Sequence `loadConfig` and its unit assertion last**, do everything else first, and I will relay the ruling before you need it. If you somehow reach it before I do, ask me — do not pick a name.

**Commits.** Conventional, `feat(04): …` / `refactor(04): …`, each one green on its own, ~150 lines. Every unit test you write pairs with the code it drives, in the same commit.

**Report** the standard implementer JSON plus: the final CI run id with all three jobs green; which of the five above you got wrong first and what the unit test that caught it was, if any; and anything the design told you to do that the code would not let you do cleanly. That last one is worth more than a clean report — D-04-1 and D-04-2 both came out of exactly that.
