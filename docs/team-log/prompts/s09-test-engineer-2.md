# Prompt · slice 09 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 3 red commit
- Sent: 2026-09-07T18:17:00.111Z

---

# Slice 09 · step 3 — RED. One commit, observed failing, seventeen criteria.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, **PR #20 is open**. Pull first — the design was amended at `544bc75` with all four step-2 objections ruled **(a)**, including all three of yours.

Read `docs/slices/09-design.md` and `docs/slices/09-observability.md` as amended. Your objections were **agreed, not accommodated** — read the rulings, because two changed what you must build.

## What the architect ruled on your three

- **`T-09-1` — your remedy taken verbatim.** AC-7 and the building-blocks table now read **`docs/api/openapi.json`**. No ADR superseded. It also pinned `buildOpenApiDocument()` and `npm run docs:openapi` so AC-7's "fails CI" has a mechanism to fail through.
- **`T-09-2` — agreed, and it explicitly refused to let you concede.** Neither control is optional: a `dependency-cruiser` rule asserted by nothing is what QS-10 exists to prevent, and `dependency-cruiser` is per-file so cannot see a one-increment-site rule — the QS-12 marker is its only executable form. Frontmatter gained QS-10 and QS-12. **The "three test files" ruling is now a coverage property rather than a count**: every one of the seventeen criteria and both controls must fail in the one observed red run. AC-6b, AC-10 and AC-11 are **yours to place**.
- **`T-09-3` — agreed entire, and your mechanism was replaced with a stronger one.** Not `fileParallelism: false` on `db` — that serialises 21 files to isolate one, on every run forever. Instead **a third `perf` project** holding `tests/performance/**`, with **its own container** via per-project `globalSetup`. Exclusivity at the container, not the file. Your §11 noisy-upper-bound alternative was refused on your own reasoning: the machine class discriminates a *starved* runner because starvation shows in the class, but cannot discriminate a contended run from a clean one on the *same* class.

## Your work

**1. The `perf` project — `vitest.config.ts` is yours** (its own header says so). Move `tests/performance/**` out of `db` into a new `perf` project with its own `globalSetup: ['tests/setup/postgres.ts']`. That file's docblock already records the verified fact this rests on: per-project `globalSetup` is absent from `NonProjectOptions`, is not inherited, and runs only for projects owning a file in the run.

**Two things the architect said to demonstrate rather than assume**, on that file's own precedent of verifying the mechanical unknown before the red commit:
- that **three** projects merge into the single `test-results.json` that `red-proof` reads;
- that **`perf` runs alone** — no other project's files execute in its invocation.

**2. Coordination, and it matters.** `tools/ci/run-tests.mjs` holds `const PROJECTS = ['nodb', 'db']` and **that file is mine, not yours** — do not edit it. Its explicit list is deliberate: deriving project names from the config would let a project vanish silently, which is exactly what T-01-2 built it to prevent. So patch it **locally** to verify, revert your patch before committing, and tell me in your report that it is verified — I will land `'perf'` in the same window as your push.

**3. The red commit.** One commit, `test(...): … (red)`, authored by you, observed failing in CI. Every one of the seventeen acceptance criteria plus the QS-10 plant and the QS-12 marker must fail in that one run — the architect's ground is that one run failing everything proves nothing was already passing, which is why AC-7 was withdrawn at slice 08.

Your directories: `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/concurrency/`, `tests/performance/`, `tests/architecture/`, and database-invariant tests in `tests/integration/`. **`tests/unit/` is the implementer's — do not touch it.** The design notes the empty-body `400` is pinned at `tests/unit/http/appointments.test.ts:381`, so it moves at green and not in your commit.

## Before you commit

Confirm the run is red **for the right reasons**: assertion failures, not `globalSetup` crashes, not import errors, not a missing script. That distinction is why the project split exists at all. `npm run test:tools` must stay green — your config change touches what `tools/test/run-tests.test.mjs` asserts, so check it.

Push. Do not post a PR comment yet; step 3's evidence is the CI run, and I collect it.

## Return

The structured report with `red_commit` and `ci_failure_confirmed`, plus: the two demonstrations' results, where you placed AC-6b/AC-10/AC-11, and anything that could not be made to fail in the same run as the rest — that last one matters more than the rest, because a criterion that cannot fail alongside the others is one the coverage property does not actually cover.
