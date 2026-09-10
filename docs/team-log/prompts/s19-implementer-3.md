# Prompt · slice 19 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Remedy R-19-1, R-19-2, R-19-3
- Sent: 2026-09-10T12:01:04.831Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **Step 5 review is in. Three MAJOR findings are yours.** `git pull` first.

The reviewer **did not block**. Mutation 0.9091 overall, every changed file above the 0.75 threshold (`candidates.ts` 0.8980, `bookAppointment.ts` 0.9327, `attemptLoop.ts` 0.8986, `rescheduleAppointment.ts` 0.9036). Layering clean, ownership clean, §2.1 holds. It also **discharged `T-19-4` by measurement rather than accepting your reasoning** — it hand-mutated compiled `dist/domain/candidates.js` into `Filter-1` (filter instead of permute) and into the per-group `freeHead === undefined` bug, and P8/P9/P10 fail against both. Your `56269be` line count was ruled acceptable: 93 lines are `src/`, the rest are unit tests §7 requires to land with the code they drive.

## `R-19-1` · MAJOR · `src/application/attemptLoop.ts:197`

**Ruling 5's `strategy.busy` threading is asserted by nothing — deleting it leaves the whole suite green.** Stryker's `ConditionalExpression → false` on that ternary **survived**. Forcing it to `EMPTY_OCCUPANCY` passes 730/730 nodb tests, *including `tests/unit/application/attemptLoop.test.ts:298`, the test written for this line.*

Why it slips: that fixture uses `drawSeed: () => 1`, and `orderCandidates(['bay-0','bay-1'], ['tech-0'], EMPTY_OCCUPANCY, 1).bays` is already `["bay-1","bay-0"]` — the blind order and the free-first order coincide there, so the test cannot tell them apart.

**Reviewer's remedy, measured to discriminate: `drawSeed: () => 0`.** Verify that yourself rather than taking it — confirm seed 0 actually separates the two orders, and that the mutant dies afterwards. This matters beyond tidiness: when §11.1's reschedule-snapshot debt is discharged, a real snapshot would be silently discarded.

## `R-19-2` · MAJOR · `tests/unit/domain/candidates.test.ts:178`

The test titled *"P4 — `busy = EMPTY_OCCUPANCY` reproduces the pre-slice-19 order **element-for-element**"* asserts only `withBusy.bays.length === 8` and `.technicians.length === 8` — **which pre-existing property P2 already guarantees.** The title claims element-for-element; the body checks lengths.

The element-for-element assertion against a reference `mulberry32` stream was **proposed by the test-engineer at step 2 and commissioned in your own dispatch** ("the `EMPTY_OCCUPANCY` element-for-element identity you proposed"), then substituted with an argument that was never ruled.

Measured mutant: in `candidates.ts`, `ids.filter(…)` → `[...ids].reverse().filter(…)`. Design §4 **P4 is destroyed** and the suite stays **green** — 730/730 nodb, plus `candidate-retry` and `telemetry-booking` 23/23.

Your file header argues a reference comparison is *"neither necessary nor possible from outside"*. The reviewer says that is **false on *possible***: `src/domain` imports nothing, so restating the six-line generator in the test is legitimate — the same technique `tests/property/candidate-ordering.test.ts` and the scratchpad probe both already use.

**If you still disagree that the reference comparison belongs, say so and argue it — do not concede to close a finding.** But then you owe an assertion that kills the reverse-filter mutant, because P4 is a design property with a criterion (AC-7) pointing at it. Either way, report which you did.

## `R-19-3` · MAJOR · `src/persistence/appointmentRepository.ts:558-560`

`busyResources`'s *"ADVISORY, STRUCTURALLY"* docblock says `bookAppointment.ts` and `rescheduleAppointment.ts` *"call `candidateResources` and `lockResources`/`insertAppointment`, never this"*. **False as of `bookAppointment.ts:258`.** A reader auditing §2.1 reads that claim and stops looking, while the booking path calls it once per request.

Comment-only. The sentence's *point* survives — the result still never reaches an `INSERT` — only its enumeration is wrong. Keep the structural argument; fix the fact.

## Boundaries

`tests/unit/` is yours. **Do not touch** `tests/acceptance|contract|property|concurrency|architecture|performance|integration` — `R-19-4` and `R-19-7` in `tests/integration/telemetry-booking.test.ts` are the test-engineer's and are being dispatched in parallel. **Do not `git add`** `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md`.

## Commit and verify

Small, green, `fix(19):` or `test(19):`. Footer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Before finishing: `npm run typecheck`, `npm run lint:arch`, full `npm test`, and **re-run mutation on the files you touched** — I want the two named survivors (`attemptLoop.ts:197`'s ternary, and the reverse-filter mutant) shown dead by measurement, not asserted. Push.

Report: per finding, what you changed and the measurement that shows the mutant now dies; any finding you dispute and why.
