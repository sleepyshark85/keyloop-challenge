# Report · slice 02 · test-engineer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 step 3 RED
- Returned: 2026-09-05T18:35:33.343Z
- Duration: 3802s

---

Step 3 complete. Red committed at `34b057b`, observed failing in CI.

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 6, "contract": 7, "property": 17, "concurrency": 2, "architecture": 30, "integration": 1},
  "quality_scenarios_covered": ["QS-1", "QS-2", "QS-9", "QS-11", "QS-12"],
  "red_commit": "34b057b",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": "T-02-9",
  "message": "All 19 AC in one red commit; 27 failures across seven files, every one an assertion. Raising T-02-9: PostgreSQL refuses the losers with 40P01, not 23P01, in roughly one race in three, which design §2.6 maps to a 500 and would make AC-3 and AC-4 a coin toss."
}
```

## CI — the red, observed

Run [33984418682](https://github.com/sleepyshark85/keyloop-challenge/actions/runs/33984418682). No PR exists for slice 02 and the workflow fires on `pull_request` or `push: main`, so nothing had triggered; I dispatched `verify.yml` on the branch rather than open the PR, which is a slice-level artifact and not mine. `red-proof` verbatim:

> red observed: `ambiguity-containment`, `instant-bounds`, `local-midnight`, `book-appointment`, `no-bay-overlap`, `no-technician-overlap`, `error-taxonomy` failed, no unit test failed, and verify concluded success

`verify` success · `suite (Testcontainers)` failure · `red-proof` success. 291 tests, 27 failed, **0 non-assertion failures**, 0 under `tests/unit/`.

## Shape, file by file

| File | Covers |
|---|---|
| `tests/acceptance/book-appointment.test.ts` | AC-1, AC-2 (×2), AC-6, AC-19 + its control |
| `tests/contract/error-taxonomy.test.ts` | AC-7…AC-12 (AC-11 twice, both resources) · QS-11 |
| `tests/concurrency/no-bay-overlap.test.ts` | AC-3 · QS-1 |
| `tests/concurrency/no-technician-overlap.test.ts` | AC-4 · QS-2 |
| `tests/architecture/ambiguity-containment.test.ts` | AC-5 · QS-12 — 36→66 cases |
| `tests/property/instant-bounds.test.ts` | AC-13…AC-16 |
| `tests/property/local-midnight.test.ts` | AC-17, AC-18, P-M2 |
| `tests/integration/exclusion-constraint-adjudicates.test.ts` | §4.4 DDL-drop control |
| `tests/support/{booking,domain}.ts`, `service.ts` | fixtures, ADR-0013 seam, I-02-6's stdout observer |

## The three C1 exceptions, as they actually appear

- **AC-16** — red as a *caught* `RangeError`: `threw RangeError: Invalid time value` where `'returned'` was expected, then the `malformed-interval` assertion. Never escapes.
- **AC-18 / P-M3 / P-M2** — green, as negative controls should be. So is the DDL-drop control (it tests the constraint, which exists) and, unavoidably, **AC-14** — today's unbounded `instant()` already returns the bound. Its job is the mutants, not the red; that is a fourth green-at-red case and I am naming it rather than letting it look like coverage.
- **AC-19** — written end-to-end: a dealership seeded with `closes_at = '24:00:00'`, booked 23:00→24:00 local over HTTP, with a 17:00-closing control beside it so a green cannot come from hours being ignored.
- **AC-2's 404 trap** — asserts `application/problem+json` and `type`; Fastify's own not-found body carries neither.

## Mutants run, with kill counts

**Domain** (six, against a reference implementation written from arc42 §8.3 and the two ADRs, never `src/`; all 34 property tests including slice 01's QS-9 suite pass against it):

| Mutant | Killed by |
|---|---|
| `<=`→`<` on the bound | **2** — AC-14's `+MAX` and `−MAX` only |
| delete `Math.abs` | **3** — AC-13, "one ms beyond each bound", AC-15 |
| drop ADR-0014's bound from step 1 | **4** — all AC-16 cases |
| delete the ADR-0015 normalisation | **2** — AC-17 worked example, P-M1 |
| delete the "immediately following" clause | **2** — P-M2 only, **not** AC-17 (design §6.2's claim, now measured) |
| delete step 4 entirely | **8** — incl. slice 01's P1 and P6 |

**Markers** (seven): reverting to slice 01's `wall-clock-and-zone` kills **10** cases — that is E-02-2's measurement made executable; dropping `getTimezoneOffset` kills 2; dropping the `get*` form kills 3; reverting `appointment-table-access` to `/\bappointment\b/` kills 1; dropping comment-stripping kills 1; a fifth file added to `ZONE_TRANSPORT_FILES` kills 2 (set equality is load-bearing); widening the cast marker to the bare identifier kills 2 — **that one survived at first**, so I added the negative control it needed (the branded type must flow; only the cast is confined).

## The DCR — T-02-9

**Under N simultaneous inserts against one exclusion range, PostgreSQL refuses the losers with `40P01` (deadlock_detected) rather than `23P01`, all-or-nothing per race, in roughly one race in three — at every N from 2 to 20.** `check_exclusion_constraint` inserts the index tuple *then* scans, so simultaneous inserters wait on each other's in-progress tuples and form a cycle.

Exactly one row survives in every trial, so **§2.1 is untouched**. But design §2.6 classifies `40P01` as `other` ⇒ rethrow ⇒ `500`, so **AC-3's and AC-4's "the other 19 receive `409`" becomes a coin toss, and QS-1/QS-2 with them**. Measured remedies: naive retry clears 7 of 8 runs but one gave up after 8 attempts; **jittered retry (0–50 ms) is no better — 3 of 8 still exhausted 8 attempts**, because 50 ms is nothing against a 1 s `deadlock_timeout`. Neither ADR-0009's shuffle nor the in-scope loop helps: with one bay, every racer is in the same wait graph regardless of candidate order. Naming a resource from a deadlock is barred by ADR-0016 — the error carries no constraint. This needs the architect.

## Two smaller things

- **`zone-transport` set equality forces `deriveInterval.ts` to name its parameter `ianaZone`**, but design §2.5 sketches it as `zone`. Testable as specified, so no DCR — I implemented set equality as ruled and flagged the consequence in the test's own comment. One line either way.
- **Design §6.1's mutant table is slightly wrong**: "delete `Math.abs` → killed only by AC-14's negative bound". Measured, `instant(−MAX)` *survives* it (`−MAX <= MAX`); what kills it is a negative value *beyond* the bound. My tests kill it regardless.

I also corrected slice 01's `opening-hours-dst.test.ts` P1 oracle, which still stated the pre-ADR-0015 rule — a correct implementation of an accepted ADR would have failed a test the implementer may not edit. The successor test is local-calendar-date arithmetic, never `+ 86_400_000`.
