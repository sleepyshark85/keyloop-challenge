# Prompt · slice 16 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 review remediation
- Sent: 2026-09-10T02:40:17.291Z

---

Step 5 remediation, slice **16**, branch `slice/16-availability-derives-its-own-window`, PR #24. The reviewer blocked the merge. One MAJOR and two MINOR findings are in your paths.

## MAJOR — availability's `500` arm is asserted by nothing, and it falsifies a ruling's premise

Delete `src/http/routes/availability.ts:225-228` — the `reference-data-invalid` arm — and **every test still passes**. The outcome falls through to `default:`, throws, and `src/http/server.ts:274-277` renders the same status, the same `type` *and* the same `title` for the escaped exception. AC-4's `500` case asserts only status and `type`, so it cannot tell the two apart. The reviewer checked: `tests/contract/error-taxonomy.test.ts` contains **zero occurrences of "availability"**.

That measurement falsifies design ruling 6's premise. The architect ruled `INTERNAL` may be rebuilt locally in `availability.ts` rather than shared, *because* `/problems/internal` is "duplicated by construction site and **held in agreement by the contract test**". For the two pre-existing sites that is true. For the new third site it is not — nothing holds it in agreement with anything.

**The failure this permits:** a handled, deliberate outcome silently becomes an escaped exception. The client sees an identical body, so no test and no consumer notices, while the service now emits an error log and an ERROR span (arc42 §8.4) for a condition it was designed to handle. The observability signal flips from "expected reference-data problem" to "unhandled crash" with the suite green.

**Remedy, which the reviewer says lives inside the existing design — no DCR:** add the contract-test row that makes the premise true. Assert availability's `500` in `tests/contract/error-taxonomy.test.ts` the way booking's is asserted, using the existing `seedScenario(client, name, { timeZone: 'Not/AZone' })` fixture you found at `:402-467`. Make it distinguish a handled arm from an escaped exception — if status/`type`/`title` are identical on the wire, find the thing that is not. **No mocks** — §2.2.

## MINOR — `F-16-1`'s residue is five live ADR-0032 citations, not three

`tests/property/availability-agrees-with-constraint.db.test.ts:91` was untouched and still cites the retired ADR **in the present tense**. You fixed lines 20 and 69 of that file and missed this one. Fix it. (Context: ADR-0032 has no file in `docs/adr/` at all — it was retired and folded into slice designs. The two in `src/persistence/appointmentRepository.ts` and one in `tests/unit/persistence/appointmentRepository.test.ts` stay with the booked sweep; those are not yours and not to be touched.)

## MINOR — four string literals in `availability.ts` are asserted by nothing

`src/http/routes/availability.ts:69,70,71` and `:84`. Both AC-7 and the implementer's unit test satisfy their two keyword checks from literal `68` alone, so **the staleness sentence `docs/WALKTHROUGH.md` quotes can vanish silently** and every test stays green. AC-7 is yours and exists precisely to stop the disclaimer being hollowed out. Strengthen it so each claim the disclaimer makes is separately asserted — a free result is not a reservation, and it is true only of the one interval named in that same response.

## Discipline

- Your paths only: `tests/contract/`, `tests/property/`, `tests/acceptance/`, `tests/performance/`, `tests/support/booking.ts`. **Do not touch `src/`** — you are describing what the code must do, not changing it. **Do not touch `tests/unit/`**; the implementer is deleting a test there concurrently.
- Do not touch `docs/`.
- These are additions to an already-green suite, so **your commits are green, not red** — the red commit for this slice is spent (`762f824`, certified by CI). Message shaped `test(16): …` without `(red)`.
- Run `npm test` before committing and confirm all three projects pass. Do not push.

Report each fix, the evidence that the new `500` assertion actually distinguishes a handled arm from an escaped exception — delete the arm locally and prove your test now fails, then restore it — and the final suite state.
