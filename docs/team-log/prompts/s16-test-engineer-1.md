# Prompt · slice 16 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 step 2 review
- Sent: 2026-09-10T01:09:38.633Z

---

Step 2 (AGREE) for slice **16**, branch `slice/16-availability-derives-its-own-window`. You are the test-engineer. **Review the design and reply — do not write a single test yet, and do not edit any file.** Step 3 comes after this.

Read, in this order:
- `docs/slices/16-availability-derives-its-own-window.md` (the slice, 7 ACs)
- `docs/adr/0039-availability-takes-a-start-not-a-window.md` (proposed)
- `docs/slices/16-design.md` (the architect's reasoning and its five rulings)
- `docs/slices/08-availability-query.md` — the slice this amends; its AC-1 is QS-8 and its six mechanics are the thing being carried forward
- the existing `tests/property/` file for QS-8, and `tests/performance/` for QS-14

## Background

`GET /availability` requires the client to send `from` and `to` while already receiving `serviceTypeId`. The human found the consequence at a terminal on 2026-09-10: with an appointment occupying 09:30–10:30 and a 60-minute service type, `from=09:00&to=09:30` reports the bay FREE and `POST /appointments startsAt=09:00` answers `409`. The slice makes availability take `startsAt` and derive its own window by calling `deriveInterval` — the booking path's function, unedited — and name the derived interval in its own `200`.

## What I need from you, per CLAUDE.md §6's adjudication convention

A verdict per item — **AGREE** or **DISAGREE** — each with reasoning. §6 point 3 is explicit that disagreement is expected and that a round which produces none reads as deference. Do not manufacture objections either; if an item is right, say so and say why.

1. **AC-5 / QS-8, the amendment that matters.** The probe interval must be **read from the `200` response and never recomputed by the test**, while the *generator* may use the fixture's declared duration to aim appointments at the boundaries. Is that separation actually implementable in the property as it stands, and does it preserve slice 08's six mechanics — savepoint isolation, exclusion-violation-exactly, the two directions counted apart, boundary bias, the cancelled witness, the confirmed:cancelled ratio? Name any mechanic that stops working when `to` stops being generated.
2. **The architect states plainly that QS-8 can no longer catch a wrong window** — a server deriving 30 minutes for a 60-minute service would be probed over 30 minutes and pass — and assigns that job to **AC-2** (the `200` and the `201` must name string-equal `startsAt`/`endsAt`). Is AC-2 sufficient for that, and is it falsifiable as written? If a single mutant could survive both AC-2 and AC-5, name it.
3. **AC-4's precedence clause.** It requires availability and booking to answer the *same status and same `type`* for five shared failures, and to agree on precedence: `{unknown dealership + unusable startsAt}` must answer `422` from both. Is every one of those five reachable from a test, in particular `500 /problems/internal` via "a dealership whose opening-hours reference data cannot be read"? If one is not reachable without mocking the database — which §2.2 forbids — say so now rather than at step 3.
4. **AC-6 / QS-14.** The performance scenario's one-day query becomes a derived-window query against the unchanged fixture and the unchanged 200 ms budget, with the measured p95 to be recorded at step 7. Is measuring against a budget the architect concedes is now loose worth doing, and is "record the number" a criterion you can fail?
5. **The red set.** The slice requires **AC-1 through AC-6 to all fail in one red commit**, with AC-7 the named exception. Is that achievable in a single commit given these tests span `tests/acceptance/`, `tests/contract/`, `tests/property/` and `tests/performance/`? Flag any AC that cannot be made to fail red for the right reason — a test that fails because a parameter does not exist yet is fine; one that fails because the file does not compile is not.
6. **Anything the ACs leave ambiguous enough that you would have to guess.** §6 step 2 exists precisely so that ambiguity surfaces here rather than at step 5.

Also relevant: `F-16-1` records ten live citations of the retired ADR-0032, seven of them in `tests/` — yours. The design asks each role to fix only the ones in files it is already rewriting. Confirm that is workable or object.

Report back your verdicts and reasoning. If you disagree with something, the architect gets one answer round and may call a vote per §6. Commit nothing.
