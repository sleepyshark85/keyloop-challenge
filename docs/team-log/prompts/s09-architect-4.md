# Prompt · slice 09 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Adjudicate DCR on telemetry-booking seed fixture
- Sent: 2026-09-07T20:07:32.484Z

---

Slice 09, step 4 (GREEN). I am the implementer. Raising a DCR per CLAUDE.md §6 — I have not edited the test.

## Finding

`tests/integration/telemetry-booking.test.ts` (test-engineer's, committed red at 46729f3), the `QS-13 / AC-1, AC-2, AC-3` describe block, uses `SHARED_SEED = 7` and asserts (docblock, lines ~69-88) that this seed, against the `seedRetryOnceFixture` fixture (`namespace: 'ac1-telemetry-retry-once'`, bays: 2, technicians: 2, `bayIds[0]` occupied by `technicianIds[1]`), produces "the FIRST draw doomed and the SECOND to succeed" — i.e. exactly one conflict (`resource=bay`) then success.

I measured the ALREADY-MERGED, UNCHANGED domain functions (`orderCandidates`/`nextCandidate`/`prune` in `src/domain/candidates.ts` — I did not touch this file this slice) against the exact bay/technician UUIDs this fixture's namespace actually produces:

```
bays  = [dd0ee84c-3ecb-5421-84f2-bfead1bd9621, 3f1ae742-ef27-5e87-8be6-1bbcdf0bdaf4]   (ORDER BY name)
techs = [bc3dae75-795d-5ead-90b4-aa7893a4adbd, df607606-5c6c-59d9-831e-db2df8fc20c4]   (ORDER BY id)
blocker: bays[0] occupied by techs[1] (df607606...) for the target window
```

`orderCandidates(bays, techs, 7)` shuffles to `bays=[dd0ee84c.., 3f1ae742..]`, `technicians=[df607606.., bc3dae75..]`. Walking the loop by hand (reproduced with `node -e` against `dist/domain/candidates.js`, no server involved):

- Attempt 1: (dd0ee84c.., df607606..) — bay busy AND technician busy; `no_bay_overlap` fires first (0003_appointment.sql's migration order, unchanged) → conflict, `resource=bay`. Matches the docblock's own claim for attempt 1.
- Pruning drops ONLY `bays[0]` (ADR-0009: "the whole resource is dropped, not merely the pair"). `df607606..` (still busy) stays in the technician list, unpruned, at its same position.
- Attempt 2: (3f1ae742.., df607606..) — technician still busy → SECOND conflict, `resource=technician`. This is where the docblock's claim ("a 201 on attempt 2") is false for this namespace/seed pair.
- Attempt 3: (3f1ae742.., bc3dae75..) — succeeds.

So `SHARED_SEED = 7` against `'ac1-telemetry-retry-once'` produces a genuine **two-conflict** retry (bay, then technician), not the one-conflict shape AC-1's Given clause and AC-2/AC-3 assume. Consequences, running the real server:

- **AC-2 fails**: 3 `appointment.insert` spans, not the asserted 2.
- **AC-3 fails**: `booking_conflicts_total` increments `{resource: technician, outcome: absorbed}` (my attempt loop's own design — "absorbed" is labelled by the MOST RECENT conflict's resource before the winning attempt, per `docs/slices/09-design.md` decision 2's "outcome... genuinely a parameter"), never `{resource: bay, outcome: absorbed}` — the exact attribute set AC-3 filters for.
- AC-1, AC-4, AC-5, AC-6 in the same file all pass as written; this is isolated to the `SHARED_SEED=7` fixture's own premise.

I did not change `src/domain/candidates.ts`, `orderCandidates`, `prune`, or the migration's constraint-creation order — all pre-date this slice and are unmodified. My own attempt-loop extraction (F-06-1, `src/application/attemptLoop.ts`) reproduces the pre-existing loop's prune/retry logic verbatim (verified: all 612 pre-existing unit tests for `bookAppointment`/`rescheduleAppointment` pass unchanged against the refactor). The counter's "label by most recent conflict" semantics is my own design choice within decision 2's brief, made because it is the only reading that also satisfies AC-4 (an outcome that ends in refusal must not count as `absorbed` even though it passed through one or more conflicts) — happy to be told this reading is wrong if there is a different intended semantics for `absorbed`'s resource label when a request meets more than one distinct conflicting resource before succeeding.

## What I am asking you to rule

Per CLAUDE.md §6, this needs (a) a nameable AC/QS/§2 failure for outcome (c), or it is (b)/(a)/(d). I believe this is squarely **(a) — clarification: the design (AC-1's "retries once then succeeds" scenario) is right, the fixture's constant is wrong for the data it is measured against.** The fix is a test-engineer-owned edit (`tests/integration/telemetry-booking.test.ts` is not mine to touch — CLAUDE.md §5): find a seed value (or adjust the fixture's occupied pair) that genuinely produces one conflict then success against this exact namespace's UUIDs, OR accept the two-conflict shape and adjust AC-2/AC-3's expected counts/labels to match a "retries TWICE then succeeds" scenario, OR use a different technician arrangement so that pruning the bay does not leave the busy technician un-pruned at the front of the list.

Please rule, and if (a), route the concrete fix to whichever role owns making it (test-engineer for the seed/fixture) — I'll hold this file section of the slice as blocked pending that, but continue with everything else GREEN in the meantime (AC-1, AC-4, AC-5, AC-6, and every other criterion in this slice are unaffected and already passing).

Return: your ruling (a/b/c/d) with the named criterion if (c), and the exact remedy (e.g. a new seed value verified against the same UUIDs, or a fixture change) if (a)/(b), stated precisely enough that whoever applies it does not have to re-derive it.
