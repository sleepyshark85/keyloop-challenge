# Report · slice 16 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 16 review
- Returned: 2026-09-10T02:39:03.502Z
- Duration: 998s

---

Review complete. **Outcome: changes-requested** — I do not clear the merge yet. Posted to PR #24: https://github.com/sleepyshark85/keyloop-challenge/pull/24#issuecomment-5611824167

## What I verified, as asked

**1. The central claim holds.** `git diff 3819edb..HEAD -- src/application/deriveInterval.ts` is empty — the file is byte-identical. `/home/agentadmin/sources/keyloop-challenge/src/application/queryAvailability.ts` contains no duration arithmetic at all: it calls `deriveInterval(query.startsAtMillis, serviceType, dealership)` and consumes only `derivation.startsAt/endsAt/occupancyStartsAt/occupancyEndsAt`. Statement order matches `bookAppointment.ts:213,216,220,250` exactly. ADR-0039's option D is what shipped.

**2. AC-2 is a real assertion.** `tests/acceptance/availability.test.ts:263-272` compares `member(availabilityAnswer,'startsAt')` against `member(bookingAnswer,'startsAt')` — two live responses, no recomputation. It cannot pass vacuously: AC-7 at `:481-489` requires both to be `string`.

**3. Mutation: 0.8478 on the changed files** (78 killed, 14 survived), above §10's 0.75. `T-16-1`'s equivalent mutant was correctly predicted — Stryker synthesised no occupancy↔appointment swap.

**4–8.** §5 ownership clean both directions; exactly one red commit, and §2.4's red *was* observed and certified in CI (log `s-16-red-proof`, run 34427199266); `I-16-1` exact (`appointments.ts` diff is one keyword); `lint:arch`/depcruise clean, `ambiguity-containment.test.ts` unchanged, no `ianaZone` in `queryAvailability.ts`; OpenAPI byte-exact, three params. `npm test` exit 0 (34/27/1), verified myself.

## Findings

**MAJOR — §7: neither implementer commit is green on its own.** `2601410`: `tsc -p tsconfig.build.json` exits 2 — `src/http/routes/availability.ts:172` still passes `fromMillis`, `:185` switches on the deleted `malformed-window`. Since `pretest` is `build`, `npm test` never reaches a test. `7d572d8`: builds, but `npm run docs:openapi -- --check` exits 1 (regenerated only at `b6c1eac`), which `tests/contract/openapi-document.test.ts:245` asserts must be 0. Green first arrives at a `docs(16):` commit. Slice 14's `63e0922` typechecks clean, so this is a regression against the branch's own standard, and the remedy is history-only on an unmerged branch.

**MAJOR — the `T-16-1` unit test contradicts ruling 8.** `tests/unit/application/queryAvailability.test.ts:225-239` exists despite "No test and no Stryker directive", and hard-codes `STARTS_AT_MILLIS + 3_600_000` — the *appointment* interval. Swap `occupancyStartsAt/EndsAt` for `startsAt/endsAt` in the source and it stays green. Scenario: when A-4 is lifted and `occupancyInterval` adds a buffer, this test fails against *correct* code; its name says it guards the distinction, so the cheapest fix reads as "pass the appointment interval" — silently dropping the buffer from the availability read while booking keeps it, reinstating the exact defect this slice closed.

**MAJOR — availability's `500` arm is asserted by nothing.** Delete `src/http/routes/availability.ts:225-228` and the outcome falls to `default:`, throws, and `src/http/server.ts:274-277` sends the same status, `type` *and* `title`. AC-4's 500 case asserts only status and `type`; `tests/contract/error-taxonomy.test.ts` has zero occurrences of "availability". So design ruling 6's premise — that the third `/problems/internal` site is "held in agreement by the contract test" — is measurably false. A handled outcome becomes an escaped exception (error log + ERROR span, §8.4) with the suite green.

**MINOR ×3** — AC-3 names four problem types but the document, ruling 6 and `openapi-document.test.ts:348` all say three (`/problems/internal` is declared by no operation repo-wide); `F-16-1`'s residue is five live ADR-0032 citations, not three (`tests/property/availability-agrees-with-constraint.db.test.ts:91` was untouched and still cites it in the present tense); and four string literals are unasserted anywhere — `availability.ts:69,70,71` (both AC-7 and the unit test satisfy their two keyword checks from literal 68 alone, so the staleness sentence the WALKTHROUGH quotes can vanish silently) and `:84`.

**No DCR raised.** MAJOR-3 pressures ruling 6's premise, but the remedy — a contract-test row — lives inside the existing design. AC-3's wording is the architect's to correct under outcome (a); I am not asking for a `500` entry.

Two process gaps outside the diff, for the orchestrator: `slice:check 16` fails "test-first proven" only because no *passing* CI run has been collected since `762f824`, and "reasoning is on the PR" — before my comment, PR #24 carried no attributed comment from architect, implementer, scribe or test-engineer.
