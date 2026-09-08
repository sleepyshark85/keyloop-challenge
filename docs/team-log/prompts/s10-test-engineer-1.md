# Prompt · slice 10 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 2 test-engineer
- Sent: 2026-09-08T04:02:32.199Z

---

# Slice 10 · step 2 — AGREE or OBJECT

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, **PR #21 open**. Pull first. Read `docs/slices/10-design.md` and `docs/slices/10-openapi-and-curl-harness.md` in full.

**This slice exists because tests you own asserted the wrong thing.** Slice 09's three BLOCKING findings were all green tests: AC-9's collected `/problems/*` **type strings** and never read `content[…]`; `A-06-2` was "discharged" by an assertion containing zero occurrences of `requestBody`, `parameters` or `appointmentId`; the double-booking script **counts nothing and always exits 0**. That is the standard this round is held to — a design producing three more of those has failed even if it merges.

§6: objections here are cheap; the same ambiguity at step 5 costs a cycle plus a loopback. A round that never produces a disagreement is deference, not consensus.

## What the architect already conceded, so you do not spend a round on it

It named **four criteria that cannot fail as written** (`A-10-2`): AC-2 alone (§8.6 is prose, nothing compares its column to the document — it considered parsing §8.6 from a test and **declined**, because that makes arc42 a machine-readable input that breaks on reformatting, which is exactly what `O-75` sprang yesterday); AC-6's README half; and AC-4/AC-5 without negative controls, one named each. Its sharpest point is yours to judge: *the current harness test counts `201`/`409` occurrences in stdout, which is the test asserting the invariant instead of the script.*

## Five things I want your judgement on

1. **AC-1's equality is on `(status, type)` pairs, plus the 2xx direction.** Pairs because `malformed-request` drifting 400→422 is drift a type-set misses; the 2xx direction because a `201` arriving as `problem+json` is §8.6's stated *worse* failure. Is pair-equality assertable over the emitted document without becoming a second copy of §8.6 inside your test?

2. **AC-6 means the acceptance test drives both scripts from `npm run harness:seed`'s output alone, never from `seedScenario`.** Today it supplies the ids from the fixture — which is the test suite the criterion says the harness must not need. Can you actually assert that, or does the fixture leak back in some way the design has not seen?

3. **The negative controls.** A single-request run against a taken slot must exit non-zero; a non-`200` on one of the three currently-unchecked harness steps must exit non-zero. Are those the right two, and are they enough to make AC-4 and AC-5 fail-able?

4. **AC-3b** — a `tests/architecture/` set-equality marker over uuid-mint sites, `{src/main.ts}` today. It is a denylist, not a proof, and it exists because `A-06-2` has been declared discharged twice on assertions that did not make it. Does the marker constrain what it claims? You anchored the QS-12 marker on an imported binding last slice after the first version matched a label spelling — the same failure is available here.

5. **`OQ-10-1`** — `route-not-found` comes from `setNotFoundHandler` and belongs to no operation, so it has nowhere to live under per-operation equality. An unreferenced `components.responses` entry is valid OpenAPI 3.1, but whether `SwaggerParser.validate` accepts one under AC-8 is **unverified**. That is a measurement, and measuring is faster than arguing.

## Boundaries

- **Do not write tests yet** — step 3 is red. Review only.
- Do not edit the design. You object; the architect rules.
- `harness/*.sh` and `harness/seed.mjs` are the **implementer's**; `tests/acceptance/harness.test.ts` and `tests/contract/openapi-document.test.ts` are yours. Note `harness/` is **unguarded by `guard-paths.mjs`** (`A-10-3`), so that boundary is a briefing rather than a mechanism — respect it anyway.

## Return

The structured report with `objections` populated — each naming the criterion or quality scenario at risk and the change you would make. Where you agree, say what you checked to get there; agreement that names nothing is worth nothing.
