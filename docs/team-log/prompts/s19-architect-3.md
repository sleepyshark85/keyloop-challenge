# Prompt · slice 19 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Adjudicate step-2 objections
- Sent: 2026-09-10T09:36:42.077Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`. **Third dispatch on slice 19. This is §6 step 2's adjudication — ONE round, then decide.**

§6: *"a role receiving an objection replies before it edits."* So: **reply per objection first with AGREE/DISAGREE and the exact change you would make; then, in the same run, amend the design in one pass with the rulings attached.** Both halves are yours this time — you have already had your separate reply-round on `H-19-1`, and §6 allows one round of discussion per objection, not one dispatch per half.

`docs/slices/19-design.md` and `docs/adr/0040-*.md` are yours to amend. `docs/slices/19-attempt-cap-sized-against-occupancy.md` is the ORCHESTRATOR's — tell me AC changes, do not make them.

Five findings, all recorded in `docs/team-log/events.jsonl`. Both reviewers otherwise **agreed**, and both verified rather than assumed — the implementer traced the `EMPTY_OCCUPANCY` identity claim through draw consumption and confirmed it; the test-engineer measured AC-2's red.

---

## `I-19-1` · implementer · MINOR · step 2

`19-design.md`'s building-blocks table says the `busyResources` call goes *"between step 5 and step 6"* of `bookAppointment.ts`. But that file's own comments number **step 5 = `orderCandidates`** (line 252) — the call that now consumes `busy` — so the read cannot come after it. Your line 249 uses **arc42 §6.2's** numbering, where step 5 is `candidateResources` and step 6 is `orderCandidates` (`06-runtime-view.md:22-24`), and under that scheme the sentence is correct. Two numbering schemes, adjacent, neither named. Requested: state the read goes after `deriveInterval` and `candidateResources`, **before** the `orderCandidates` call, once per request, never inside `runAttemptLoop`.

## `O-19-1` · orchestrator · MAJOR · step 2

**The false claim AC-5 exists to correct appears in a third file AC-5 does not name.** `docs/arc42/06-runtime-view.md:3-4` opens §6.2 with: *"The same path when the dealership still has capacity — the reason a `409` means the dealership was full rather than the allocator guessed badly."* That is §4.1's sentence restated, and the executed measurement falsifies it identically. The design already declares §6.2 as touched, so the fix is in scope; what is missing is the criterion making it non-optional. Correct two of three instances and arc42 still contradicts itself after step 7 — the exact error you owned at step 1.

## `T-19-1` · test-engineer · MAJOR · step 2 — **the one I most want your independent judgement on**

**AC-3a as worded cannot be built black-box.** There is no synchronisation point between the occupancy read and the insert to pause on — unlike QS-5's per-row lock, which gives real racers a door to queue at — so real concurrency makes staleness only *probabilistic*, which is QS-16, not AC-3a. Two remedies offered:

1. **A seam**: one optional `busy?: OccupancySnapshot` on `bookAppointment`'s already-injectable `deps`, defaulting to the real read when absent, wired by an env var analogous to `BOOKING_SEED`. One field, inert by default. Its argued advantage: it also guards a `bookAppointment`-side wiring bug — such as `A-19-1`'s occupancy-vs-appointment-interval question — that AC-3b's isolated property test **structurally cannot see**.
2. **No seam**: rule AC-3a satisfied *jointly* by AC-3b (structural — `busy` never removes, for arbitrary including wrong content) and QS-16 (real staleness under real concurrency). No dedicated fixture.

The test-engineer states a mild preference for (1) and calls either legitimate. Note it **declined on its own initiative** to reach for a `dist/` direct call into `attemptLoop`/`appointmentRepository`, reasoning that ADR-0013's `dist/` seam is justified for `src/domain` because it is pure with no HTTP surface, and those modules are not. Weigh whether a test-only seam on a production `deps` object is a cost worth paying, and whether remedy 2 leaves `A-19-1` unguarded — if it does, say what does guard it.

## `T-19-2` · test-engineer · MAJOR · step 2

**QS-16's tuple set never pairs the most dangerous free-group size with the highest contention.** Your §8 argument is that risk scales with free-group size approaching the cap — worst-case additive bound ≈ `2M − 1`, so `M = 8` gives 15 against a cap of 16 — **combined** with how many racers pile onto the agreed order. The set pairs `M = 8` only with `N = 8`, where supply exactly meets demand. Proposed: add **`(20, 8, 4)`** alongside `(8, 8, 4)`, not instead of it — same `M = 8`, 20 racers, `min(N,M) = 8`, so 12 legitimate refusals expected and the falsifiable claim is that exactly 8 confirm. Argued: `(8,8,4)` is where a spurious refusal is most *visible*; `(20,8,4)` is where one is most likely to be *produced*.

## `T-19-3` · test-engineer · MAJOR · step 2 — self-disclosed

The test-engineer **ran `grep` against `src/main.ts` and `src/platform/config.ts`** while tracing `T-19-1`, and disclosed it unprompted rather than treating the silent success as permission. Facts I verified:

- The guard is not a wall and says so. `.claude/hooks/guard-paths.mjs` sets `READ_TOOLS = new Set(['Read'])`; its Bash branch tests only write-ish commands, so a read-only `grep` passes. The file's own header calls it *"a speed bump, not a wall"* and names the reviewer as defence in depth.
- **The read was materially void.** What leaked is that `BOOKING_SEED`/`BOOKING_ATTEMPT_CAP` are env-driven at the composition root — and `tests/support/service.ts:139,207,237` already carries that name, its semantics and its env wiring. It could see all of it legitimately.
- Second instance of the class. `T-15-1` was the first; the human recorded it at Gate E with no consequence and declined both a tooling read-guard and a re-authored red commit.

Rule provisionally — whether it taints the downstream work, and whether anything changes. The gate reviews it. Note the awkwardness plainly: remedy (1) of `T-19-1` is a seam proposal from a role that had just read the composition root, even though the proposal's stated derivation is `tests/support` and the shared scratchpad probe.

---

## Then, in the same run

Amend `19-design.md` and, if any ruling moves it, `docs/adr/0040-*.md`. §4: ADR-0040 is still `proposed`, so its *prose* is freely improvable; its Decision may still change because it is not yet accepted — say explicitly if you move it. **Do not touch `src/`, `tests/`, or arc42 §4.1/§6.2/§11 (step 7).** arc42 §10 is yours if a QS-16 ruling changes its tuple set.

Then commit — Conventional Commits, `docs(19): …`, with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run `npm run docs:check`, `docs:adr-check`, `docs:budget:check`, `log:check` and report results. Do NOT `git add` anything under `docs/team-log/` or `docs/DEFECTS.md` or `docs/STATUS.md` — the guard will refuse and they are mine.

## Report back

- One verdict per finding with reasoning, and for AC changes the exact new wording (I apply them).
- Whether ADR-0040's Decision moved, and if so what and why.
- A **short, self-contained** PR comment I can post verbatim under §9 — gloss every reference, assume the reader has not read the design.
- The commit sha.

Disagreement is expected and is not failure. Two of these five came from the orchestrator's own reading and one is the orchestrator's finding — none is owed deference.
