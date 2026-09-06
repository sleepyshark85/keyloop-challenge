# Prompt · slice 06 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 1 design
- Sent: 2026-09-06T12:29:38.837Z

---

Slice 06 step 1 — DESIGN. Branch `slice/06-reschedule-atomic-move`, checked out, off a `main` that carries slice 05 (merge f6d46bf). Read `docs/slices/06-reschedule-atomic-move.md` first: five ACs, `arc42: ["§5.2", "§6.3", "§8.2", "§8.6"]`, `quality_scenarios: [QS-6, QS-11]`, `adr: [3, 24]`, `loopbacks: 0`. `npm run slice:check 06` reports Definition of Ready fully green.

**This slice carries five inherited obligations — the largest load of the project — and its own file says so under "Inherited scope".** They are: the racing-moves concurrency test that ADR-0003's claim rests on; F-05-1's branded `ResourceLock`; ADR-0024's `setNotFoundHandler` plus the `/problems/route-not-found` row and the hostile-request corpus; `src/domain/appointment.ts`, which §5.2's as-built cell already names slice 06 as owning; and the Stryker exhaustiveness disables. Every one of them was ruled into this slice by a named finding, so none can be silently dropped.

**Your first and most valuable ruling may be that this is too much for one slice.** Five inherited obligations plus five ACs plus a new route, use case and `UPDATE` is a plausible slicing problem, and §6 says a slice needing three design changes is a slicing problem rather than a design problem — better named at step 1 than discovered at step 5 with two loopbacks spent. You own scope mid-slice under the standing delegation. If you re-defer any obligation, **name the destination slice explicitly in the ruling**, for the reason in the last section below.

**Four things to decide.**

1. **AC-4 and AC-5 cannot both be decided by the same zero-row result, and this is the sharpest thing in the slice.** AC-5 wants `404` for an unknown id "decided by the `UPDATE` affecting zero rows rather than by a preceding read". AC-4 wants `409 /problems/appointment-not-confirmed` for a cancelled one. If the `UPDATE`'s `WHERE` carries `status = 'confirmed'`, zero rows means *either* unknown *or* not-confirmed and the two are indistinguishable. Decide the shape. If it is a post-attempt read that disambiguates, rule explicitly whether a read *after* a failed write is check-then-act under §2.1 — it is NON-NEGOTIABLE and the answer looks obvious in both directions, so state the reason rather than the conclusion.

2. **AC-1's self-overlap must be explained, not merely observed.** A move from `[09:00,10:00)` to `[09:15,10:15)` overlaps the interval it replaces, and the criterion says no `23P01` is raised. Record *why* PostgreSQL's exclusion-constraint check does not see the row's own prior version, at the level of the mechanism. A test that passes empirically without a stated mechanism cannot tell a genuine pass from a constraint that silently stopped being checked — and QS-11 is on this slice.

3. **AC-2 — "exactly one statement modified it: a single `UPDATE`" — needs an assertable form.** The slice's own Definition of Done says the reviewer reads the generated SQL because this is "the criterion most easily satisfied by a test that passes for the wrong reason". Say what would actually falsify it and who asserts it. A `DELETE`-then-`INSERT` that produces the same final row must fail; decide the mechanism that makes it fail.

4. **ADR-0024's two warnings were ruled at slice 05 step 5 so they are not rediscovered here.** Registering `setNotFoundHandler` breaks the media-type half of AC-4's vacuity guard at `tests/contract/cancel-appointment.test.ts:247`, which is test-engineer-owned under §5 — the design must route that, not fix it. And `src/http/problem.ts` sits at exactly §10's 0.75 threshold with three survivors while this slice changes the taxonomy twice, so one new survivor puts it under its own Definition of Done. Decide whether that is prevented, budgeted for, or accepted with a named remedy.

**Standing context you should use rather than rediscover.** Slice 05 merged with ADR-0023 (a write leaving the constraints' scope takes no lock) and ADR-0024 (the taxonomy's residual is a property, not a row) accepted; §8.6 now states the invariant that every response ≥400 is `application/problem+json` with a type from the closed set, and `tests/contract/error-taxonomy.test.ts:57` holds that closed set as a seven-row list. §6.1 records, as measured fact since slice 05, that only the constraint makes overlap unrepresentable. R-05-7 was routed here as a named warning about `problem.ts`, and A-05-6 landed in slice 07.

**One thing is moving under you, from me.** I am concurrently landing the four-part enforcement check A-05-5 ruled and O-37 made a fourth repetition of: `deferred_to` on every deferred ruling, an `inherits:` list in each slice's front matter, `slice:check` failing READY when refs deferred to an id are not a subset of its `inherits`, and `docs:adr-check` refusing an ADR whose Decision names a slice destination with no matching `deferred_to` event. So: **do not hand-edit `inherits:` in any slice front matter — tell me in your report what belongs there instead**, and expect every deferral you rule to require a named destination slice. If you think the specified check is wrong, say so; the architect who specified it is you, one slice ago, and A-05-5's own ruling says the honest alternative to building it is an ADR superseding ADR-0019.

**Under the standing delegation nothing escalates mid-slice** — you decide scope, AC and QS between steps 1 and 5, each ruling recorded and provisional until the gate.

**Constraints.** Word budget: the in-flight design ceiling is 3,000 words; slice 05's design was deliberately shrunk to ~1,200 as an as-built record, and slice 04's ran to 2,931 with 69 to spare, which was tight enough to matter. `npm run docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check` and `npm run test:tools` all stay green. ADR if a decision is needed; accepted ADRs are immutable — supersede, never edit. No `src/`, no `tests/`, no `tools/`. Commit `docs(06):`.

**Report** the standard architect JSON, plus your answers to the four decisions, your scope ruling on the five inherited obligations with a destination named for each re-deferral, what belongs in slice 06's `inherits:` front matter, and — separately — anything you found that this did not ask about. That last section has been the most valuable part of every report for three slices running.
