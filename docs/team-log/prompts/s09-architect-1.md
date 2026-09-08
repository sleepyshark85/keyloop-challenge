# Prompt · slice 09 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 09 step 1 design
- Sent: 2026-09-07T17:04:30.164Z

---

# Slice 09 · step 1 — DESIGN. The close-out slice, and the largest in the project.

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `slice/09-observability`** (checked out off `main` at `8982361`, working tree clean apart from the `inherits:` line I just amended). Slice 08 merged; WIP is free.

Read `docs/slices/09-observability.md` in full first. Its own preamble says fifteen criteria is the largest slice in the backlog and that this is stated rather than hidden — it is now **sixteen**, and it **absorbs slices 10 and 11** by the Gate D ruling. Three independent parts: **telemetry, the OpenAPI contract with its cURL harness, and the performance budget.**

## What is blocking READY, and it is your step-1 work

`npm run slice:check 09` fails one criterion:

> `inherited scope is traceable` — **declared in `inherits:` but named in no bullet — I-04-5, R-07-12.**

The human ruled O-59 today and **admitted both**. Their reasoning, and it should shape how you write the bullets: the closure of slice 09 to new deferrals was aimed at *accumulation*, and these two belong here **by subject matter** — R-07-12 is a pool-ceiling fact that only becomes observable once there are metrics to observe it with, which is what this slice is.

So slice 09 now inherits **six** obligations. Each needs a bullet in the *Inherited scope* section saying what is owed and where it is discharged — the section exists because R-05-2 fired twice when a destination lived only in the ruling that named it:

- **OQ-05-2**, **F-06-1**, **A-06-2**, **T-06-5** — already bulleted; check them against their rulings rather than assuming.
- **I-04-5** — re-deferred here at slice 08 step 5, on what you called a third argument it did not previously have.
- **R-07-12** — `POOL_MAX = 10` matches the service's real ceiling **only by coincidence**, and D-07-1's own fix is what breaks the coincidence. You ruled it belongs here and said there were two things you would not do; carry that into the bullet.

Also confirm **AC-5b** (the OpenAPI half of AC-5, split at slice 08 under R-08-2) is present as a criterion here, and that the seven `description`-string mutants in `src/http/routes/availability.ts` that slice 08 booked as a stated §11 gap are killed by this slice's OpenAPI assertion. Slice 08 merged at **71.43% on that file** under a human override; if AC-7 does not actually kill those seven, say so now rather than at step 5.

## Design the slice

The usual step-1 output: building blocks touched, interfaces, data-model delta if any, applicable §10 quality scenarios (`QS-13`, `QS-11`, `QS-14` are declared), proposed arc42 edits, and an ADR **only if a decision genuinely needs one**.

**On ADRs, the bar moved yesterday and it moved a long way.** The human retired seventeen of thirty-three for being below the bar — *"only important decisions should be addressed"* — and ruled that **no ADR carries implementation detail**. If you mint one, it must be an architectural decision, written to the form now in the surviving sixteen: the problem as a situation before any id, every cross-reference replaced by the fact it points at, no code shapes. Otherwise the decision goes in the design.

Three things I would want your judgement on, stated as questions rather than instructions:

1. **Is sixteen criteria across three independent parts one slice or three reds?** The file already says it takes three reds if it needs three. §6's governor is two loopbacks; a slice this size has more room to need a third, and a third auto-escalates as a slicing problem.
2. **QS-14 is a performance budget** — an acceptance threshold, not an optimisation target, and `tests/performance/` is the test-engineer's. What must the design pin so the budget is assertable rather than aspirational?
3. **O-70**, logged today: the concurrency suite went red on a docs-only commit and green on re-run of the identical sha — two tests, one reporting *"some racers never got an answer at all"* and one a flat 60-second timeout. Almost certainly runner starvation, and the diff proves the commit touched no `src/` or `tests/` file. But this slice owns the performance budget, so if bounding racer counts to the runner's CPU count belongs anywhere, it belongs in your design here. Rule it in or out.

## Boundaries

- You write `docs/slices/09-*.md`, `docs/arc42/`, `docs/adr/`. **Not `src/`, not `tests/`** (§5).
- Do not start step 2 — the test-engineer and implementer review your design and may object; that is a separate dispatch.
- Commit `docs(09):`, **explicit pathspecs, never `git add -A`** (O-65). Push. No PR yet — I open it.

## PR comment

None yet; there is no PR. Put the reasoning in the design and the commit message, and I will open the PR carrying it.

## Return

The structured report, plus: whether slice 09 should be split, and what you decided about O-70.
