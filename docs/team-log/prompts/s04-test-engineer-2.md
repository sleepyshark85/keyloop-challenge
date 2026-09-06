# Prompt · slice 04 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 04 step 3 RED
- Sent: 2026-09-06T06:14:52.607Z

---

Slice 04, **step 3 — RED**. You are the test-engineer, on `slice/04-candidate-allocation-and-retry` at `b8fdd35`. **All four of your objections were upheld**, plus all five of the implementer's — nine AGREE, no (c), no loopback consumed.

Re-read `docs/slices/04-design.md`; it changed materially. Also new: **ADR-0021**.

## What your objections bought

- **T-04-1 → ADR-0021.** `BOOKING_SEED` exists. The seed is now a handle, not a label: AC-5's re-runnability is deliverable end to end, and AC-2, AC-3's technician half and D-04-1's assertable part all become forceable. Your structural measurement — that blocking K technicians requires K bays at the same dealership, so **no static fixture can force a first-candidate failure** — is what carried it. The seed source is the `crypto` global, per `main.ts:50`'s own reason.
- **T-04-2 upheld, and the architect reversed its own ruling.** AC-4 is asserted at the **shipped default of 16**. It reproduced your fixture: 16 blocked → 16 attempts, `exhausted` (the tie exercised); 17 blocked → 16, `capped`. Its "expensive fixture" premise was simply wrong.
- **T-04-3 upheld** — D-04-1's spurious-refusal leg is not deterministically assertable; the reason is recorded, not the fixture, and your `capped` fixture is named as its standing partial.
- **T-04-4 upheld** — the `25P02` absence lives inside AC-1's (20,8), gated on the `attempt >= 2` witness.

The implementer's objections also changed what you are testing against: `CandidateOrder` carries `readonly [string, ...string[]]`, the empty-candidate guards fold into `orderCandidates`' `null` branch, and the loop header carries **Bound-2's** bound (`bays.length + technicians.length`) with the **cap** tested inside the `conflict` arm — two numbers doing two jobs, tail `throw`s rather than refusing.

## The one thing I will not let be lost

You said it and the architect preserved it verbatim, so hold yourself to it:

> **AC-1's red must require `booking.conflict` lines naming the constraints.** (2,1) is a control, not a discriminator, and a per-dealership global mutex — ADR-0004's rejected Option D — passes all four (N,M) cells with zero retries.

A red that passes on Option D is not evidence about the database refusing. Build the evidence shape in.

## The job

**One red commit**, `test(acceptance): … (red)` — §7 allows exactly one. All five AC. Your planned shape stands, now with the seed available.

Two things I will check myself, so build them to survive it:

1. **C1 — every failure an assertion, not a load error**, verified from the CI artifact rather than your report. Name any case that is green at the red, as you did at slice 02 where you flagged a fourth green-at-red case nobody had asked about.
2. **For every discrimination claim, name the mutant and run it.** Especially the `attempt >= 2` witness and the `booking.conflict` constraint-naming, which are what stop AC-1 passing over a mutex.

Also: **OQ-04-1's half-closure** — you offered that two refusals logging two different seeds tests the *source* at P(false failure) = 2⁻³². Take it if it still holds with `BOOKING_SEED` present, and say what it does not close.

## Constraints

Yours: `tests/{acceptance,contract,property,concurrency,architecture,performance}/` and database-invariant integration tests. You do **not** read `src/`. Commit by explicit pathspec.

`npm run lint:arch` and `npm run test:tools` must stay green; only the new acceptance tests fail. **`docs:budget:check` is a ratchet in CI** — your role definition carries the rule under `## Writing anything down`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

No PR exists yet and the workflow fires on `pull_request` or pushes to `main`, so dispatch `verify.yml` on the branch as you did at slice 02 — opening the PR is mine.

Report the file-by-file shape, which AC each case covers, the mutants with kill counts, every green-at-red case named, and anything you still cannot assert.
