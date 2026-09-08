# Prompt · slice 09 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Un-fold slice 10 and close slice 09
- Sent: 2026-09-08T02:01:33.135Z

---

# The human ruled A-09-4: reopen slice 10. Split the slice, then run slice 09's step 7.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/09-observability`, PR #20. Pull first.

**Your recommendation was taken.** The human ruled today: reopen slice 10 for the contract half; slice 09 closes on its telemetry, pool and budget work. Logged as `A-09-4`, ruled `human`.

They were told what it costs — slice 10 is a Gate D tombstone, so reopening un-folds a Gate D decision and the deferral machinery needs re-pointing — and they declined the third option, merging slice 09 with AC-7/AC-9/AC-10 as §11 debt, because that ships the assessment without one of the brief's named deliverables.

## 1. Un-fold slice 10, without deleting the fold

`docs/slices/10-openapi-and-curl-harness.md` is a tombstone carrying `folded_into: "09"`, `folded_at`, `folded_by: gate-D`, and this sentence:

> Deleting the evidence of the first decision to make the second look tidy is the quiet change `CLAUDE.md` §4 exists to prevent.

**That sentence binds you now.** The fold happened, and so did the un-fold. Both stay in the record — the file becomes a live slice whose own history says it was folded at Gate D and reopened on evidence. Give it `id: "10"`, `depends_on: ["09"]`, and the rest of the front matter a live slice needs.

## 2. Decide exactly which criteria move — this is the part I will not guess

The human's ruling names **AC-9's media types, A-06-2's assertion, and AC-10's harness binding**. You must decide the precise cut, and say why for each:

- **AC-7** (byte-for-byte document diff) and **AC-5b** currently **pass**. Do they stay in 09 or follow the contract half? A passing criterion whose subject moves is a criterion nobody will re-check.
- **AC-11** (harness runnable from a terminal) and `R-09-12`'s GNU-coreutils/`date -u -d` problem travel with the harness, presumably.
- `R-09-13` — the TypeBox implementation note now published as contract prose in the emitted document.
- Which of slice 09's **six inherited obligations** move with the contract half? **A-06-2 is one of them**, and it is the one slice 09 cannot discharge because its assertion does not exist. `slice:check` currently fails `inherited obligations discharged` on all six.

Re-point the deferral machinery for anything that moves — `tools/lib/deferrals.mjs` resolves `folded_into` chains, and a destination naming a tombstone is refused at the write path.

## 3. Then run slice 09's step 7

Only after the split, and only over what remains in 09: telemetry, the conflict counter, the pool ceiling, the budget and the `perf` project. **Reconcile arc42 to what actually merged**, and discharge the inherited obligations that stay.

Things step 7 must carry, all measured this round:
- three files repaired — `attemptLoop.ts` 59.85 → **92.54**, `telemetry.ts` 12.82 → **82.86**, `server.ts` 69.44 → **85.57** — and `availability.ts` holding **88.10**, so slice 08's overridden gap is repaid and `D-08-1` closes;
- `@opentelemetry/instrumentation-http` **measurably does not patch under this project's ESM entry point**, so the server span is hand-written — §8.4's "(auto)" note is now false;
- `booking_attempts` and `appointment.cancel` implemented, `availability_query_duration_seconds` **deleted** — §8.4 must match `src/`;
- AC-12 reclassified as a standing guard with the **headroom** as §11's regression baseline;
- `I-09-7` resolved on three green CI runs, with the residual uncertainty stated rather than closed over — the mechanism is unrefuted, not disproved;
- `ADR-0035` stays `proposed`, and §6(b) has no terminal case for it.

## Boundaries

- `docs/slices/`, `docs/arc42/`, `docs/adr/` are yours. **Not `src/`, not `tests/`.**
- No new ADR unless it sits at the human's 2026-09-07 bar.
- Commit in logical groups, `docs(09):` / `docs(10):`, **explicit pathspecs, never `git add -A`** (O-65).
- Push. Post one PR comment on #20, `**architect · step 7 — AS-BUILT**`, ~150 words, short and self-contained.

## Return

The exact criteria and inherited obligations that moved and why, what slice 09 now claims, whether `slice:check 09` reaches a gateable state, and what slice 10's Definition of Ready is missing.
