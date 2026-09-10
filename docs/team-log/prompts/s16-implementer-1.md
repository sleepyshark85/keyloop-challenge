# Prompt · slice 16 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 step 2 review
- Sent: 2026-09-10T01:09:57.456Z

---

Step 2 (AGREE) for slice **16**, branch `slice/16-availability-derives-its-own-window`. You are the implementer. **Review the design and reply — write no production code, no unit tests, and edit no file.** Step 4 comes later, after the test-engineer's red commit.

Read, in this order:
- `docs/slices/16-availability-derives-its-own-window.md` (the slice, 7 ACs)
- `docs/adr/0039-availability-takes-a-start-not-a-window.md` (proposed)
- `docs/slices/16-design.md` (the architect's reasoning and its five rulings)
- `src/application/queryAvailability.ts`, `src/application/deriveInterval.ts`, `src/application/bookAppointment.ts`, `src/http/routes/availability.ts`, `src/http/routes/appointments.ts`, `src/http/problem.ts`

## Background

`GET /availability` requires the client to send `from` and `to` while already receiving `serviceTypeId`. The human found the consequence at a terminal on 2026-09-10: with an appointment occupying 09:30–10:30 and a 60-minute service type, `from=09:00&to=09:30` reports the bay FREE and `POST /appointments startsAt=09:00` answers `409`. The slice makes availability take `startsAt` and derive its own window by calling `deriveInterval` — unedited — and name the derived interval in its own `200`.

## What I need from you, per CLAUDE.md §6's adjudication convention

A verdict per item — **AGREE** or **DISAGREE** — each with reasoning. §6 point 3 is explicit that disagreement is expected and that a round producing none reads as deference. Do not manufacture objections; where an item is right, say so and say why.

1. **The central claim: `deriveInterval` is reused unedited.** Check its actual signature and outcome union against what `queryAvailability` would need. The architect's ruling 5 says the opening-hours gate comes along *for free* and that excluding it would be the more expensive option, because `deriveInterval` returns `outside-opening-hours` with no interval attached — so skipping the gate would mean either a second derivation or changing that function's signature. Verify that against the code. If `deriveInterval` cannot in fact be called from `queryAvailability` without editing it, say so now — it would take the ADR's chosen option apart.
2. **AC-4's precedence clause.** Availability currently validates the window *first* (`queryAvailability.ts` step 1) and reference data second, so `{unknown dealership + garbage startsAt}` answers `400` where booking answers `422`. AC-4 requires both to answer `422`. Confirm the statement order can be reordered to match the booking path without breaking anything the existing tests pin — and say what else moves when it is.
3. **AC-3's contract requirement**: the emitted `docs/api/openapi.json` must declare exactly three query parameters and no `from`/`to`, and a request carrying `from`/`to` but no `startsAt` must answer `400 /problems/malformed-request`. Given the TypeBox querystring schema and how Fastify handles unknown query parameters today, is that the behaviour you get by default or does it need something explicit? Say which.
4. **The `zone-transport` marker.** The slice's Definition of Done requires its four-file list to be **unchanged** — `queryAvailability.ts` must pass the dealership as one value and never name `ianaZone`. Check `tests/architecture/ambiguity-containment.test.ts` and confirm calling `deriveInterval` from `queryAvailability` does not add a file to that marker. This is a QS-12 control you cannot relax and must not trip.
5. **The response shape change.** The `200` gains `startsAt` and `endsAt`. Confirm nothing else consumes `AvailabilityView` in a way that breaks, and that the outcome union collapse (`malformed-window` gone, replaced by the booking path's rows) leaves the route's `switch` exhaustive.
6. **Anything the design leaves ambiguous enough that you would have to guess.** §6 step 2 exists so ambiguity surfaces here and not at step 5, where it costs a full cycle.

Also relevant: `F-16-1` records ten live citations of the retired ADR-0032 — `src/application/queryAvailability.ts` and `src/persistence/appointmentRepository.ts` (×2) are yours. The design asks you to fix only the ones in files you are already rewriting. Confirm that is workable or object.

Report back your verdicts and reasoning. If you disagree, the architect gets one answer round and may call a vote per §6. Commit nothing, and remember §5: `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/performance/` are not yours to touch at any point in this slice.
