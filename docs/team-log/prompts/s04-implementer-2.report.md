# Report · slice 04 · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 4 GREEN
- Returned: 2026-09-06T07:12:00.386Z
- Duration: 1630s

---

All 16 red assertions are green, and CI's `test` and `red-proof` jobs are green.

```json
{
  "role": "implementer",
  "outcome": "green",
  "commits": ["1ed6a58", "3aba448", "98af1de", "b2830e2", "994bfc5", "e0153a1"],
  "files_changed": 8,
  "unit_tests_added": 40,
  "acceptance_passing": true,
  "depcruise": "pass",
  "objections": [],
  "dcr": "tests/concurrency/no-technician-overlap.test.ts:208 (slice 02, QS-2) is built on the deterministic ordering ADR-0009 Order-C removes; its closing assertion is now a coin flip. Test-engineer's file — raised, not touched.",
  "message": "Six commits, each green. candidates.ts owns the seeded permutation and the per-resource prune; the loop's two refusal exits sit inside the 23P01 arm with exhaustion first; BOOKING_SEED and BOOKING_ATTEMPT_CAP land in config. One slice-02 concurrency test becomes a 44% flake as a direct consequence of the shuffle."
}
```

**CI run 34018397845** (head `87dd31d`): `suite (Testcontainers)` **success** — `npm test`, both projects, all 45 db and 483 nodb tests; `red-proof` **success**; `docs, tools and log integrity` **failure**, and not from my work — `typecheck` ✓ and `layering (QS-10)` ✓ both passed, then `npm run test:tools` failed in `docs:refs`: *"A-04-2 … A-04-6 cited by team-log/events.jsonl — defined nowhere"*. Those ids are cited by log records and must be defined in a slice design; `docs/` is the architect's and the log is the orchestrator's. There is no third green run because the third job is red on that alone.

**Which of the five I got wrong first: none of them, and the one I nearly got wrong was #4.** The retry prunes the resource, each attempt is its own transaction and the cap sits in the arm — all three were already right in `main` or fell straight out of the design. What caught me was the *carrier*, one level below #4: `tests/unit/domain/candidates.test.ts` compiled and passed under vitest while `tsc` rejected three lines, because `CandidateOrder`'s tuple makes index 0 a `string` and every other index `string | undefined`. Vitest transpiles without typechecking, so a green unit run is not a green commit. I amended `1ed6a58` rather than leave a commit that fails `npm run typecheck`, and every commit after ran `tsc --noEmit` before `git commit`.

**Three places the design did not survive contact with the code** — the part worth more than the clean report:

1. **`loadConfig` cannot emit ADR-0021's startup `warn`.** The logger is built *from `loadConfig`'s return value*, so at the moment `BOOKING_SEED` is read there is no logger, and writing to a stream from `src/platform` is the wrong fix for a module the leaf rule keeps free of behaviour. `/home/agentadmin/sources/keyloop-challenge/src/platform/config.ts` exports `configWarnings(config)` — the wording lives beside the field, because the consequence is a configuration fact — and `/home/agentadmin/sources/keyloop-challenge/src/main.ts` emits it through pino at `warn` on the next line after the logger exists. One line, at startup, naming Order-A. ADR-0021 and design §4 both still say `loadConfig` emits it; that sentence is false as built.

2. **§3's carrier needed no `as NonEmpty<string>`, and the shape it specified would have reproduced I-04-4 one level down.** §3 pairs a `length === 0` guard with a per-list cast — which asserts the fact the guard just established. Destructuring head from tail *builds* the tuple and `head === undefined` **is** the emptiness test, so the two collapse into one reachable branch. Measured: `tsc -p tsconfig.json` exit 0, **two** `as CandidateOrder` casts (§3 predicted three), both of them the brand alone, and no index assertion anywhere. Same file also takes Fisher–Yates in its **selection** form (`splice` from a shrinking pool) rather than the in-place swap, because the swap needs two `noUncheckedIndexedAccess` assertions — the exact thing the tuple carrier was chosen to remove. Identical distribution; measured uniform to ±1.7% across 8 bays over 100 000 seeds.

3. **ADR-0022's proposed guard would not pass today.** Set equality between `env['…']` keys in `config.ts` and §7.3's table: `config.ts` now reads five, the table lists six. `OTEL_EXPORTER_OTLP_ENDPOINT` is listed and read by no code — the OTel SDK auto-configures from it at slice 09 — so the check needs an exemption for variables a *library* reads. That is a design question, not a rail to bolt on.

**The DCR.** `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/no-technician-overlap.test.ts` states in its own header that *"Candidate ordering is deterministic, so every racer attempts the same pair first"*, and closes at line 208 with:

```
).toBeGreaterThanOrEqual(2);   // "the refusal path must show more than one attempt:
                               //  the first attempt fails on the bay, the second on the technician"
```

Under Order-C that is false by construction, and in the better direction: with 24 bays and 1 technician a loser whose first draw is not the winner's bay conflicts on the **technician** at attempt 1 and refuses correctly, wasting no attempt. Only a loser that happens to draw the winner's bay produces a second attempt — `1 − (23/24)¹⁹ ≈ 56%`. Measured: **3 failures in 5 runs** of that file, and it passed in CI. It is not my file and I did not touch it; the remedy is a terminal-state claim in place of the two-attempt claim, and it is the test-engineer's to write. Everything else in that file passes.

Not run: Stryker. `npm run mutation` is the orchestrator's step in this repo's rhythm, and the changed-file set is now `src/domain/candidates.ts`, `src/application/bookAppointment.ts`, `src/platform/config.ts`, `src/main.ts`. I expect survivors in `mulberry32`'s constants — no test pins an exact permutation, deliberately, and the property file says why — and one in the loop's unreachable tail `throw`, which ADR-0020 row F puts there precisely because nothing can reach it.
