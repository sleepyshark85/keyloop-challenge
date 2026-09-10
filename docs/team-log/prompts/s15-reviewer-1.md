# Prompt · slice 15 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 15 step 5: review the diff
- Sent: 2026-09-09T17:54:29.414Z

---

Slice 15, step 5 (REVIEW). Review the diff against design and acceptance criteria per CLAUDE.md §6.5. You may block a merge and raise a DCR; you may not change the design and may not fix what you find.

Branch `slice/15-seed-fixtures-and-capacity-harness`, **PR [#23](https://github.com/sleepyshark85/keyloop-challenge/pull/23)**, head `17b5daa`. Diff to review: `e63fe17..17b5daa` (`main` to head). CI green on the head (run 34385197821).

Read `docs/slices/15-seed-fixtures-and-capacity-harness.md`, `docs/slices/15-design.md` (amended twice by adjudication — step-2 rulings at `25d6dde`, DCR-15-1 at `a31027b`, which holds ADR-0038's inline draft), and the PR comments.

**History that tells you where to look hardest:**

- Red commit `e4f131b`, observed red in CI, 16 cases. `red-proof` passed.
- Implementer: `1d16719` (fixture + rewritten seeder), `7f30007` (`spurious-refusal.sh`).
- **DCR-15-1**, raised by the implementer mid step 4: AC-3's "inserts no row" was implemented as a table-wide unscoped `select count(*) from dealership`, which races the shared `db` container (`fileParallelism: false` was deliberately refused — `vitest.config.ts:36`). Ruled **(a)**; corrected by the test-engineer at `17b5daa` under four constraints. Not a loopback.

**This slice has NO mutation evidence.** Nothing under `src/` changes, and Stryker mutates neither `harness/**` nor tests. Four negative controls (AC-3, AC-6, AC-7, AC-8) plus the implementer's hand-run fixtures are all that stands in for a score. **Weigh those rather than reading a vacuous green.** This is the centre of your review, not a footnote.

**Verify these rather than take my word — dismiss any I have wrong:**

1. **C2's positive control is the load-bearing one.** The correction scopes AC-3's "no row" to a `crypto.randomUUID()` marker in `serviceTypes[0].name`, queried by exact match. C2 required every scoped zero to carry a positive control proving the same query on the same discriminator reads **non-zero** when the seed succeeds — otherwise "no rows for X" passes trivially when X was never written. The test-engineer says each of the six cases now runs a valid sibling fixture first, asserts exit 0 and `count === 1`, and only then runs the invalid one. **Check that this is actually what the committed code does, and that the control cannot itself pass vacuously.**
2. **C1 required a discriminator the invalid run itself would have written.** Is `service_type.name` that? The test-engineer's reasoning is that it is the one fixture-declared string inserted verbatim and first, where `dealership.name` and `vehicle.description` get `harness …` prefixes. Confirm against the committed seeder, and confirm the marker genuinely isolates the run from concurrent files.
3. **C3 — scoping one clause may not drop the others.** The six cases must still assert non-zero exit, the JSON path on stderr, and **nothing on stdout**.
4. **C4 — falsification.** It reports 4 of 6 cases went red against a non-validating copy of the seeder, and that the other 2 failed downstream anyway with validation off. Judge whether that is adequate evidence, and confirm the scratch files and the redirect were fully reverted. I checked `git status` and the diff and found `harness/**` carries only the implementer's three files — verify independently.
5. **T-15-1, and this is yours to settle, not to relay.** The test-engineer self-disclosed reading `src/persistence/migrations/0002_reference_data.sql` and `0003_appointment.sql` while writing the **red** commit, which its role forbids. Logged unruled at `c613e63`. It claims the committed tests rest only on the slice file, the design, arc42 and existing `tests/support/**`, having re-sourced the appointment-table facts from `tests/support/booking.ts` and arc42 §8.2. **That claim is checkable and you are the one to check it** — a self-assessment of uncontamination is exactly what the rule exists to make unnecessary. Note the architect ruled that its own AC-3 citation of `0002` by line was one of the two disclosure routes and booked `D-15-4`; `0003` came from no ruling.
6. **AC-9** — `harness/double-booking.sh` and `tests/acceptance/harness.test.ts` unchanged, verified against `git diff main --stat`, and that file's cases still pass.
7. **Ownership (§5), symmetrically** — implementer commits touch only `harness/**`; test-engineer commits touch only `tests/acceptance/**` and `tests/support/**`. Note that `guard-paths` refused the test-engineer's local writes into `harness/**`, which is tooling doing the enforcing; confirm nothing routed around it.
8. **Commit discipline (§7)** — exactly one red commit, test-engineer's; `17b5daa` is a second test-engineer commit but green and mandated by the ruling; implementer commits green and small.
9. **`npm run lint:arch`**, and whether `harness/**` is within any layering rule's reach at all.

Also judge: whether ADR-0038 being still `proposed` and unwritten to `docs/adr/` blocks the gate (design §4 assigns it to the architect at step 7), and whether the README/WALKTHROUGH work — which this slice's whole motivation implies, since the point is a *runnable* demonstration — is owed before the gate or is properly step 7's.

Report findings with severity, each naming the AC, QS or §2 invariant at stake where you would block. Do not manufacture findings; if it is sound, say so and say what you checked to establish it. But the last two reviewers on this project each found something real by measuring what everyone assumed — the `LOG_LEVEL` gate and the unscoped count were both invisible in a green suite.
