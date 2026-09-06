---
id: "05"
title: Cancellation — and the proof at the edge that both constraints release
status: ready
depends_on: ["04"]
arc42: ["§5.2", "§6.4", "§6.6", "§8.6", "§10", "§11"]   # §6.6 and §8.6 amended at step 2
adr: [3, 23, 24]
quality_scenarios: [QS-7]
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
                     # step 5: REVOKED — seven open MAJORs (05-design.md §2 D4)
---

## Goal

`POST /appointments/{id}/cancellation` moves an appointment to `cancelled`, and the slot it held
becomes bookable. A sub-resource rather than `DELETE`, because the appointment remains readable at
its URL afterwards — which `DELETE` would misdescribe.

Slice 00 already guards the clause definitionally and behaviourally **on the bay side**. What AC-1
adds is the **technician** side behaviourally — nothing else anywhere asserts that constraint
releases — and an attribution: the candidate list carries no availability filter, so it is identical
before and after the cancel, and the only thing that moved between the `409` and the `201` is the
constraint's verdict. (`05-design.md` §1, corrected at step 2 and again at step 5 by measurement.)

## Acceptance criteria

- **AC-1** — Given appointment A confirmed `[09:00, 10:00)` in the only bay, and a second booking for
  that interval refused with `409`, when A is cancelled, then the same booking **succeeds**. *(QS-7)*
- **AC-2** — Given A has been cancelled, when `GET /appointments/{id}` is requested, then `200` is
  returned with `status: cancelled` — it is not a `404`.
- **AC-3** — Given A has been cancelled, when it is cancelled again, then `200` is returned and
  nothing changes. Cancellation is idempotent (§8.6). Asserted in **two places**, because one cannot
  reach it: the contract test takes the `200` and the identical body; the integration test takes
  `to_jsonb(appointment)` equality across the replay, which is the only assertion that distinguishes
  the designed statement from the `updated_at = now()` it rejects. *(A-05-1, amended at step 2.)*
- **AC-4** — Given an unknown id, when cancellation is requested, then `404` with
  `type=/problems/appointment-not-found`.
- **AC-5** *(added at step 2 — measured twice, independently, by both reviewing roles)* — Given
  `Content-Type: application/json` with **no body**, and given the same header with an **unparseable**
  body, when either request is made to the cancellation route **or to `POST /appointments`**, then
  `400` with `type=/problems/malformed-request` is returned — **not** the `500 /problems/internal`
  returned today. §8.6 gains no row for it. *(Step 5: it keeps two thirds of that claim — ADR-0024
  measured two responses still outside the taxonomy and rules them into slice 06.)*

## In scope

- The cancel route, use case and `UPDATE`.
- **`src/http/server.ts`** — AC-5's one predicate. The only line in this slice that changes behaviour
  on an already-merged route, which is why the gate must exercise it.
- `tests/integration/cancellation-releases-slot.test.ts`.
- `tests/concurrency/cancellation-takes-no-lock.test.ts` — a scope ruling, **respecified at step 2**
  so it can fail for the reason it exists: the discriminating case holds the bay advisory lock in a
  second session, with a booking control and a release witness (`05-design.md` §5).
- **Added at step 5 — the two controls ADR-0019 deferred into this slice and nobody built.**
  - **R-02-2 · phase 4 of `tests/integration/exclusion-constraint-adjudicates.test.ts`.** The
    existing `race()` helper and phase 2's dropped constraint, with each racing insert wrapped in
    ADR-0018's two advisory locks **hand-written** (class constant, `hashtext`; a
    `tests/integration/` file may not import `src/`, and the divergence is residue the concurrency
    tests bound). Expect **twenty overlapping rows** — the matrix's fourth cell, and the one sentence
    it cannot otherwise say: *the lock cannot replace the constraint.* Test-engineer's.
  - **R-02-3 · one case in `tests/unit/http/appointments.test.ts`.** Stub `readAppointment` with a
    `found` view carrying a member the contract does not declare (an `as` cast — no production path
    reaches that state, which is what the guard is for) and assert the `200` body carries exactly the
    ten schema members. Measured against `dist/`: it does today, and with the `response` map absent
    Fastify installs no serializer and emits the extra members. That kills `appointments.ts:210:19`,
    surviving since slice 02. Implementer's, and it asserts a real property — **the response schema
    is an output whitelist**, not merely a document.

## Out of scope

- Cancellation windows, fees, notification, or any record of *who* cancelled — ADR-0002 puts actors
  and audit out of scope, and §11 carries it.
- Restoring a cancelled appointment. Not in the brief; a fresh booking is the path back.
- **F-05-1's structural remedy** — a branded `ResourceLock` on `insertAppointment`. **Owned by slice
  06** and written into `06-reschedule-atomic-move.md`, which writes a new locking path and so makes
  the control stronger rather than merely later (ADR-0019). Until then the rule is enforced by review.
- **Empty body on a bodyless route answering `200` rather than `400`** — OQ-05-2, re-routed at step 5
  to **slice 09** (slice 10 is a tombstone) and written into `09-observability.md` as AC-6b.
- **`setNotFoundHandler` and the `404 /problems/route-not-found` row** — [ADR-0024](../adr/0024-the-error-taxonomys-residual-is-a-property-not-a-row.md),
  ruled here and **built at slice 06**, because registering it breaks the media-type half of AC-4's
  vacuity guard and this step has no test-engineer round left to re-derive it.

## Definition of done

Beyond `CLAUDE.md` §10:

- The freed-slot assertion books **through the API** rather than inserting directly, so it proves the
  released slot over the whole path — allocation, ADR-0004's retry, and the constraint's verdict —
  rather than at the SQL level slice 00 already covers.
- **Step-7 arc42 edits, ruled now so step 7 executes rather than decides:** §6.4 takes D1's statement
  and the sentence that a replay advances `xmin` while changing no column; §6.6 gains one sentence on
  its **two** rows reading *"the `UPDATE`'s 0 rows"* — slice 05 makes the first unambiguous, and the
  second is slice 06's, where a guarded `WHERE id = $1 AND status = 'confirmed'` reproduces exactly
  the ambiguity D1 rejects and needs the follow-up read §6.3 already names; §5.2 loses its prediction
  of `src/domain/appointment.ts`; §11 gains F-05-1, OQ-05-2, F-02-9's narrowed wording, ADR-0024's
  shipped second exit, and **ADR-0019's criterion measured 0-for-2 on its own premises at its first
  destination** — the row that decides whether it is superseded or enforced.
