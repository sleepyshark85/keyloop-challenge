# Prompt · slice 08 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 4 green
- Sent: 2026-09-07T05:35:43.504Z

---

Slice 08 **step 4 — GREEN.** Branch `slice/08-availability-query`, PR **#17**. Pull first. The red is at `0c4ad4e`, observed red in CI: run 34087142178, `suite` FAIL, `red-proof` PASS, docs PASS. All six criteria fail at `404 /problems/route-not-found`.

**Your step-2 verdicts all stood**, including the consequence you found unprompted — that of ADR-0032's four options, **Option D is the only one that leaves the `appointment-table-access` marker's file list unchanged**, which is why the architect could discharge slice 05's inherited obligation by citation instead of a new criterion. AC-7 was withdrawn on that basis. **Six ACs.**

## Build

Per **ADR-0032**, Option D:

- `busyResources(db, dealershipId, from, to)` in **`src/persistence/appointmentRepository.ts`** — the bay ids and technician ids occupied over `[from, to)`, mirroring the exclusion constraint's own expression: overlap, `status <> 'cancelled'`, scoped by dealership. You verified this against `0003_appointment.sql`'s predicate at step 2.
- `src/application/queryAvailability.ts` — calls `busyResources` alongside `candidateResources` and subtracts. **`candidateResources` is not touched**, so the booking path still cannot see `appointment`, which is what keeps the check-then-act claim structural rather than conventional.
- The route. **AC-6's `to <= from` rides the outcome union as `malformed-window`**, mapped by the exhaustive switch — the shape `malformed-instant` already uses, as you established. Route-level, not schema-level: TypeBox cannot compare two properties.

**Do not build ADR-0033** — the advisory pre-filter is deferred to slice 09.

## One thing is genuinely undecided, and the test-engineer refused to decide it silently

**AC-5 requires the response *and* the OpenAPI description to carry two facts** — that a free result is not a reservation, and that it is true only of the interval queried. **The design's `AvailabilityOutcome` sketch has no such field.** So the test-engineer chose `advisory: true` plus a keyword-matched disclosure, and **recorded that assumption in the test file's header rather than deciding it silently** — which leaves you free to disagree.

You may not edit that test. If you think the wire shape should differ, **raise a DCR to me** (O-44: not to the architect directly, and a ruling from a dispatch that did not route through me is not in force until logged). If you agree, build to it and say so.

The OpenAPI half is **unasserted** — there is no `docs:openapi` script and no emitted document, the same reason QS-11's OpenAPI half is unasserted today. **Still write the description**; it simply cannot be tested yet. I have the architect ruling whether AC-5 is therefore half a criterion until slice 09, and will bring you the answer if it changes anything.

## Also note

The property test is committed as `availability-agrees-with-constraint.db.test.ts`, not the path arc42 §10.2 names — the `nodb`/`db` split gives no `globalSetup` to a plain `.test.ts` under `tests/property/`. Forced by the harness. Nothing for you to do; it is the architect's as-built correction.

**Non-negotiables.** §5: `src/` and `tests/unit/` only — `tests/acceptance/`, `tests/property/` and `tests/support/` are the test-engineer's. §7: every commit green and small. §2.1 is NON-NEGOTIABLE and this is the first slice whose subject is a read that only advises — the endpoint must not become a reservation by any path. Keep `lint:arch` and `typecheck` clean. **Do not run Stryker.**

**Post to PR #17** when green. Your agent definition now carries the rule as a generated block: short **and** self-contained, one italic framing line, gloss each reference as you use it.

**Report** the standard JSON, whether you accepted or disputed the `advisory` wire shape, your line count, and anything ADR-0032 did not compose as specified once written.
